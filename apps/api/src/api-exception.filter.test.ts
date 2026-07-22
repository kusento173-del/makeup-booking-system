import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiExceptionFilter } from './api-exception.filter';
import { AuthSessionInvalidError } from './auth/auth-session.errors';
import { AuthorizationDeniedError } from './auth/authorization-policy.service';
import { LeaveNotFoundError, LeaveStateConflictError } from './leave/leave.errors';
import { LastAdministratorError } from './master-data/backoffice-account.errors';
import {
  MasterDataNotFoundError,
  MasterDataVersionConflictError,
} from './master-data/master-data.errors';
import { OvertimeNotFoundError, OvertimeWorkingDayError } from './overtime/overtime.errors';
import {
  InitialShiftAlreadyConfiguredError,
  ShiftArtistNotFoundError,
  ShiftChangeStateConflictError,
} from './shift/shift.errors';
import { ShiftDefinitionInvalidError } from './shift/shift-time';

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

  it('maps authorization denials to a stable forbidden response', () => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(new AuthorizationDeniedError(), host);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith({
      error: { code: 'AUTHORIZATION_DENIED', message: '无权执行该操作' },
      statusCode: 403,
    });
  });

  it('maps master-data absence and version conflicts without internal details', () => {
    const missing = createHost();
    const conflict = createHost();
    const filter = new ApiExceptionFilter();

    filter.catch(new MasterDataNotFoundError('Host'), missing.host);
    filter.catch(new MasterDataVersionConflictError(), conflict.host);

    expect(missing.response.status).toHaveBeenCalledWith(404);
    expect(missing.send).toHaveBeenCalledWith({
      error: { code: 'MASTER_DATA_NOT_FOUND', message: '目标数据不存在' },
      statusCode: 404,
    });
    expect(conflict.response.status).toHaveBeenCalledWith(409);
    expect(conflict.send).toHaveBeenCalledWith({
      error: { code: 'MASTER_DATA_VERSION_CONFLICT', message: '数据状态冲突，请刷新后重试' },
      statusCode: 409,
    });
  });

  it('protects the last administrator with a stable conflict response', () => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(new LastAdministratorError(), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(send).toHaveBeenCalledWith({
      error: { code: 'LAST_ADMINISTRATOR_REQUIRED', message: '账号或角色状态冲突' },
      statusCode: 409,
    });
  });

  it('maps shift validation, absence and duplicate setup without internal details', () => {
    const invalid = createHost();
    const missing = createHost();
    const conflict = createHost();
    const filter = new ApiExceptionFilter();

    filter.catch(new ShiftDefinitionInvalidError('TIME_STEP_INVALID'), invalid.host);
    filter.catch(new ShiftArtistNotFoundError(), missing.host);
    filter.catch(new InitialShiftAlreadyConfiguredError(), conflict.host);

    expect(invalid.response.status).toHaveBeenCalledWith(400);
    expect(invalid.send).toHaveBeenCalledWith({
      error: { code: 'SHIFT_DEFINITION_INVALID', message: '请求内容不正确' },
      statusCode: 400,
    });
    expect(missing.response.status).toHaveBeenCalledWith(404);
    expect(missing.send).toHaveBeenCalledWith({
      error: { code: 'SHIFT_ARTIST_NOT_FOUND', message: '目标数据不存在' },
      statusCode: 404,
    });
    expect(conflict.response.status).toHaveBeenCalledWith(409);
    expect(conflict.send).toHaveBeenCalledWith({
      error: { code: 'INITIAL_SHIFT_ALREADY_CONFIGURED', message: '数据状态冲突，请刷新后重试' },
      statusCode: 409,
    });
  });

  it('maps concurrent shift review to a stable conflict response', () => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(new ShiftChangeStateConflictError(), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(send).toHaveBeenCalledWith({
      error: { code: 'SHIFT_CHANGE_STATE_CONFLICT', message: '数据状态冲突，请刷新后重试' },
      statusCode: 409,
    });
  });

  it('maps leave absence and state conflicts without internal details', () => {
    const missing = createHost();
    const conflict = createHost();
    const filter = new ApiExceptionFilter();

    filter.catch(new LeaveNotFoundError(), missing.host);
    filter.catch(new LeaveStateConflictError(), conflict.host);

    expect(missing.response.status).toHaveBeenCalledWith(404);
    expect(missing.send).toHaveBeenCalledWith({
      error: { code: 'LEAVE_NOT_FOUND', message: '目标数据不存在' },
      statusCode: 404,
    });
    expect(conflict.response.status).toHaveBeenCalledWith(409);
    expect(conflict.send).toHaveBeenCalledWith({
      error: { code: 'LEAVE_STATE_CONFLICT', message: '数据状态冲突，请刷新后重试' },
      statusCode: 409,
    });
  });

  it('maps overtime absence and invalid working-day state without internal details', () => {
    const missing = createHost();
    const conflict = createHost();
    const filter = new ApiExceptionFilter();

    filter.catch(new OvertimeNotFoundError(), missing.host);
    filter.catch(new OvertimeWorkingDayError(), conflict.host);

    expect(missing.response.status).toHaveBeenCalledWith(404);
    expect(missing.send).toHaveBeenCalledWith({
      error: { code: 'OVERTIME_NOT_FOUND', message: '目标数据不存在' },
      statusCode: 404,
    });
    expect(conflict.response.status).toHaveBeenCalledWith(409);
    expect(conflict.send).toHaveBeenCalledWith({
      error: { code: 'OVERTIME_WORKING_DAY', message: '数据状态冲突，请刷新后重试' },
      statusCode: 409,
    });
  });
});
