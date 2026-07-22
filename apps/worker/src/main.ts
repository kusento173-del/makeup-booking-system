import { resolve } from 'node:path';

import { Logger } from '@nestjs/common';

import { ExportScheduler } from './export.scheduler';
import { FixedGenerationScheduler } from './fixed-generation.scheduler';
import { NotificationOutboxScheduler } from './notification-outbox.scheduler';

function loadEnvironment(): void {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../.env'));
  } catch {
    // Production environments normally inject variables without a local .env file.
  }
}

loadEnvironment();
const apiUrl = process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3000';
const token = process.env.INTERNAL_WORKER_TOKEN ?? '';
const logger = new Logger('BackgroundWorker');
const scheduler = new FixedGenerationScheduler(
  {
    apiUrl,
    intervalMs: Number(process.env.FIXED_GENERATION_INTERVAL_MS ?? '60000'),
    token,
  },
  logger,
);
const exportScheduler = new ExportScheduler(
  {
    apiUrl,
    cleanupIntervalMs: Number(process.env.EXPORT_CLEANUP_INTERVAL_MS ?? '3600000'),
    intervalMs: Number(process.env.EXPORT_POLL_INTERVAL_MS ?? '5000'),
    token,
  },
  logger,
);
const notificationOutboxScheduler = new NotificationOutboxScheduler(
  {
    apiUrl,
    deliveryIntervalMs: Number(process.env.NOTIFICATION_DELIVERY_INTERVAL_MS ?? '1000'),
    intervalMs: Number(process.env.NOTIFICATION_OUTBOX_INTERVAL_MS ?? '2000'),
    token,
  },
  logger,
);
scheduler.start();
exportScheduler.start();
notificationOutboxScheduler.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    scheduler.stop();
    exportScheduler.stop();
    notificationOutboxScheduler.stop();
    process.exitCode = 0;
  });
}
