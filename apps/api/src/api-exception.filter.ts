import { Prisma } from '@makeup/database';
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { AuthRequestInvalidError } from './auth/auth-request.parser';
import { AuditQueryInvalidError } from './audit/audit-query.parser';
import { AccountLoginDeniedError } from './auth/account-login.errors';
import { BackofficeLoginDeniedError } from './auth/backoffice-auth.errors';
import {
  AuthRateLimitExceededError,
  RateLimitConfigurationError,
  RateLimitUnavailableError,
} from './auth/auth-rate-limit.errors';
import { AuthSessionInvalidError, AuthConfigurationError } from './auth/auth-session.errors';
import { AuthorizationDeniedError } from './auth/authorization-policy.service';
import { AvailabilityArtistNotFoundError } from './availability/artist-availability.errors';
import {
  BookingArtistUnavailableError,
  BookingAppointmentNotFoundError,
  BookingCancellationCutoffError,
  BookingCancellationReasonInvalidError,
  BookingCreationReasonInvalidError,
  BookingDailyLimitReachedError,
  BookingHostUnavailableError,
  BookingIdempotencyConflictError,
  BookingIdempotencyIncompleteError,
  BookingIdempotencyKeyInvalidError,
  BookingSecondConfirmationRequiredError,
  BookingSlotConflictError,
  BookingStateConflictError,
} from './booking/booking-create.errors';
import { BookingRequestInvalidError } from './booking/booking-request.parser';
import { BookingHostNotFoundError, BookingSiteMismatchError } from './booking/booking-slot.errors';
import {
  BookingDateInvalidError,
  BookingDurationInvalidError,
  BookingStartInvalidError,
} from './booking/booking-time.errors';
import {
  FixedAvailabilityDateInvalidError,
  FixedAvailabilityWeekdaysInvalidError,
} from './booking/fixed-availability.errors';
import {
  FixedRequestReasonInvalidError,
  FixedRequestReviewCommentInvalidError,
  FixedRequestNotFoundError,
  FixedRequestStateConflictError,
  FixedRequestUnavailableError,
} from './booking/fixed-request.errors';
import {
  ExportDateOutOfRangeError,
  ExportFileUnavailableError,
  ExportIdempotencyConflictError,
  ExportIdempotencyKeyInvalidError,
  ExportNotFoundError,
  ExportRequestInvalidError,
  ExportSiteUnavailableError,
  ExportStateConflictError,
} from './export/export.errors';
import { MasterDataRequestInvalidError } from './master-data/master-data-request.parser';
import {
  BackofficeAccountConflictError,
  BackofficeAccountNotFoundError,
  LastAdministratorError,
} from './master-data/backoffice-account.errors';
import {
  MasterDataDateRangeError,
  MasterDataInactiveSiteError,
  MasterDataNotFoundError,
  MasterDataSiteMismatchError,
  MasterDataVersionConflictError,
} from './master-data/master-data.errors';
import {
  LeaveDateRangeInvalidError,
  LeaveFixedAppointmentRestoreConflictError,
  LeaveImpactChangedError,
  LeaveNotFoundError,
  LeaveReasonInvalidError,
  LeaveStateConflictError,
  LeaveSubjectUnavailableError,
} from './leave/leave.errors';
import { LeaveRequestInvalidError } from './leave/leave-request.parser';
import {
  OvertimeArtistNotFoundError,
  OvertimeArtistUnavailableError,
  OvertimeDateInvalidError,
  OvertimeNotFoundError,
  OvertimePendingExistsError,
  OvertimeReasonInvalidError,
  OvertimeShiftNotConfiguredError,
  OvertimeStateConflictError,
  OvertimeWorkingDayError,
} from './overtime/overtime.errors';
import { OvertimeRequestInvalidError } from './overtime/overtime-request.parser';
import {
  InitialShiftAlreadyConfiguredError,
  ShiftArtistNotFoundError,
  ShiftArtistUnavailableError,
  ShiftChangeEffectiveDateError,
  ShiftChangeNoOpError,
  ShiftChangeNotFoundError,
  ShiftChangePendingExistsError,
  ShiftChangeReasonInvalidError,
  ShiftChangeStateConflictError,
} from './shift/shift.errors';
import { ShiftRequestInvalidError } from './shift/shift-request.parser';
import { ShiftDefinitionInvalidError } from './shift/shift-time';
import {
  ScheduleDateOutOfRangeError,
  ScheduleRequestInvalidError,
  ScheduleSiteRequiredError,
} from './schedule/schedule-board.errors';
import {
  ArtistUnavailablePeriodDateInvalidError,
  ArtistUnavailablePeriodImpactChangedError,
  ArtistUnavailablePeriodNotFoundError,
  ArtistUnavailablePeriodReasonInvalidError,
  ArtistUnavailablePeriodScheduleConflictError,
  ArtistUnavailablePeriodStateConflictError,
  ArtistUnavailablePeriodTargetInvalidError,
} from './unavailability/artist-unavailability.errors';
import { ArtistUnavailabilityRequestInvalidError } from './unavailability/artist-unavailability-request.parser';

interface ErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
  readonly statusCode: number;
}

interface HttpResponse {
  header(name: string, value: string): HttpResponse;
  status(code: number): HttpResponse;
  send(body: ErrorResponse): void;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const mapped = this.map(exception);

    if (exception instanceof AuthRateLimitExceededError) {
      response.header('Retry-After', String(exception.retryAfterSeconds));
    }

    response.status(mapped.statusCode).send(mapped);
  }

  private map(exception: unknown): ErrorResponse {
    if (exception instanceof AuthRateLimitExceededError) {
      return this.response(
        HttpStatus.TOO_MANY_REQUESTS,
        exception.code,
        `请求过于频繁，请在 ${exception.retryAfterSeconds} 秒后重试`,
      );
    }

    if (exception instanceof ShiftDefinitionInvalidError) {
      const messages = {
        BREAK_PAIR_INCOMPLETE: '休息开始和休息结束必须同时填写',
        BREAK_TIME_ORDER_INVALID: '休息时间必须完整位于上下班时间内',
        TIME_OUT_OF_RANGE: '班次时间超出当天可设置范围',
        TIME_STEP_INVALID: '班次时间必须按 15 分钟设置',
        WORKDAY_DUPLICATED: '工作日不能重复选择',
        WORKDAY_INVALID: '工作日设置不正确',
        WORKDAYS_EMPTY: '请至少选择一个工作日',
        WORK_TIME_ORDER_INVALID: '下班时间必须晚于上班时间',
      } as const;
      return this.response(HttpStatus.BAD_REQUEST, exception.code, messages[exception.reason]);
    }

    if (
      exception instanceof AuthRequestInvalidError ||
      exception instanceof AuditQueryInvalidError ||
      exception instanceof BookingRequestInvalidError ||
      exception instanceof BookingDateInvalidError ||
      exception instanceof BookingDurationInvalidError ||
      exception instanceof BookingStartInvalidError ||
      exception instanceof FixedAvailabilityDateInvalidError ||
      exception instanceof FixedAvailabilityWeekdaysInvalidError ||
      exception instanceof FixedRequestReasonInvalidError ||
      exception instanceof FixedRequestReviewCommentInvalidError ||
      exception instanceof BookingIdempotencyKeyInvalidError ||
      exception instanceof BookingCancellationReasonInvalidError ||
      exception instanceof BookingCreationReasonInvalidError ||
      exception instanceof LeaveRequestInvalidError ||
      exception instanceof MasterDataRequestInvalidError ||
      exception instanceof OvertimeRequestInvalidError ||
      exception instanceof ShiftRequestInvalidError ||
      exception instanceof ShiftChangeReasonInvalidError ||
      exception instanceof LeaveReasonInvalidError ||
      exception instanceof OvertimeReasonInvalidError ||
      exception instanceof ScheduleDateOutOfRangeError ||
      exception instanceof ScheduleRequestInvalidError ||
      exception instanceof ScheduleSiteRequiredError ||
      exception instanceof ExportDateOutOfRangeError ||
      exception instanceof ExportIdempotencyKeyInvalidError ||
      exception instanceof ExportRequestInvalidError ||
      exception instanceof ArtistUnavailablePeriodReasonInvalidError ||
      exception instanceof ArtistUnavailabilityRequestInvalidError
    ) {
      return this.response(
        HttpStatus.BAD_REQUEST,
        exception.code,
        '填写内容有误，请检查日期、时间和必填项',
      );
    }

    if (exception instanceof AuthorizationDeniedError) {
      return this.response(HttpStatus.FORBIDDEN, exception.code, '无权执行该操作');
    }

    if (
      exception instanceof MasterDataNotFoundError ||
      exception instanceof AvailabilityArtistNotFoundError ||
      exception instanceof BookingAppointmentNotFoundError ||
      exception instanceof BookingHostNotFoundError ||
      exception instanceof FixedRequestNotFoundError ||
      exception instanceof BackofficeAccountNotFoundError ||
      exception instanceof LeaveNotFoundError ||
      exception instanceof OvertimeArtistNotFoundError ||
      exception instanceof OvertimeNotFoundError ||
      exception instanceof ShiftArtistNotFoundError ||
      exception instanceof ShiftChangeNotFoundError ||
      exception instanceof ExportNotFoundError ||
      exception instanceof ArtistUnavailablePeriodNotFoundError
    ) {
      return this.response(HttpStatus.NOT_FOUND, exception.code, '目标数据不存在');
    }

    if (exception instanceof BookingSecondConfirmationRequiredError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '这是当天第二次预约，请确认后重试');
    }

    if (exception instanceof BookingDailyLimitReachedError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '该主播当天最多预约两次');
    }

    if (exception instanceof BookingSlotConflictError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '该时段刚被占用，请重新选择');
    }

    if (exception instanceof BookingArtistUnavailableError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '该化妆师当天不可预约');
    }

    if (exception instanceof BookingHostUnavailableError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '该主播当天不可预约');
    }

    if (exception instanceof BookingCancellationCutoffError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '预约当天 0 点后不能取消');
    }

    if (exception instanceof InitialShiftAlreadyConfiguredError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '班次已经设置，请刷新页面后提交修改申请',
      );
    }

    if (exception instanceof ShiftChangeNoOpError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '新班次与当前班次相同，无需提交修改申请',
      );
    }

    if (exception instanceof ShiftChangePendingExistsError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '已有待审核的班次修改申请，请等待审核或先撤回原申请',
      );
    }

    if (exception instanceof ShiftChangeStateConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '这条班次申请已被处理，请刷新页面查看最新状态',
      );
    }

    if (exception instanceof LeaveFixedAppointmentRestoreConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '取消请假失败：原固定时段已被占用，请先调整冲突预约',
      );
    }

    if (
      exception instanceof BookingIdempotencyConflictError ||
      exception instanceof BookingIdempotencyIncompleteError
    ) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '该预约正在处理或已提交，请稍后查看排班，避免重复提交',
      );
    }

    if (exception instanceof MasterDataVersionConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '人员或场地资料已被其他人修改，请重新打开后再操作',
      );
    }

    if (exception instanceof BookingSiteMismatchError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '主播与化妆师不在同一场地，请重新选择',
      );
    }

    if (exception instanceof BookingStateConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '该预约已被取消、改期或修改，请返回排班查看最新结果',
      );
    }

    if (
      exception instanceof MasterDataDateRangeError ||
      exception instanceof MasterDataInactiveSiteError ||
      exception instanceof MasterDataSiteMismatchError
    ) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '人员关系的日期或场地不符合要求，请重新选择',
      );
    }

    if (exception instanceof LeaveDateRangeInvalidError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '请假只能选择未来七天内的连续日期');
    }

    if (exception instanceof LeaveImpactChangedError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '请假影响的预约数量已变化，请重新确认后提交',
      );
    }

    if (exception instanceof LeaveStateConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '该请假记录已被取消或处理，请返回请假列表查看最新状态',
      );
    }

    if (exception instanceof LeaveSubjectUnavailableError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '当前人员状态不允许请假，请联系所属场地客服',
      );
    }

    if (exception instanceof OvertimeArtistUnavailableError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '该化妆师当前不可申请加班');
    }

    if (exception instanceof OvertimeDateInvalidError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '加班只能选择未来七天内的日期');
    }

    if (exception instanceof OvertimePendingExistsError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '该日期已有待审核的加班申请，请先等待审核或撤回原申请',
      );
    }

    if (exception instanceof OvertimeShiftNotConfiguredError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '请先设置化妆师固定班次，再申请加班',
      );
    }

    if (exception instanceof OvertimeStateConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '该加班申请已被处理，请返回加班列表查看最新状态',
      );
    }

    if (exception instanceof OvertimeWorkingDayError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '所选日期本来就是工作日，无需申请加班',
      );
    }

    if (exception instanceof ShiftArtistUnavailableError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '该化妆师当前不可修改班次');
    }

    if (exception instanceof ShiftChangeEffectiveDateError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '班次修改只能选择允许的未来生效日期',
      );
    }

    if (exception instanceof FixedRequestStateConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '该固定申请已被处理或撤回，请查看最新申请记录',
      );
    }

    if (exception instanceof FixedRequestUnavailableError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '所选固定关系或时间已不可用，请重新选择主播、化妆师和时间',
      );
    }

    if (exception instanceof ExportIdempotencyConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '相同的排班导出任务正在处理中，请勿重复提交',
      );
    }

    if (exception instanceof ExportSiteUnavailableError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '所选场地当前无法导出排班');
    }

    if (exception instanceof ExportStateConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '导出任务状态已变化，请返回导出记录查看最新结果',
      );
    }

    if (exception instanceof ExportFileUnavailableError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '排班文件尚未生成或已经过期，请重新导出',
      );
    }

    if (exception instanceof ArtistUnavailablePeriodDateInvalidError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '临时不可排班只能选择未来七天内的日期',
      );
    }

    if (exception instanceof ArtistUnavailablePeriodImpactChangedError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '受影响的预约数量已变化，请重新确认后提交',
      );
    }

    if (exception instanceof ArtistUnavailablePeriodScheduleConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '所选时段不在当天可排班时间内，请重新选择',
      );
    }

    if (exception instanceof ArtistUnavailablePeriodStateConflictError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '该临时不可排班记录已被撤销，请查看最新列表',
      );
    }

    if (exception instanceof ArtistUnavailablePeriodTargetInvalidError) {
      return this.response(
        HttpStatus.CONFLICT,
        exception.code,
        '只能为本人或所属场地的化妆师设置临时不可排班',
      );
    }

    if (
      exception instanceof BackofficeAccountConflictError ||
      exception instanceof LastAdministratorError
    ) {
      return this.response(HttpStatus.CONFLICT, exception.code, '账号或角色状态冲突');
    }

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2004'].includes(exception.code)
    ) {
      return this.response(HttpStatus.CONFLICT, 'MASTER_DATA_CONFLICT', '数据已存在或存在冲突');
    }

    if (
      exception instanceof AuthSessionInvalidError ||
      exception instanceof AccountLoginDeniedError ||
      exception instanceof BackofficeLoginDeniedError
    ) {
      return this.response(HttpStatus.UNAUTHORIZED, exception.code, '登录状态无效或账号不可用');
    }

    if (
      exception instanceof AuthConfigurationError ||
      exception instanceof RateLimitConfigurationError ||
      exception instanceof RateLimitUnavailableError
    ) {
      return this.response(HttpStatus.SERVICE_UNAVAILABLE, exception.code, '登录服务暂不可用');
    }

    if (exception instanceof HttpException) {
      return this.response(exception.getStatus(), 'HTTP_ERROR', '请求未能处理');
    }

    return this.response(HttpStatus.INTERNAL_SERVER_ERROR, 'INTERNAL_ERROR', '服务暂时异常');
  }

  private response(statusCode: number, code: string, message: string): ErrorResponse {
    return { error: { code, message }, statusCode };
  }
}
