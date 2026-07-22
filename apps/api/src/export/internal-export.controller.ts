import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalWorkerGuard } from '../booking/internal-worker.guard';
import { ExportCleanupService, type ExportCleanupResult } from './export-cleanup.service';
import { ExportProcessorService, type ExportProcessingResult } from './export-processor.service';

@ApiExcludeController()
@UseGuards(InternalWorkerGuard)
@Controller('internal/jobs')
export class InternalExportController {
  constructor(
    private readonly cleanup: ExportCleanupService,
    private readonly processor: ExportProcessorService,
  ) {}

  @Post('schedule-export-cleanup')
  @HttpCode(200)
  clean(): Promise<ExportCleanupResult> {
    return this.cleanup.runOne();
  }

  @Post('schedule-export')
  @HttpCode(200)
  run(): Promise<ExportProcessingResult> {
    return this.processor.runOne();
  }
}
