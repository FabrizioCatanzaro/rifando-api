import { z } from 'zod';

export const reserveSchema = z.object({
  numbers: z.array(z.number().int().min(0)).min(1).max(50),
  session_id: z.string().min(1).max(100),
  buyer_name: z.string().min(1).max(150).optional(),
});

export const bulkSellSchema = z.object({
  numbers: z.array(z.number().int().min(0)).min(1),
  buyer_name: z.string().min(1).max(150),
});

export const bulkReleaseSchema = z.object({
  numbers: z.array(z.number().int().min(0)).min(1),
});

export const releaseReservationSchema = z.object({
  numbers: z.array(z.number().int().min(0)).min(1),
  session_id: z.string().min(1).max(100),
});

export const sellNumberSchema = z.object({
  buyer_name: z.string().min(1).max(150),
  buyer_phone: z.string().max(30).optional(),
});

export const updateBuyerSchema = z.object({
  buyer_name: z.string().min(1).max(150),
  buyer_phone: z.string().max(30).optional(),
});

export type ReserveInput = z.infer<typeof reserveSchema>;
export type SellNumberInput = z.infer<typeof sellNumberSchema>;
export type UpdateBuyerInput = z.infer<typeof updateBuyerSchema>;
export type BulkSellInput = z.infer<typeof bulkSellSchema>;
export type BulkReleaseInput = z.infer<typeof bulkReleaseSchema>;
