import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { FixedGenerationService } from './fixed-generation.service';
import type { FixedGenerationResult } from './fixed-generation.types';
import { InternalWorkerGuard } from './internal-worker.guard';

@ApiExcludeController()
@UseGuards(InternalWorkerGuard)
@Controller('internal/jobs')
export class InternalFixedGenerationController {
  constructor(private readonly generation: FixedGenerationService) {}

  @Post('fixed-generation')
  @HttpCode(200)
  run(): Promise<FixedGenerationResult> {
    return this.generation.run();
  }
}
