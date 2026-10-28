import crypto from 'crypto';
import { db } from '../db/client';

// Cliente mínimo de la API de Mercado Pago. Sin SDK: solo usamos 4 endpoints.
const MP_API = 'https://api.mercadopago.com';
export const MP_AUTH_URL = 'https://auth.mercadopago.com/authorization';
const TIMEOUT_MS = 10_000;

export class MercadoPagoApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: unknown
  ) {
    super(message);
    this.name = 'MercadoPagoApiError';
  }
}

async function mpRequest<T>(path: string, init: { method?: string; token?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;

  const res = await fetch(`${MP_API}${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!res.ok) {
    throw new MercadoPagoApiError(`Mercado Pago respondió ${res.status} en ${path}`, res.status, body);
  }
  return body as T;
}

export interface MpTokenResponse {
  access_token: string;
  refresh_token: string;
  public_key?: string;
  user_id: number;
  /** Segundos. OAuth de vendedores: 180 días. */
  expires_in: number;
  live_mode?: boolean;
}

export interface MpAppCredentials {
  clientId: string;
  clientSecret: string;
}

export function exchangeAuthorizationCode(app: MpAppCredentials, code: string, redirectUri: string) {
  return mpRequest<MpTokenResponse>('/oauth/token', {
    method: 'POST',
    body: {
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    },
  });
}

export function refreshAccessToken(app: MpAppCredentials, refreshToken: string) {
  return mpRequest<MpTokenResponse>('/oauth/token', {
    method: 'POST',
    body: {
      client_id: app.clientId,
      client_secret: app.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    },
  });
}

export interface MpPreference {
  id: string;
  init_point: string;
  sandbox_init_point?: string;
}

export function createPreference(accessToken: string, body: Record<string, unknown>) {
  return mpRequest<MpPreference>('/checkout/preferences', { method: 'POST', token: accessToken, body });
}

export interface MpPayment {
  id: number;
  status: string;
  status_detail: string | null;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
  payment_method_id: string | null;
  date_approved: string | null;
  date_last_updated: string | null;
  live_mode: boolean;
  payer?: { email?: string | null } | null;
  fee_details?: { type: string; amount: number }[];
  transaction_details?: { net_received_amount?: number | null } | null;
}

export function getPayment(accessToken: string, paymentId: number) {
  return mpRequest<MpPayment>(`/v1/payments/${paymentId}`, { token: accessToken });
}

/**
 * Valida el header x-signature de un Webhook ("ts=...,v1=...").
 * Manifest oficial: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * Los valores ausentes se quitan del manifest. data.id alfanumérico va en minúsculas.
 */
export function verifyWebhookSignature(params: {
  signature: string | undefined;
  requestId: string | undefined;
  dataId: string | undefined;
  secret: string;
}): boolean {
  if (!params.signature) return false;

  const parts = new Map<string, string>();
  for (const part of params.signature.split(',')) {
    const [key, ...rest] = part.split('=');
    if (key && rest.length > 0) parts.set(key.trim(), rest.join('=').trim());
  }
  const ts = parts.get('ts');
  const v1 = parts.get('v1');
  if (!ts || !v1) return false;

  let manifest = '';
  if (params.dataId) manifest += `id:${params.dataId.toLowerCase()};`;
  if (params.requestId) manifest += `request-id:${params.requestId};`;
  manifest += `ts:${ts};`;

  const expected = crypto.createHmac('sha256', params.secret).update(manifest).digest('hex');
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(v1, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** El rifante tiene una cuenta de Mercado Pago vinculada. */
export async function hasMercadoPagoAccount(userId: string): Promise<boolean> {
  const row = await db
    .selectFrom('mercadopago_accounts')
    .select('user_id')
    .where('user_id', '=', userId)
    .executeTakeFirst();
  return !!row;
}
