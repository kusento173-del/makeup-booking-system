import { describe, expect, it } from 'vitest';

import { appMetadata } from './app-metadata';

describe('appMetadata', () => {
  it('keeps the administration shell identifiable', () => {
    expect(appMetadata.name).toBe('妆序管理后台');
  });
});
