import { describe, expect, it } from 'vitest';

import { MasterDataNormalizationService } from './master-data-normalization.service';

describe('MasterDataNormalizationService', () => {
  const service = new MasterDataNormalizationService();

  it('normalizes width, surrounding whitespace and English letter case', () => {
    expect(service.normalizeMatchText('  ＲｏｕＲｏｕ  ', 'nickname')).toBe('rourou');
  });

  it('keeps meaningful internal whitespace and Chinese text', () => {
    expect(service.normalizeMatchText('  柔柔 Jiang  ', 'nickname')).toBe('柔柔 jiang');
  });

  it('rejects blank matching values', () => {
    expect(() => service.normalizeMatchText('　 ', 'nickname')).toThrow(
      'nickname must not be blank',
    );
  });
});
