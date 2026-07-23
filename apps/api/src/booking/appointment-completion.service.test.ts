import { describe, expect, it, vi } from 'vitest';

import type { DatabaseService } from '../database/database.service';
import { AppointmentCompletionService } from './appointment-completion.service';

describe('AppointmentCompletionService', () => {
  it('atomically completes every due booked appointment and nothing else', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 7 });
    const client = { appointment: { updateMany } };
    const database = {
      transaction: vi.fn((operation: (value: typeof client) => unknown) => operation(client)),
    };
    const service = new AppointmentCompletionService(database as unknown as DatabaseService);
    const now = new Date('2026-07-23T03:00:00.000Z');

    await expect(service.run(now)).resolves.toEqual({ completed: 7 });
    expect(updateMany).toHaveBeenCalledWith({
      data: {
        completedAt: now,
        rowVersion: { increment: 1 },
        status: 'COMPLETED',
        updatedAt: now,
      },
      where: { endAt: { lte: now }, status: 'BOOKED' },
    });
  });
});
