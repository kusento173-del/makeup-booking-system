import { describe, expect, it } from 'vitest';

import { parseDatabasePoolMax } from './database-client.provider';

describe('parseDatabasePoolMax', () => {
  it.each([undefined, ''])('uses the driver default when the value is %s', (value) => {
    expect(parseDatabasePoolMax(value)).toBeUndefined();
  });

  it('accepts a bounded integer', () => {
    expect(parseDatabasePoolMax('20')).toBe(20);
  });

  it.each(['0', '1.5', '101', 'invalid'])('rejects %s', (value) => {
    expect(() => parseDatabasePoolMax(value)).toThrow(
      'DATABASE_POOL_MAX must be an integer between 1 and 100',
    );
  });
});
