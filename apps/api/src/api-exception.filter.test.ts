import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiExceptionFilter } from './api-exception.filter';
import { AuthSessionInvalidError } from './auth/auth-session.errors';

function createHost() {
  const send = vi.fn();
  const response = { header: vi.fn(), send, status: vi.fn() };
  response.header.mockReturnValue(response);
  response.status.mockReturnValue(response);
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;

  return { host, response, send };
}

describe('ApiExceptionFilter', () => {
  it('maps authentication failures to a stable response without internal details', () => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(new AuthSessionInvalidError(), host);

    expect(response.status).toHaveBeenCalledWith(401);
    expect(send).toHaveBeenCalledWith({
      error: { code: 'AUTH_SESSION_INVALID', message: '登录状态无效或账号不可用' },
      statusCode: 401,
    });
  });

  it('does not expose unexpected error messages', () => {
    const { host, send } = createHost();

    new ApiExceptionFilter().catch(new Error('database password leaked'), host);

    expect(send).toHaveBeenCalledWith({
      error: { code: 'INTERNAL_ERROR', message: '服务暂时异常' },
      statusCode: 500,
    });
  });
});
