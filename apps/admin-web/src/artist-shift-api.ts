import { apiRequest } from './api-client';

export interface ShiftDefinition {
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
  readonly workdays: readonly number[];
}

export interface ArtistShift extends ShiftDefinition {
  readonly id: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly versionNo: number;
}

export function getCurrentShift(token: string, artistId: string): Promise<ArtistShift | null> {
  return apiRequest(`/artists/${artistId}/shifts/current`, { token });
}

export function setInitialShift(
  token: string,
  artistId: string,
  definition: ShiftDefinition,
): Promise<ArtistShift> {
  return apiRequest(`/artists/${artistId}/shifts/initial`, {
    body: definition,
    method: 'POST',
    token,
  });
}

export function directlyChangeShift(
  token: string,
  artistId: string,
  input: ShiftDefinition & {
    readonly effectiveFrom: string;
    readonly expectedVersionNo: number;
    readonly reason: string;
  },
): Promise<ArtistShift> {
  return apiRequest(`/artists/${artistId}/shifts/direct-change`, {
    body: input,
    method: 'POST',
    token,
  });
}
