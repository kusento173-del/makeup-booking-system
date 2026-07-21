import { describe, expect, it } from 'vitest';

import { workerMetadata } from './worker-metadata';

describe('workerMetadata', () => {
  it('identifies the worker skeleton', () => {
    expect(workerMetadata).toEqual({ service: 'worker', status: 'ready' });
  });
});
