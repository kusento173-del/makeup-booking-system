import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { AppointmentCompletionResult } from './appointment-completion.types';

@Injectable()
export class AppointmentCompletionService {
  constructor(private readonly database: DatabaseService) {}

  run(now = new Date()): Promise<AppointmentCompletionResult> {
    return this.database.transaction((client) =>
      client.appointment
        .updateMany({
          data: {
            completedAt: now,
            rowVersion: { increment: 1 },
            status: 'COMPLETED',
            updatedAt: now,
          },
          where: { endAt: { lte: now }, status: 'BOOKED' },
        })
        .then(({ count }) => ({ completed: count })),
    );
  }
}
