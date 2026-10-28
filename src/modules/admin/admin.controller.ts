import type { Request, Response, NextFunction } from 'express';
import * as adminService from './admin.service';
import * as feesService from '../fees/fees.service';

export async function listDrawPayments(_req: Request, res: Response, next: NextFunction) {
  try {
    const payments = await adminService.listDrawPayments();
    res.json({ payments });
  } catch (err) {
    next(err);
  }
}

export async function approveDrawPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.approveDrawPayment(req.params.paymentId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function rejectDrawPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await adminService.rejectDrawPayment(req.params.paymentId as string);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function listFeePayments(_req: Request, res: Response, next: NextFunction) {
  try {
    const payments = await feesService.listFeePayments();
    res.json({ payments });
  } catch (err) {
    next(err);
  }
}

export async function approveFeePayment(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await feesService.reviewFeePayment(req.params.paymentId as string, 'approved'));
  } catch (err) {
    next(err);
  }
}

export async function rejectFeePayment(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await feesService.reviewFeePayment(req.params.paymentId as string, 'rejected'));
  } catch (err) {
    next(err);
  }
}
