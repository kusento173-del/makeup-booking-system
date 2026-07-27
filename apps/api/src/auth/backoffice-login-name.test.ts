import { describe, expect, it } from 'vitest';

import { normalizeBackofficeLoginName } from './backoffice-login-name';

describe('normalizeBackofficeLoginName', () => {
  it('accepts short host codes and normalizes account names', () => {
    expect(normalizeBackofficeLoginName(' 1 ')).toBe('1');
    expect(normalizeBackofficeLoginName('000001')).toBe('000001');
    expect(normalizeBackofficeLoginName(' MA0001 ')).toBe('ma0001');
    expect(normalizeBackofficeLoginName('ab')).toBe('ab');
    expect(normalizeBackofficeLoginName('主播1')).toBeNull();
  });
});
