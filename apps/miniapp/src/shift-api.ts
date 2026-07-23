import { apiRequest } from './api-client';

export interface ArtistIdentity {
  readonly id: string;
  readonly nickname: string;
}

interface Page<T> {
  readonly items: readonly T[];
}

export interface ArtistShift {
  readonly artistId: string;
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly id: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly versionNo: number;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
  readonly workdays: readonly number[];
}

export async function loadArtistShiftContext(token: string): Promise<{
  readonly artist: ArtistIdentity | null;
  readonly shift: ArtistShift | null;
}> {
  const artists = await apiRequest<Page<ArtistIdentity>>('/master-data/artists?page=1&pageSize=1', {
    token,
  });
  const artist = artists.items[0] ?? null;
  if (!artist) return { artist: null, shift: null };
  const shift = await apiRequest<ArtistShift | null>(`/artists/${artist.id}/shifts/current`, {
    token,
  });
  return { artist, shift };
}

export function setInitialShift(input: {
  readonly artistId: string;
  readonly breakEndMinute: number | null;
  readonly breakStartMinute: number | null;
  readonly token: string;
  readonly workEndMinute: number;
  readonly workStartMinute: number;
  readonly workdays: readonly number[];
}): Promise<ArtistShift> {
  return apiRequest(`/artists/${input.artistId}/shifts/initial`, {
    body: {
      breakEndMinute: input.breakEndMinute,
      breakStartMinute: input.breakStartMinute,
      workEndMinute: input.workEndMinute,
      workStartMinute: input.workStartMinute,
      workdays: input.workdays,
    },
    method: 'POST',
    token: input.token,
  });
}
