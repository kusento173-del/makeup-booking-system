import { apiRequest } from './api-client';
import type { ShiftDefinition } from './shift-api';

export interface OvertimeItem extends Omit<ShiftDefinition, 'workdays'> {
  readonly affectedAppointmentCount: number;
  readonly artistId: string;
  readonly artistNickname: string;
  readonly id: string;
  readonly overtimeDate: string;
  readonly reason: string;
  readonly reviewComment: string | null;
  readonly reviewedAt: string | null;
  readonly rowVersion: number;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly submittedAt: string;
}

interface OvertimePage {
  readonly items: readonly OvertimeItem[];
  readonly total: number;
}

export function listOwnOvertimes(token: string): Promise<OvertimePage> {
  return apiRequest('/overtimes?page=1&pageSize=50', { token });
}

export function submitOvertime(
  token: string,
  artistId: string,
  input: Omit<ShiftDefinition, 'workdays'> & {
    readonly overtimeDate: string;
    readonly reason: string;
  },
): Promise<OvertimeItem> {
  return apiRequest(`/artists/${artistId}/overtimes`, {
    body: input,
    method: 'POST',
    token,
  });
}

export function withdrawOvertime(
  token: string,
  overtimeId: string,
  expectedRowVersion: number,
): Promise<void> {
  return apiRequest(`/overtimes/${overtimeId}/withdraw`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}
