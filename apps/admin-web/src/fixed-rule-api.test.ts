import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import { listFixedRules } from './fixed-rule-api';

const request = vi.mocked(apiRequest);

describe('fixed rule api', () => {
  beforeEach(() => request.mockReset());

  it('serializes fixed-host list filters', async () => {
    request.mockResolvedValue({ items: [], page: 2, pageSize: 50, total: 0 });

    await listFixedRules('token-1', {
      page: 2,
      search: '阿伟',
      siteId: 'site-1',
      status: 'ACTIVE',
    });

    expect(request).toHaveBeenCalledWith(
      '/fixed-appointments/rules?page=2&pageSize=50&search=%E9%98%BF%E4%BC%9F&siteId=site-1&status=ACTIVE',
      { token: 'token-1' },
    );
  });
});
