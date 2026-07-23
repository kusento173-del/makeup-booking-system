import { describe, expect, it } from 'vitest';

import { appMetadata } from './app-metadata';

describe('appMetadata', () => {
  it('keeps the mini program shell identifiable', () => {
    expect(appMetadata.name).toBe('妆序微信小程序');
    expect(appMetadata.stage).toBe('M8 小程序业务端');
  });
});
