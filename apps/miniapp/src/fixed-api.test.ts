import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api-client', () => ({ apiRequest: vi.fn() }));

import { apiRequest } from './api-client';
import {
  changeFixedRequest,
  getFixedAvailability,
  getManagedHostWorkspace,
  listManagedHostWorkspace,
  listFixedRequests,
  withdrawFixedRequest,
} from './fixed-api';

const request = vi.mocked(apiRequest);

describe('fixed appointment api', () => {
  beforeEach(() => request.mockReset());

  it('查询变更固定时带上现有规则和星期', async () => {
    request.mockResolvedValue({ slots: [] });
    await getFixedAvailability('token-1', {
      artistId: 'artist-1',
      currentRuleId: 'rule-1',
      durationMinutes: 30,
      hostId: 'host-1',
      requestedStartDate: '2026-07-27',
      weekdays: [1, 3, 5],
    });
    expect(request).toHaveBeenCalledWith(
      '/fixed-appointments/availability?artistId=artist-1&durationMinutes=30&hostId=host-1&requestedStartDate=2026-07-27&weekdays=1%2C3%2C5&currentRuleId=rule-1',
      { token: 'token-1' },
    );
  });

  it('读取当前运营范围内的固定申请', async () => {
    request.mockResolvedValue({ items: [], page: 1, pageSize: 100, total: 0 });
    await listFixedRequests('token-1');
    expect(request).toHaveBeenCalledWith('/fixed-appointments/requests?page=1&pageSize=100', {
      token: 'token-1',
    });
  });

  it('按目标日期、关键字和主播读取负责主播工作台', async () => {
    request.mockResolvedValue({ items: [], page: 2, pageSize: 20, total: 0 });
    await listManagedHostWorkspace('token-1', {
      asOf: '2026-07-27',
      hostId: 'host-1',
      page: 2,
      search: '000001',
    });
    expect(request).toHaveBeenCalledWith(
      '/fixed-appointments/managed-hosts?asOf=2026-07-27&page=2&pageSize=20&hostId=host-1&search=000001',
      { token: 'token-1' },
    );
  });

  it('按运营关系读取单个主播上下文', async () => {
    request.mockResolvedValue({ items: [{ hostId: 'host-1' }], page: 1, pageSize: 1, total: 1 });
    await expect(getManagedHostWorkspace('token-1', '2026-07-27', 'host-1')).resolves.toMatchObject(
      { hostId: 'host-1' },
    );
  });

  it('使用幂等键提交固定变更', async () => {
    request.mockResolvedValue({ replayed: false, request: { id: 'request-1' } });
    await changeFixedRequest(
      'token-1',
      {
        artistId: 'artist-1',
        currentRuleId: 'rule-1',
        durationMinutes: 45,
        effectiveFrom: '2026-07-28',
        hostId: 'host-1',
        reason: '调整固定时间',
        startMinute: 600,
        weekdays: [2, 4],
      },
      'fixed-key-1',
    );
    expect(request).toHaveBeenCalledWith('/fixed-appointments/requests/change', {
      body: {
        artistId: 'artist-1',
        currentRuleId: 'rule-1',
        durationMinutes: 45,
        effectiveFrom: '2026-07-28',
        hostId: 'host-1',
        reason: '调整固定时间',
        startMinute: 600,
        weekdays: [2, 4],
      },
      headers: { 'Idempotency-Key': 'fixed-key-1' },
      method: 'POST',
      token: 'token-1',
    });
  });

  it('用行版本撤回待审核申请', async () => {
    request.mockResolvedValue({ id: 'request-1', rowVersion: 2, status: 'WITHDRAWN' });
    await withdrawFixedRequest('token-1', 'request-1', 1);
    expect(request).toHaveBeenCalledWith('/fixed-appointments/requests/request-1/withdraw', {
      body: { expectedRowVersion: 1 },
      method: 'POST',
      token: 'token-1',
    });
  });
});
