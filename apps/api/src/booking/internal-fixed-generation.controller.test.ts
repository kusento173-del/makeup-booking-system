import { describe, expect, it, vi } from 'vitest';

import type { FixedGenerationService } from './fixed-generation.service';
import { InternalFixedGenerationController } from './internal-fixed-generation.controller';

describe('InternalFixedGenerationController', () => {
  it('delegates one generation run', async () => {
    const run = vi.fn().mockResolvedValue({ generated: 2 });
    const controller = new InternalFixedGenerationController({
      run,
    } as unknown as FixedGenerationService);

    await expect(controller.run()).resolves.toEqual({ generated: 2 });
    expect(run).toHaveBeenCalledOnce();
  });
});
