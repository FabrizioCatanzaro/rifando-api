# rifando-api

Backend de Rifando. Contexto de producto en `../CLAUDE.md`.

## Stack

- Node.js + TypeScript (`strict`, CommonJS, target ES2022).
- Express 5.
- PostgreSQL con `pg` + Kysely (query builder tipado). Sin ORM.
- Zod v3 para validación de entrada y de variables de entorno.
- JWT en cookies httpOnly (`access_token` 2 h, `refresh_token` 7 d).
- Cloudinary para imágenes y comprobantes.
- Resend para emails.
- Telegram Bot API para notificaciones.
- Pino para logs.
- Vitest configurado. Todavía no hay tests.

## Comandos

```bash
npm run dev               # tsx watch src/server.ts (puerto 4000 por defecto)
npm run build             # tsc → dist/
npm start                 # node dist/server.js
npm run migrate           # corre migraciones SQL pendientes
npm run telegram:webhook  # registra el webhook de Telegram (producción)
npm test                  # vitest
```

Ejecuta `npm run build` antes de dar por terminada una tarea. Debe compilar sin errores.

## Estructura

```
src/
  server.ts            # listen + polling de Telegram en development
  app.ts               # middlewares y montaje de rutas
  config/env.ts        # schema Zod de variables de entorno
  db/
    client.ts          # instancia Kysely
    migrate.ts         # runner de migraciones
    migrations/NNN_*.sql
  middleware/          # auth, errorHandler (AppError), rateLimiter
  modules/<modulo>/    # routes, controller, service, schemas
  types/db.ts          # tipos Kysely de todas las tablas
  utils/               # jwt, logger, mailer, notifier, slug, whatsapp
  scripts/
```

Módulos: `auth`, `users`, `raffles`, `numbers`, `prizes`, `promotions`, `draw`, `admin`, `telegram`, `upload`.

## Rutas principales

| Prefijo | Módulo | Notas |
|---|---|---|
| `GET /health` | — | Health check. |
| `/api/auth` | auth | Registro, login, refresh, logout. |
| `/api/users` | users | Perfil público y `PATCH /profile`. |
| `GET /api/users/:username/raffles/:slug` | raffles | Rifa pública. `?code=` para privadas. |
| `/api/raffles` | raffles | CRUD del rifante y `POST /:raffleId/finish`. |
| `/api/raffles/:raffleId/numbers` | numbers | Grilla, reservas, compras (`/purchases`), venta, liberación, compradores. |
| `/api/raffles/:raffleId/prizes` | prizes | Premios. |
| `/api/raffles/:raffleId/promotions` | promotions | Promociones. |
| `/api/raffles/:raffleId/draw*` | draw | Pago de habilitación y ejecución del sorteo. |
| `/api/admin` | admin | Solo `ADMIN_USER_ID`. Aprobación de pagos de sorteo. |
| `/api/telegram` | telegram | Vinculación y webhook. |
| `/api/upload` | upload | `/image` requiere auth. `/comprobante` es público. |

## Convenciones

### Módulos
- Crea cada módulo con cuatro archivos: `*.routes.ts`, `*.controller.ts`, `*.service.ts`, `*.schemas.ts`.
- Usa `Router({ mergeParams: true })` en rutas anidadas bajo `:raffleId`.
- Registra el router nuevo en `src/app.ts`.

### Controllers
- Envuelve cada handler en `try/catch` y llama `next(err)`.
- Valida `req.body` con `schema.parse()` dentro del controller.
- Obtén el usuario con `(req as AuthRequest).userId`.
- No pongas lógica de negocio en el controller.

### Services
- Pon toda la lógica de negocio y el acceso a datos en el service.
- Lanza errores con `new AppError('Mensaje en español', status)`.
- Verifica la propiedad de la rifa con `assertOwner(raffleId, userId)` antes de modificarla.
- Usa `db.transaction()` cuando modifiques más de una tabla.
- Usa `.forUpdate().skipLocked()` al tomar números. No quites esta protección.

### Errores
- `errorHandler` convierte `ZodError` en 400 con `details`.
- `errorHandler` convierte `AppError` en `{ error: message }` con su status.
- Cualquier otro error devuelve 500 y se loguea.

### Autenticación
- Protege rutas con `requireAuth`.
- Protege rutas de admin con `requireAuth` + `requireAdmin`.
- Las cookies usan `sameSite: 'none'` en producción y `'strict'` en desarrollo.

## Base de datos y migraciones

- Crea migraciones como SQL numerado: `src/db/migrations/NNN_descripcion.sql`.
- Usa el siguiente número libre. Última migración: `016_add_username_history.sql`.
- Escribe migraciones idempotentes: `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`.
- No edites una migración ya aplicada. Crea una nueva.
- Actualiza `src/types/db.ts` a mano en cada migración. Kysely no genera tipos.
- Usa `CHECK` para enums de texto. Refleja el mismo union type en `types/db.ts`.
- `.claude/settings.json` de la carpeta raíz habilita el plugin Neon.
- `db/client.ts` convierte NUMERIC y BIGINT a `number`. No hagas `Number()` sobre esos campos.

## Variables de entorno

- Declara cada variable nueva en `src/config/env.ts` (schema Zod).
- Agrega la misma variable a `.env.example` sin valor real.
- Envuelve las variables opcionales con `optional(...)`: un valor vacío (`FOO=`) cuenta como no definido.
- La app termina el proceso si una variable obligatoria falta.
- No leas `.env`. Contiene secretos.

Variables: `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `CLOUDINARY_*`, `NODE_ENV`, `PORT`, `FRONTEND_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`, `ADMIN_USER_ID`, `REGISTRATION_OPEN`, `DRAW_SERVICE_PRICE`, `DRAW_SERVICE_ALIAS`, `DRAW_SERVICE_HOLDER`, `DRAW_SERVICE_BANK`.

## Notificaciones

- `utils/notifier.ts` → `notifyReservation(purchaseId)` envía email y Telegram en paralelo.
- Escapa todo texto de usuario con `escapeHtml` (`utils/html.ts`) antes de meterlo en HTML.
- Llama las notificaciones sin `await` y con `.catch(() => {})`. No deben romper la reserva.
- Telegram en desarrollo usa long polling (`telegram.poller.ts`).
- Telegram en producción usa webhook validado con `TELEGRAM_WEBHOOK_SECRET`.

## Puntos sensibles

- `calculatePrice` en `utils/pricing.ts` duplica la lógica de `rifando-frontend/src/lib/whatsapp.ts`. Cambia ambos juntos.
- `utils/transfer.ts` duplica `rifando-frontend/src/lib/transfer.ts`. Cambia ambos juntos.
- El total de una compra se calcula en la API al reservar. No confíes en montos enviados por el cliente.
- `getNumbers` oculta datos al público. Usa `getOptionalUserId` para detectar al dueño.
- Los comprobantes deben ser URLs del Cloudinary propio (`assertOwnComprobante` en `utils/comprobante.ts`).
- Comprobantes: imagen o PDF hasta 5 MB. La cuenta de Cloudinary tiene habilitada la entrega de PDF.
- Slugs: `generateReadableSlug` en rifas públicas, `generateSlug` en privadas. El slug no cambia después de crear la rifa.
- No hay limpieza programada de reservas. La limpieza ocurre en `getNumbers` y `reserveNumbers`.
- Los números van de `0` a `total_numbers - 1`.
- Si agregás una ruta de primer nivel en el frontend, agregá el nombre a `RESERVED_USERNAMES`.
- Para buscar un usuario por nombre en rutas públicas usa `findUserIdByUsername` (acepta nombres anteriores). Devolvé siempre el nombre actual para que el frontend redirija.
- `PATCH /api/users/username`: cambio de nombre, uno cada 30 días (`USERNAME_CHANGE_COOLDOWN_DAYS`).

## Integración futura: Mercado Pago

- Crea un módulo nuevo `modules/payments/` con la convención de cuatro archivos.
- Un pago de Mercado Pago corresponde a una fila de `purchases` (`external_reference` = `purchase.id`).
- Guarda los tokens OAuth de cada rifante cifrados.
- Valida la firma de cada webhook.
- Haz el webhook idempotente por `payment_id`.
- Consulta el MCP de Mercado Pago para documentación y usuarios de prueba.
