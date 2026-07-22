import { resolve } from 'node:path';

import { config } from 'dotenv';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './api-exception.filter';

config({ path: resolve(__dirname, '../../../.env'), quiet: true });

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter());
  const port = Number.parseInt(process.env.API_PORT ?? '3000', 10);

  app.enableShutdownHooks();
  app.useGlobalFilters(new ApiExceptionFilter());
  const openApi = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('化妆部预约系统 API')
      .setDescription('认证、人员、班次、预约与排班接口')
      .setVersion('1.0')
      .addBearerAuth(undefined, 'access-token')
      .build(),
  );
  SwaggerModule.setup('api-docs', app, openApi, {
    jsonDocumentUrl: 'openapi.json',
    ui: false,
  });
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
