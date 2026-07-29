import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { ApiExceptionFilter } from './api-exception.filter';
import { AuthSessionInvalidError } from './auth/auth-session.errors';
import { AuthorizationDeniedError } from './auth/authorization-policy.service';
import {
  BookingArtistUnavailableError,
  BookingCancellationCutoffError,
  BookingDailyLimitReachedError,
  BookingSecondConfirmationRequiredError,
  BookingSlotConflictError,
} from './booking/booking-create.errors';
import {
  FixedRequestStateConflictError,
  FixedRequestUnavailableError,
} from './booking/fixed-request.errors';
import {
  LeaveFixedAppointmentRestoreConflictError,
  LeaveNotFoundError,
  LeaveStateConflictError,
} from './leave/leave.errors';
import { LastAdministratorError } from './master-data/backoffice-account.errors';
import {
  MasterDataNotFoundError,
  MasterDataVersionConflictError,
} from './master-data/master-data.errors';
import { OvertimeNotFoundError, OvertimeWorkingDayError } from './overtime/overtime.errors';
import {
  InitialShiftAlreadyConfiguredError,
  ShiftArtistNotFoundError,
  ShiftChangeNoOpError,
  ShiftChangePendingExistsError,
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
      error: {
        code: 'MASTER_DATA_VERSION_CONFLICT',
        message: '人员或场地资料已被其他人修改，请重新打开后再操作',
      },
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
      error: { code: 'SHIFT_DEFINITION_INVALID', message: '班次时间必须按 15 分钟设置' },
      statusCode: 400,
    });
    expect(missing.response.status).toHaveBeenCalledWith(404);
    expect(missing.send).toHaveBeenCalledWith({
      error: { code: 'SHIFT_ARTIST_NOT_FOUND', message: '目标数据不存在' },
      statusCode: 404,
    });
    expect(conflict.response.status).toHaveBeenCalledWith(409);
    expect(conflict.send).toHaveBeenCalledWith({
      error: {
        code: 'INITIAL_SHIFT_ALREADY_CONFIGURED',
        message: '班次已经设置，请刷新页面后提交修改申请',
      },
      statusCode: 409,
    });
  });

  it('maps concurrent shift review to a stable conflict response', () => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(new ShiftChangeStateConflictError(), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(send).toHaveBeenCalledWith({
      error: {
        code: 'SHIFT_CHANGE_STATE_CONFLICT',
        message: '这条班次申请已被处理，请刷新页面查看最新状态',
      },
      statusCode: 409,
    });
  });

  it.each([
    [new ShiftChangeNoOpError(), '新班次与当前班次相同，无需提交修改申请'],
    [new ShiftChangePendingExistsError(), '已有待审核的班次修改申请，请等待审核或先撤回原申请'],
  ])('explains how to resolve shift submission conflicts', (error, expectedMessage) => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(send).toHaveBeenCalledWith({
      error: { code: error.code, message: expectedMessage },
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
      error: {
        code: 'LEAVE_STATE_CONFLICT',
        message: '该请假记录已被取消或处理，请返回请假列表查看最新状态',
      },
      statusCode: 409,
    });
  });

  it('explains why a leave with an occupied fixed slot cannot be cancelled', () => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(new LeaveFixedAppointmentRestoreConflictError(), host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(send).toHaveBeenCalledWith({
      error: {
        code: 'LEAVE_FIXED_APPOINTMENT_RESTORE_CONFLICT',
        message: '取消请假失败：原固定时段已被占用，请先调整冲突预约',
      },
      statusCode: 409,
    });
  });

  it.each([
    [new FixedRequestStateConflictError(), '该固定申请已被处理或撤回，请查看最新申请记录'],
    [
      new FixedRequestUnavailableError(),
      '所选固定关系或时间已不可用，请重新选择主播、化妆师和时间',
    ],
  ])('explains fixed relationship conflicts', (error, expectedMessage) => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(send).toHaveBeenCalledWith({
      error: { code: error.code, message: expectedMessage },
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
      error: {
        code: 'OVERTIME_WORKING_DAY',
        message: '所选日期本来就是工作日，无需申请加班',
      },
      statusCode: 409,
    });
  });

  it.each([
    [new BookingSecondConfirmationRequiredError(), '这是当天第二次预约，请确认后重试'],
    [new BookingDailyLimitReachedError(), '该主播当天最多预约两次'],
    [new BookingSlotConflictError(), '该时段刚被占用，请重新选择'],
    [new BookingArtistUnavailableError('ARTIST_ON_LEAVE'), '该化妆师当天不可预约'],
    [new BookingCancellationCutoffError(), '预约当天 0 点后不能取消'],
  ])('maps actionable booking conflicts to stable user messages', (error, message) => {
    const { host, response, send } = createHost();

    new ApiExceptionFilter().catch(error, host);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(send).toHaveBeenCalledWith({
      error: { code: error.code, message },
      statusCode: 409,
    });
  });
});
