import { env } from '../config/env';
import { roundMoney } from './pricing';

/** Porcentajes vigentes. La comisión de la app se copia a cada rifa al crearla. */
export function getFeeConfig() {
  return {
    app_fee_percent: env.APP_FEE_PERCENT,
    mercadopago_fee_percent: env.MERCADOPAGO_FEE_PERCENT,
  };
}

/** Comisión de Rifando sobre un monto. Se redondea a centavos. */
export function appFeeAmount(amount: number, feePercent: number): number {
  if (feePercent <= 0 || amount <= 0) return 0;
  return roundMoney((amount * feePercent) / 100);
}
