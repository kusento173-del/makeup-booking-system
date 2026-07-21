import { resolve } from 'node:path';

import { config } from 'dotenv';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const port = Number.parseInt(process.env.API_PORT ?? '3000', 10);

  app.enableShutdownHooks();
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
