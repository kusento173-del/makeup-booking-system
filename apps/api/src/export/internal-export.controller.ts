import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { InternalWorkerGuard } from '../booking/internal-worker.guard';
import { ExportProcessorService, type ExportProcessingResult } from './export-processor.service';

@ApiExcludeController()
@UseGuards(InternalWorkerGuard)
@Controller('internal/jobs')
export class InternalExportController {
  constructor(private readonly processor: ExportProcessorService) {}

  @Post('schedule-export')
  @HttpCode(200)
  run(): Promise<ExportProcessingResult> {
    return this.processor.runOne();
  }
}
