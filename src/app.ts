import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimiter';

import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import rafflesRoutes from './modules/raffles/raffles.routes';
import numbersRoutes from './modules/numbers/numbers.routes';
import prizesRoutes from './modules/prizes/prizes.routes';
import promotionsRoutes from './modules/promotions/promotions.routes';
import uploadRoutes from './modules/upload/upload.routes';
import drawRoutes from './modules/draw/draw.routes';
import adminRoutes from './modules/admin/admin.routes';
import telegramRoutes from './modules/telegram/telegram.routes';
import * as rafflesController from './modules/raffles/raffles.controller';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(generalLimiter);

// Health check
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// Public raffle by username/slug (nested under /api/users)
app.get('/api/users/:username/raffles/:slug', rafflesController.getRaffleBySlug);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/raffles', rafflesRoutes);
app.use('/api/raffles/:raffleId/numbers', numbersRoutes);
app.use('/api/raffles/:raffleId/prizes', prizesRoutes);
app.use('/api/raffles/:raffleId/promotions', promotionsRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/raffles/:raffleId', drawRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/telegram', telegramRoutes);

app.use(errorHandler);

export default app;
