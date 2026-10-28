import 'dotenv/config';
import { db } from '../db/client';
import { env } from '../config/env';
import { decryptSecret } from '../utils/crypto';

/**
 * Diagnóstico de pagos de Mercado Pago. No imprime tokens ni credenciales.
 *
 *   npm run mp:debug              -> última compra con preferencia de Mercado Pago
 *   npm run mp:debug -- <id>      -> una compra puntual
 *   npx tsx src/scripts/mp-debug.ts --pay                  -> además paga por API con la tarjeta APRO
 *   npx tsx src/scripts/mp-debug.ts --pay --payer=<email>  -> idem, con el email del comprador de prueba
 * (En PowerShell no uses "npm run mp:debug -- --pay": PowerShell se come el "--".)
 *
 * Muestra la preferencia, los pagos registrados en Mercado Pago y crea una
 * preferencia mínima (solo ítem y monto) para aislar el problema.
 */
async function mp<T>(
  path: string,
  token: string,
  init?: { method?: string; body?: unknown; idempotencyKey?: string }
): Promise<{ status: number; body: T }> {
  const headers: Record<string, string> = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (init?.idempotencyKey) headers['X-Idempotency-Key'] = init.idempotencyKey;
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

async function main() {
  if (!env.MERCADOPAGO_TOKEN_KEY) throw new Error('Falta MERCADOPAGO_TOKEN_KEY');
  const pay = process.argv.includes('--pay');
  const purchaseArg = process.argv.slice(2).find((a) => !a.startsWith('--'));

  let query = db
    .selectFrom('purchases')
    .innerJoin('raffles', 'raffles.id', 'purchases.raffle_id')
    .select([
      'purchases.id',
      'purchases.status',
      'purchases.total',
      'purchases.expires_at',
      'purchases.mp_preference_id',
      'purchases.created_at',
      'raffles.user_id',
      'raffles.title',
    ])
    .where('purchases.mp_preference_id', 'is not', null);
  if (purchaseArg) query = query.where('purchases.id', '=', purchaseArg);
  const purchase = await query.orderBy('purchases.created_at', 'desc').executeTakeFirst();
  if (!purchase) throw new Error('No hay compras con preferencia de Mercado Pago');

  console.log('\n=== COMPRA ===');
  console.log({
    id: purchase.id,
    estado: purchase.status,
    total: purchase.total,
    creada: purchase.created_at,
    vence: purchase.expires_at,
    ahora: new Date(),
  });

  const account = await db
    .selectFrom('mercadopago_accounts')
    .select(['mp_user_id', 'live_mode', 'expires_at', 'access_token', 'public_key'])
    .where('user_id', '=', purchase.user_id)
    .executeTakeFirst();
  if (!account) throw new Error('El rifante no tiene cuenta vinculada');

  const token = decryptSecret(account.access_token, env.MERCADOPAGO_TOKEN_KEY);
  console.log('\n=== CUENTA VINCULADA ===');
  console.log({
    mp_user_id: account.mp_user_id,
    live_mode: account.live_mode,
    tipo_token: token.split('-')[0], // APP_USR o TEST
    token_vence: account.expires_at,
  });

  const me = await mp<{ id: number; nickname: string; site_id: string; tags?: string[] }>('/users/me', token);
  console.log('\n=== VENDEDOR (users/me) ===');
  console.log({ http: me.status, id: me.body?.id, nickname: me.body?.nickname, site: me.body?.site_id, tags: me.body?.tags });

  const pref = await mp<Record<string, unknown>>(`/checkout/preferences/${purchase.mp_preference_id}`, token);
  console.log('\n=== PREFERENCIA ===');
  const p = pref.body ?? {};
  console.log({
    http: pref.status,
    collector_id: p.collector_id,
    client_id: p.client_id,
    items: p.items,
    payer: p.payer,
    payment_methods: p.payment_methods,
    binary_mode: p.binary_mode,
    expires: p.expires,
    expiration_date_from: p.expiration_date_from,
    expiration_date_to: p.expiration_date_to,
    statement_descriptor: p.statement_descriptor,
    notification_url: p.notification_url,
    back_urls: p.back_urls,
    auto_return: p.auto_return,
  });

  const payments = await mp<{ results?: Record<string, unknown>[] }>(
    `/v1/payments/search?external_reference=${purchase.id}&sort=date_created&criteria=desc`,
    token
  );
  console.log('\n=== PAGOS EN MERCADO PAGO ===');
  const results = payments.body?.results ?? [];
  if (results.length === 0) console.log(`(ninguno) http ${payments.status}`);
  for (const r of results) {
    console.log({
      id: r.id,
      status: r.status,
      status_detail: r.status_detail,
      monto: r.transaction_amount,
      medio: r.payment_method_id,
      live_mode: r.live_mode,
      payer_id: (r.payer as { id?: unknown } | undefined)?.id,
    });
  }

  const minimal = await mp<{ id?: string; init_point?: string; message?: string }>('/checkout/preferences', token, {
    method: 'POST',
    body: { items: [{ title: 'Prueba mínima Rifando', quantity: 1, unit_price: 100, currency_id: 'ARS' }] },
  });
  console.log('\n=== PREFERENCIA MÍNIMA (probá pagarla con el comprador de prueba) ===');
  console.log({ http: minimal.status, init_point: minimal.body?.init_point, error: minimal.body?.message });

  const payerArg = process.argv.find((a) => a.startsWith('--payer='))?.slice('--payer='.length);
  if (pay) await payByApi(purchase.id, purchase.total, token, account.public_key, payerArg);

  await db.destroy();
}

/** Paga la compra por API, sin la pantalla de Checkout Pro. Muestra el motivo exacto si falla. */
async function payByApi(
  purchaseId: string,
  amount: number,
  token: string,
  publicKey: string | null,
  payerEmail?: string
) {
  console.log('\n=== PAGO POR API (tarjeta de prueba, titular APRO) ===');
  if (!publicKey) {
    console.log('La cuenta vinculada no tiene public_key guardada.');
    return;
  }

  const cardRes = await fetch(`https://api.mercadopago.com/v1/card_tokens?public_key=${publicKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_number: '5031755734530604',
      security_code: '123',
      expiration_month: 11,
      expiration_year: 2030,
      cardholder: { name: 'APRO', identification: { type: 'DNI', number: '12345678' } },
    }),
  });
  const card = (await cardRes.json().catch(() => null)) as { id?: string; message?: string; cause?: unknown } | null;
  console.log('card_token:', { http: cardRes.status, ok: !!card?.id, error: card?.message, cause: card?.cause });
  if (!card?.id) return;

  const apiUrl = env.API_PUBLIC_URL?.replace(/\/$/, '');
  const payment = await mp<Record<string, unknown>>('/v1/payments', token, {
    method: 'POST',
    body: {
      transaction_amount: amount,
      token: card.id,
      description: 'Prueba Rifando por API',
      installments: 1,
      payment_method_id: 'master',
      payer: { email: payerEmail ?? `test_user_${Date.now()}@testuser.com` },
      external_reference: purchaseId,
      ...(apiUrl?.startsWith('https://')
        ? { notification_url: `${apiUrl}/api/payments/mp/webhook?purchase_id=${purchaseId}&source_news=webhooks` }
        : {}),
    },
    idempotencyKey: `rifando-debug-${purchaseId}-${Date.now()}`,
  });
  const b = payment.body ?? {};
  console.log({
    http: payment.status,
    id: b.id,
    status: b.status,
    status_detail: b.status_detail,
    error: b.message,
    cause: b.cause,
  });
  if (b.status === 'approved') {
    console.log('Pago aprobado. En unos segundos el webhook debería confirmar la compra. Revisá la rifa y la terminal de la API.');
  }
}

main().catch(async (err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  await db.destroy();
  process.exit(1);
});
