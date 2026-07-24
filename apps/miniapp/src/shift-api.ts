import { apiRequest } from './api-client';

export interface OwnArtist {
  readonly employmentStatus: 'ACTIVE' | 'INACTIVE';
  readonly id: string;
  readonly initialShiftConfigured: boolean;
  readonly nickname: string;
  readonly siteId: string;
}

export interface ShiftDefinition {
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
  readonly workdays: readonly number[];
}

export interface ArtistShift extends ShiftDefinition {
  readonly artistId: string;
  readonly id: string;
  readonly siteId: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly versionNo: number;
}

interface ArtistPage {
  readonly items: readonly OwnArtist[];
}

export async function getOwnArtist(token: string): Promise<OwnArtist | null> {
  const result = await apiRequest<ArtistPage>('/master-data/artists?page=1&pageSize=1', { token });
  return result.items[0] ?? null;
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
