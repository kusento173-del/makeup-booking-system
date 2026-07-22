export function normalizeBackofficeLoginName(loginName: string): string | null {
  const normalized = loginName.normalize('NFKC').trim().toLocaleLowerCase('en-US');
  return /^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalized) ? normalized : null;
}
