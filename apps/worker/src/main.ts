import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

@Module({})
class WorkerModule {}

async function bootstrap(): Promise<void> {
  await NestFactory.createApplicationContext(WorkerModule);
  new Logger('Worker').log('Worker process is ready');
}

void bootstrap();
