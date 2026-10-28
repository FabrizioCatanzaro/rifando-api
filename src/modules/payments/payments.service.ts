import crypto from 'crypto';
import { db } from '../../db/client';
import { env } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';
import type { MercadopagoPaymentOutcome } from '../../types/db';
import { decryptSecret, encryptSecret } from '../../utils/crypto';
import { logger } from '../../utils/logger';
import type { MercadoPagoPaymentNotice } from '../../utils/mailer';
import {
  MP_AUTH_URL,
  MercadoPagoApiError,
  createPreference,
  exchangeAuthorizationCode,
  getPayment,
  refreshAccessToken,
  verifyWebhookSignature,
  type MpPayment,
  type MpTokenResponse,
} from '../../utils/mercadopago';
import { notifyMercadoPagoPayment } from '../../utils/notifier';
import { roundMoney } from '../../utils/pricing';
import { markPurchaseSold } from '../numbers/numbers.service';
import type { CheckoutStatusInput } from './payments.schemas';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutos
// Renueva el token si le quedan menos de 7 días (dura 180).
const TOKEN_REFRESH_MARGIN_MS = 7 * 24 * 60 * 60 * 1000;
// La preferencia vence antes que la reserva: un pago no puede empezar sobre una reserva por vencer.
const PREFERENCE_SAFETY_MS = 3 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ─── Configuración ───────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return !!(
    env.MERCADOPAGO_CLIENT_ID &&
    env.MERCADOPAGO_CLIENT_SECRET &&
    env.MERCADOPAGO_TOKEN_KEY &&
    env.API_PUBLIC_URL
  );
}

function getConfig() {
  if (!isConfigured()) throw new AppError('Mercado Pago no está configurado', 503);
  const apiUrl = env.API_PUBLIC_URL!.replace(/\/$/, '');
  return {
    app: {
      clientId: env.MERCADOPAGO_CLIENT_ID!,
      clientSecret: env.MERCADOPAGO_CLIENT_SECRET!,
    },
    tokenKey: env.MERCADOPAGO_TOKEN_KEY!,
    apiUrl,
    redirectUri: `${apiUrl}/api/payments/mp/callback`,
  };
}

// ─── Vinculación (OAuth) ─────────────────────────────────────────────────────

/** Genera la URL de autorización con un state de un solo uso. */
export async function createAuthorizationUrl(userId: string) {
  const cfg = getConfig();
  const state = crypto.randomBytes(24).toString('hex');

  await db
    .updateTable('users')
    .set({
      mp_oauth_state: state,
      mp_oauth_state_expires_at: new Date(Date.now() + OAUTH_STATE_TTL_MS),
      updated_at: new Date(),
    })
    .where('id', '=', userId)
    .execute();

  const url = new URL(MP_AUTH_URL);
  url.searchParams.set('client_id', cfg.app.clientId);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('platform_id', 'mp');
  url.searchParams.set('state', state);
  url.searchParams.set('redirect_uri', cfg.redirectUri);

  return { url: url.toString() };
}

async function saveTokens(userId: string, tokens: MpTokenResponse, tokenKey: string) {
  const now = new Date();
  const values = {
    mp_user_id: tokens.user_id,
    access_token: encryptSecret(tokens.access_token, tokenKey),
    refresh_token: encryptSecret(tokens.refresh_token, tokenKey),
    public_key: tokens.public_key ?? null,
    live_mode: tokens.live_mode ?? true,
    expires_at: new Date(now.getTime() + tokens.expires_in * 1000),
    updated_at: now,
  };

  await db
    .insertInto('mercadopago_accounts')
    .values({ user_id: userId, ...values })
    .onConflict((oc) => oc.column('user_id').doUpdateSet(values))
    .execute();
}

/** Intercambia el code de OAuth por tokens y los guarda cifrados. */
export async function completeAuthorization(code: string, state: string) {
  const cfg = getConfig();

  // El state es de un solo uso: se consume en una sola sentencia antes del intercambio.
  const user = await db
    .updateTable('users')
    .set({ mp_oauth_state: null, mp_oauth_state_expires_at: null })
    .where('mp_oauth_state', '=', state)
    .where('mp_oauth_state_expires_at', '>', new Date())
    .returning('id')
    .executeTakeFirst();

  if (!user) throw new AppError('El enlace de vinculación venció. Probá de nuevo.', 400);

  let tokens: MpTokenResponse;
  try {
    tokens = await exchangeAuthorizationCode(cfg.app, code, cfg.redirectUri);
  } catch (err) {
    logger.warn({ err }, 'Mercado Pago: falló el intercambio del code de OAuth');
    throw new AppError('Mercado Pago rechazó la vinculación. Probá de nuevo.', 502);
  }

  const taken = await db
    .selectFrom('mercadopago_accounts')
    .select('user_id')
    .where('mp_user_id', '=', tokens.user_id)
    .where('user_id', '!=', user.id)
    .executeTakeFirst();
  if (taken) {
    throw new AppError('Esa cuenta de Mercado Pago ya está vinculada a otro usuario de Rifando', 409);
  }

  await saveTokens(user.id, tokens, cfg.tokenKey);
}

export async function getStatus(userId: string) {
  const account = await db
    .selectFrom('mercadopago_accounts')
    .select(['live_mode', 'created_at'])
    .where('user_id', '=', userId)
    .executeTakeFirst();

  return {
    configured: isConfigured(),
    linked: !!account,
    live_mode: account?.live_mode ?? null,
    linked_at: account?.created_at ?? null,
  };
}

export async function unlink(userId: string) {
  const [{ count }] = await db
    .selectFrom('raffles')
    .select((eb) => eb.fn.countAll<number>().as('count'))
    .where('user_id', '=', userId)
    .where('confirmation_method', '=', 'mercadopago')
    .where('status', 'in', ['draft', 'active'])
    .execute();

  if (Number(count) > 0) {
    throw new AppError(
      'Tenés rifas que cobran con Mercado Pago. Cambiá su método de cobro antes de desvincular.',
      409
    );
  }

  const [{ pending }] = await db
    .selectFrom('purchases')
    .innerJoin('raffles', 'raffles.id', 'purchases.raffle_id')
    .select((eb) => eb.fn.countAll<number>().as('pending'))
    .where('raffles.user_id', '=', userId)
    .where('purchases.status', '=', 'pending')
    .where('purchases.mp_preference_id', 'is not', null)
    .where('purchases.expires_at', '>', new Date())
    .execute();

  if (Number(pending) > 0) {
    throw new AppError('Hay compradores pagando con Mercado Pago. Probá de nuevo en unos minutos.', 409);
  }

  await db.deleteFrom('mercadopago_accounts').where('user_id', '=', userId).execute();
}

/** Devuelve un access token vigente del rifante. Lo renueva si está por vencer. */
async function getAccessToken(userId: string): Promise<string> {
  const cfg = getConfig();
  const account = await db
    .selectFrom('mercadopago_accounts')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (!account) throw new AppError('El organizador no tiene Mercado Pago vinculado', 409);

  const relink = new AppError(
    'La vinculación con Mercado Pago venció. El organizador debe volver a vincular su cuenta.',
    409
  );

  let current: string;
  let refreshToken: string;
  try {
    current = decryptSecret(account.access_token, cfg.tokenKey);
    refreshToken = decryptSecret(account.refresh_token, cfg.tokenKey);
  } catch (err) {
    // Solo pasa si cambió MERCADOPAGO_TOKEN_KEY.
    logger.error({ err, userId }, 'Mercado Pago: no se pudo descifrar el token guardado');
    throw relink;
  }

  const remaining = account.expires_at.getTime() - Date.now();
  if (remaining > TOKEN_REFRESH_MARGIN_MS) return current;

  try {
    const tokens = await refreshAccessToken(cfg.app, refreshToken);
    await saveTokens(userId, tokens, cfg.tokenKey);
    return tokens.access_token;
  } catch (err) {
    logger.warn({ err, userId }, 'Mercado Pago: falló la renovación del token');
    if (remaining > 0) return current;
    throw relink;
  }
}

// ─── Checkout del comprador ──────────────────────────────────────────────────

async function getBuyerPurchase(raffleId: string, purchaseId: string, sessionId: string) {
  const row = await db
    .selectFrom('purchases')
    .innerJoin('raffles', 'raffles.id', 'purchases.raffle_id')
    .innerJoin('users', 'users.id', 'raffles.user_id')
    .select([
      'purchases.id',
      'purchases.raffle_id',
      'purchases.session_id',
      'purchases.buyer_name',
      'purchases.quantity',
      'purchases.total',
      'purchases.status',
      'purchases.expires_at',
      'purchases.mp_preference_id',
      'purchases.mp_init_point',
      'raffles.user_id as owner_id',
      'raffles.status as raffle_status',
      'raffles.title',
      'raffles.slug',
      'raffles.visibility',
      'raffles.access_code',
      'raffles.confirmation_method',
      'users.username',
    ])
    .where('purchases.id', '=', purchaseId)
    .where('purchases.raffle_id', '=', raffleId)
    .executeTakeFirst();

  // Mismo error si no existe o si es de otra sesión: no revela compras ajenas.
  if (!row || row.session_id !== sessionId) throw new AppError('Compra no encontrada', 404);
  return row;
}

/** URL de la rifa pública a la que vuelve el comprador. Mercado Pago agrega payment_id y status. */
function buildBackUrl(p: { username: string; slug: string; visibility: string; access_code: string | null; id: string }) {
  const url = new URL(`${env.FRONTEND_URL.replace(/\/$/, '')}/${p.username}/${p.slug}`);
  if (p.visibility === 'private' && p.access_code) url.searchParams.set('code', p.access_code);
  url.searchParams.set('mp_purchase', p.id);
  return url.toString();
}

/** Crea (o reutiliza) la preferencia de pago de una compra pendiente. */
export async function createCheckout(raffleId: string, purchaseId: string, sessionId: string) {
  const cfg = getConfig();
  const purchase = await getBuyerPurchase(raffleId, purchaseId, sessionId);

  if (purchase.confirmation_method !== 'mercadopago') {
    throw new AppError('Esta rifa no cobra con Mercado Pago', 400);
  }
  if (purchase.raffle_status !== 'active') throw new AppError('La rifa no está activa', 400);
  if (purchase.status !== 'pending') throw new AppError('La reserva ya no está pendiente', 409);
  if (!purchase.expires_at || purchase.expires_at.getTime() - Date.now() <= PREFERENCE_SAFETY_MS) {
    throw new AppError('La reserva está por vencer. Elegí los números de nuevo.', 409);
  }
  if (purchase.total <= 0) throw new AppError('El total de la compra debe ser mayor a cero', 400);

  if (purchase.mp_preference_id && purchase.mp_init_point) {
    return { preference_id: purchase.mp_preference_id, init_point: purchase.mp_init_point };
  }

  const token = await getAccessToken(purchase.owner_id);
  const backUrl = buildBackUrl(purchase);
  const plural = purchase.quantity === 1 ? 'número' : 'números';

  const body: Record<string, unknown> = {
    items: [
      {
        id: purchase.id,
        title: `${purchase.title} — ${purchase.quantity} ${plural}`.slice(0, 250),
        quantity: 1,
        unit_price: purchase.total,
        currency_id: 'ARS',
      },
    ],
    payer: { name: purchase.buyer_name },
    external_reference: purchase.id,
    back_urls: { success: backUrl, pending: backUrl, failure: backUrl },
    // Aprobado o rechazado al instante: la reserva dura 30 minutos.
    binary_mode: true,
    expires: true,
    expiration_date_to: new Date(purchase.expires_at.getTime() - PREFERENCE_SAFETY_MS).toISOString(),
    // Sin efectivo ni cajero: se acreditan tarde y la reserva vencería antes.
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
    statement_descriptor: 'RIFANDO',
  };
  // Mercado Pago exige URLs https para el retorno automático y el webhook.
  if (backUrl.startsWith('https://')) body.auto_return = 'approved';
  if (cfg.apiUrl.startsWith('https://')) {
    body.notification_url = `${cfg.apiUrl}/api/payments/mp/webhook?purchase_id=${purchase.id}&source_news=webhooks`;
  }

  let preference;
  try {
    preference = await createPreference(token, body);
  } catch (err) {
    logger.error({ err, purchaseId }, 'Mercado Pago: no se pudo crear la preferencia');
    throw new AppError('No se pudo iniciar el pago con Mercado Pago. Probá de nuevo.', 502);
  }

  // Siempre init_point. Las pruebas se hacen con un vendedor de prueba vinculado por OAuth
  // y un comprador de prueba: sandbox_init_point es del esquema viejo y entra en bucle.
  const initPoint = preference.init_point;

  await db
    .updateTable('purchases')
    .set({ mp_preference_id: preference.id, mp_init_point: initPoint, updated_at: new Date() })
    .where('id', '=', purchase.id)
    .execute();

  return { preference_id: preference.id, init_point: initPoint };
}

/**
 * Estado de la compra para la pantalla de retorno del comprador.
 * Si llega payment_id, consulta el pago en Mercado Pago (no espera al webhook).
 */
export async function getCheckoutStatus(raffleId: string, purchaseId: string, input: CheckoutStatusInput) {
  let purchase = await getBuyerPurchase(raffleId, purchaseId, input.session_id);

  if (input.payment_id && purchase.status === 'pending') {
    try {
      const token = await getAccessToken(purchase.owner_id);
      const payment = await getPayment(token, input.payment_id);
      if (payment.external_reference === purchase.id) {
        await applyPayment(purchase.owner_id, payment);
        purchase = await getBuyerPurchase(raffleId, purchaseId, input.session_id);
      }
    } catch (err) {
      logger.warn({ err, purchaseId }, 'Mercado Pago: no se pudo sincronizar el pago desde el retorno');
    }
  }

  const lastPayment = await db
    .selectFrom('mercadopago_payments')
    .select(['status', 'status_detail'])
    .where('purchase_id', '=', purchase.id)
    .orderBy('updated_at', 'desc')
    .executeTakeFirst();

  const numbers =
    purchase.status === 'confirmed'
      ? await db
          .selectFrom('raffle_numbers')
          .select('number')
          .where('purchase_id', '=', purchase.id)
          .orderBy('number', 'asc')
          .execute()
      : await db
          .selectFrom('number_reservations')
          .select('number')
          .where('purchase_id', '=', purchase.id)
          .orderBy('number', 'asc')
          .execute();

  return {
    purchase_status: purchase.status,
    payment_status: lastPayment?.status ?? null,
    payment_status_detail: lastPayment?.status_detail ?? null,
    numbers: numbers.map((n) => n.number),
    total: purchase.total,
    expires_at: purchase.expires_at,
  };
}

// ─── Pagos recibidos ─────────────────────────────────────────────────────────

/**
 * Registra un pago y, si está aprobado, confirma la compra.
 * Idempotente: el pago se guarda una sola vez por mp_payment_id y la compra se
 * confirma una sola vez (outcome). La fila de la compra se bloquea con FOR UPDATE,
 * así que webhooks simultáneos del mismo pago se procesan en serie.
 */
async function applyPayment(sellerUserId: string, payment: MpPayment) {
  const purchaseId = payment.external_reference;
  if (!purchaseId || !UUID_RE.test(purchaseId)) {
    logger.info({ paymentId: payment.id }, 'Mercado Pago: pago sin external_reference de Rifando');
    return;
  }

  const result = await db.transaction().execute(async (trx) => {
    const purchase = await trx
      .selectFrom('purchases')
      .selectAll()
      .where('id', '=', purchaseId)
      .forUpdate()
      .executeTakeFirst();
    if (!purchase) return null;

    const raffle = await trx
      .selectFrom('raffles')
      .select(['user_id', 'title', 'status'])
      .where('id', '=', purchase.raffle_id)
      .executeTakeFirstOrThrow();

    // El pago se leyó con el token de este rifante: debe ser de una rifa suya.
    if (raffle.user_id !== sellerUserId) {
      logger.warn({ paymentId: payment.id, purchaseId }, 'Mercado Pago: el pago no corresponde al rifante');
      return null;
    }

    const existing = await trx
      .selectFrom('mercadopago_payments')
      .select(['id', 'outcome', 'status', 'mp_updated_at'])
      .where('mp_payment_id', '=', payment.id)
      .executeTakeFirst();

    // Las notificaciones pueden llegar desordenadas: una más vieja no pisa el estado guardado.
    const mpUpdatedAt = payment.date_last_updated ? new Date(payment.date_last_updated) : null;
    if (existing?.mp_updated_at && mpUpdatedAt && mpUpdatedAt < existing.mp_updated_at) return null;

    let outcome: MercadopagoPaymentOutcome | null = existing?.outcome ?? null;
    let numbers: number[] = [];
    let kind: MercadoPagoPaymentNotice['kind'] | null = null;

    if (payment.status === 'approved' && outcome === null) {
      if (roundMoney(payment.transaction_amount) < roundMoney(purchase.total)) {
        outcome = 'amount_mismatch';
        kind = 'mismatch';
      } else if (purchase.status === 'confirmed') {
        outcome = 'duplicate';
        kind = 'duplicate';
      } else if (purchase.status === 'pending' && raffle.status === 'active') {
        numbers = await markPurchaseSold(trx, purchase.raffle_id, purchase, purchase.buyer_name);
        // Sin reservas (el rifante liberó todos los números): se trata como pago tardío.
        outcome = numbers.length > 0 ? 'confirmed' : 'late';
        kind = numbers.length > 0 ? 'approved' : 'late';
      } else {
        // Reserva vencida o cancelada, o rifa ya sorteada: no se venden números.
        outcome = 'late';
        kind = 'late';
      }
    } else if (
      outcome === 'confirmed' &&
      (payment.status === 'refunded' || payment.status === 'charged_back') &&
      existing?.status !== payment.status
    ) {
      // No se liberan números solos: decide el rifante.
      const sold = await trx
        .selectFrom('raffle_numbers')
        .select('number')
        .where('purchase_id', '=', purchase.id)
        .orderBy('number', 'asc')
        .execute();
      numbers = sold.map((n) => n.number);
      kind = 'refunded';
    }

    const fee = payment.fee_details?.reduce((sum, f) => sum + f.amount, 0);
    const data = {
      status: payment.status,
      status_detail: payment.status_detail ?? null,
      amount: payment.transaction_amount,
      fee_amount: fee !== undefined ? roundMoney(fee) : null,
      net_amount: payment.transaction_details?.net_received_amount ?? null,
      payment_method_id: payment.payment_method_id ?? null,
      payer_email: payment.payer?.email ?? null,
      live_mode: payment.live_mode,
      outcome,
      date_approved: payment.date_approved ? new Date(payment.date_approved) : null,
      mp_updated_at: mpUpdatedAt,
      updated_at: new Date(),
    };

    if (existing) {
      await trx.updateTable('mercadopago_payments').set(data).where('id', '=', existing.id).execute();
    } else {
      await trx
        .insertInto('mercadopago_payments')
        .values({
          ...data,
          mp_payment_id: payment.id,
          purchase_id: purchase.id,
          raffle_id: purchase.raffle_id,
          user_id: sellerUserId,
        })
        .execute();
    }

    if (!kind) return null;
    const notice: MercadoPagoPaymentNotice = {
      kind,
      raffleId: purchase.raffle_id,
      raffleTitle: raffle.title,
      buyerName: purchase.buyer_name,
      numbers,
      amount: payment.transaction_amount,
      netAmount: data.net_amount,
      paymentId: payment.id,
    };
    return notice;
  });

  if (result) notifyMercadoPagoPayment(sellerUserId, result).catch(() => {});
}

/**
 * Webhook de Mercado Pago. Valida la firma, lee el pago con el token del rifante
 * y lo aplica. Lanza error solo si conviene que Mercado Pago reintente.
 */
export async function handleWebhook(input: {
  signature: string | undefined;
  requestId: string | undefined;
  query: Record<string, unknown>;
  body: unknown;
}) {
  if (!isConfigured() || !env.MERCADOPAGO_WEBHOOK_SECRET) {
    throw new AppError('Webhook de Mercado Pago no configurado', 503);
  }

  const body = (input.body ?? {}) as { type?: unknown; user_id?: unknown; data?: { id?: unknown } };
  const queryDataId = typeof input.query['data.id'] === 'string' ? (input.query['data.id'] as string) : undefined;

  const valid = verifyWebhookSignature({
    signature: input.signature,
    requestId: input.requestId,
    dataId: queryDataId,
    secret: env.MERCADOPAGO_WEBHOOK_SECRET,
  });
  if (!valid) throw new AppError('Firma inválida', 401);

  const type = typeof input.query.type === 'string' ? input.query.type : body.type;
  if (type !== 'payment') return;

  const paymentId = Number(queryDataId ?? body.data?.id);
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0) return;

  // Rifante dueño del pago: por la compra de la notification_url o por el user_id de Mercado Pago.
  let sellerUserId: string | undefined;
  const purchaseParam = input.query.purchase_id;
  if (typeof purchaseParam === 'string' && UUID_RE.test(purchaseParam)) {
    const row = await db
      .selectFrom('purchases')
      .innerJoin('raffles', 'raffles.id', 'purchases.raffle_id')
      .select('raffles.user_id')
      .where('purchases.id', '=', purchaseParam)
      .executeTakeFirst();
    sellerUserId = row?.user_id;
  }
  if (!sellerUserId && body.user_id !== undefined) {
    const mpUserId = Number(body.user_id);
    if (Number.isSafeInteger(mpUserId)) {
      const row = await db
        .selectFrom('mercadopago_accounts')
        .select('user_id')
        .where('mp_user_id', '=', mpUserId)
        .executeTakeFirst();
      sellerUserId = row?.user_id;
    }
  }
  if (!sellerUserId) {
    logger.info({ paymentId }, 'Mercado Pago: webhook de un pago que no es de Rifando');
    return;
  }

  // Errores permanentes: se loguean y se responde 200. Reintentar no los arregla.
  // Solo se relanzan errores transitorios (5xx de Mercado Pago, timeouts, base de datos).
  let token: string;
  try {
    token = await getAccessToken(sellerUserId);
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 409) {
      logger.error({ paymentId, sellerUserId }, 'Mercado Pago: pago sin verificar, la cuenta está desvinculada o vencida');
      return;
    }
    throw err;
  }

  let payment: MpPayment;
  try {
    payment = await getPayment(token, paymentId);
  } catch (err) {
    // 404: el pago no es de ese rifante. 401/403: el rifante revocó el acceso de la app.
    if (err instanceof MercadoPagoApiError && [401, 403, 404].includes(err.status)) {
      logger.error({ paymentId, sellerUserId, status: err.status }, 'Mercado Pago: no se pudo leer el pago');
      return;
    }
    throw err;
  }

  await applyPayment(sellerUserId, payment);
}

/** Historial de pagos de Mercado Pago del rifante. */
export async function listPayments(userId: string, raffleId?: string) {
  let query = db
    .selectFrom('mercadopago_payments')
    .innerJoin('purchases', 'purchases.id', 'mercadopago_payments.purchase_id')
    .innerJoin('raffles', 'raffles.id', 'mercadopago_payments.raffle_id')
    .select([
      'mercadopago_payments.id',
      'mercadopago_payments.mp_payment_id',
      'mercadopago_payments.purchase_id',
      'mercadopago_payments.raffle_id',
      'raffles.title as raffle_title',
      'purchases.buyer_name',
      'purchases.quantity',
      'mercadopago_payments.status',
      'mercadopago_payments.status_detail',
      'mercadopago_payments.outcome',
      'mercadopago_payments.amount',
      'mercadopago_payments.fee_amount',
      'mercadopago_payments.net_amount',
      'mercadopago_payments.payment_method_id',
      'mercadopago_payments.live_mode',
      'mercadopago_payments.date_approved',
      'mercadopago_payments.created_at',
    ])
    .where('mercadopago_payments.user_id', '=', userId);

  if (raffleId) query = query.where('mercadopago_payments.raffle_id', '=', raffleId);

  return query.orderBy('mercadopago_payments.created_at', 'desc').limit(200).execute();
}
