import { resolve } from 'node:path';

import { Logger } from '@nestjs/common';

import { FixedGenerationScheduler } from './fixed-generation.scheduler';

function loadEnvironment(): void {
  try {
    process.loadEnvFile(resolve(__dirname, '../../../.env'));
  } catch {
    // Production environments normally inject variables without a local .env file.
  }
}

loadEnvironment();
const logger = new Logger('FixedGenerationWorker');
const scheduler = new FixedGenerationScheduler(
  {
    apiUrl: process.env.INTERNAL_API_URL ?? 'http://127.0.0.1:3000',
    intervalMs: Number(process.env.FIXED_GENERATION_INTERVAL_MS ?? '60000'),
    token: process.env.INTERNAL_WORKER_TOKEN ?? '',
  },
  logger,
);
scheduler.start();

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    scheduler.stop();
    process.exitCode = 0;
  });
}
