import { describe, expect, it, vi } from 'vitest';

import type { AppointmentCompletionService } from './appointment-completion.service';
import type { FixedGenerationService } from './fixed-generation.service';
import { InternalBookingJobsController } from './internal-booking-jobs.controller';

describe('InternalBookingJobsController', () => {
  it('delegates fixed generation and appointment completion runs', async () => {
    const complete = vi.fn().mockResolvedValue({ completed: 4 });
    const run = vi.fn().mockResolvedValue({ generated: 2 });
    const controller = new InternalBookingJobsController(
      { run: complete } as unknown as AppointmentCompletionService,
      { run } as unknown as FixedGenerationService,
    );

    await expect(controller.generateFixedAppointments()).resolves.toEqual({ generated: 2 });
    await expect(controller.completeAppointments()).resolves.toEqual({ completed: 4 });
    expect(run).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
  });
});
