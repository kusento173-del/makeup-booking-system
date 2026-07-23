import { Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

import { AppointmentCompletionService } from './appointment-completion.service';
import type { AppointmentCompletionResult } from './appointment-completion.types';
import { FixedGenerationService } from './fixed-generation.service';
import type { FixedGenerationResult } from './fixed-generation.types';
import { InternalWorkerGuard } from './internal-worker.guard';

@ApiExcludeController()
@UseGuards(InternalWorkerGuard)
@Controller('internal/jobs')
export class InternalBookingJobsController {
  constructor(
    private readonly completion: AppointmentCompletionService,
    private readonly generation: FixedGenerationService,
  ) {}

  @Post('appointment-completion')
  @HttpCode(200)
  completeAppointments(): Promise<AppointmentCompletionResult> {
    return this.completion.run();
  }

  @Post('fixed-generation')
  @HttpCode(200)
  generateFixedAppointments(): Promise<FixedGenerationResult> {
    return this.generation.run();
  }
}
