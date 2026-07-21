import { describe, expect, it } from 'vitest';

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports the API skeleton as ready', () => {
    expect(new HealthController().check()).toEqual({ service: 'api', status: 'ok' });
  });
});
