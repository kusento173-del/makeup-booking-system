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

export interface ShiftChange extends ShiftDefinition {
  readonly artistNickname?: string;
  readonly effectiveFrom: string;
  readonly id: string;
  readonly reason: string;
  readonly reviewComment?: string | null;
  readonly reviewedAt?: string | null;
  readonly rowVersion: number;
  readonly status: 'APPROVED' | 'PENDING' | 'REJECTED' | 'WITHDRAWN';
  readonly submittedAt: string;
}

interface ArtistPage {
  readonly items: readonly OwnArtist[];
}

interface ShiftChangePage {
  readonly items: readonly ShiftChange[];
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

export async function getPendingShiftChange(token: string): Promise<ShiftChange | null> {
  const page = await apiRequest<ShiftChangePage>(
    '/shift-changes?page=1&pageSize=1&status=PENDING',
    { token },
  );
  return page.items[0] ?? null;
}

export async function getLatestShiftChange(token: string): Promise<ShiftChange | null> {
  const page = await apiRequest<ShiftChangePage>('/shift-changes?page=1&pageSize=1', { token });
  return page.items[0] ?? null;
}

export function submitShiftChange(
  token: string,
  artistId: string,
  input: ShiftDefinition & { readonly effectiveFrom: string; readonly reason: string },
): Promise<ShiftChange> {
  return apiRequest(`/artists/${artistId}/shifts/changes`, {
    body: input,
    method: 'POST',
    token,
  });
}

export function withdrawShiftChange(
  token: string,
  requestId: string,
  expectedRowVersion: number,
): Promise<void> {
  return apiRequest(`/shift-changes/${requestId}/withdraw`, {
    body: { expectedRowVersion },
    method: 'POST',
    token,
  });
}
