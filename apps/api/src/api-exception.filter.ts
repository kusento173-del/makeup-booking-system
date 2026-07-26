import { Prisma } from '@makeup/database';
import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { AuthRequestInvalidError } from './auth/auth-request.parser';
import { BackofficeLoginDeniedError } from './auth/backoffice-auth.errors';
import {
  AuthRateLimitExceededError,
  RateLimitConfigurationError,
  RateLimitUnavailableError,
} from './auth/auth-rate-limit.errors';
import { AuthSessionInvalidError, AuthConfigurationError } from './auth/auth-session.errors';
import { AuthorizationDeniedError } from './auth/authorization-policy.service';
import {
  BindingCodeConfigurationError,
  BindingCodeInvalidError,
  BindingTargetNotFoundError,
  BindingTargetUnavailableError,
} from './auth/binding-code.errors';
import {
  AccountLoginDeniedError,
  BindingChallengeInvalidError,
  WechatLoginConfigurationError,
  WechatLoginFailedError,
} from './auth/wechat-login.errors';
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

    if (
      exception instanceof AuthRequestInvalidError ||
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
      exception instanceof ShiftDefinitionInvalidError ||
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
      return this.response(HttpStatus.BAD_REQUEST, exception.code, '请求内容不正确');
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

    if (exception instanceof BindingTargetNotFoundError) {
      return this.response(HttpStatus.NOT_FOUND, exception.code, '绑定目标不存在');
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
      return this.response(HttpStatus.CONFLICT, exception.code, '预约请求状态冲突，请刷新后重试');
    }

    if (
      exception instanceof MasterDataVersionConflictError ||
      exception instanceof BookingSiteMismatchError ||
      exception instanceof BookingStateConflictError ||
      exception instanceof MasterDataDateRangeError ||
      exception instanceof MasterDataInactiveSiteError ||
      exception instanceof MasterDataSiteMismatchError ||
      exception instanceof LeaveDateRangeInvalidError ||
      exception instanceof LeaveImpactChangedError ||
      exception instanceof LeaveStateConflictError ||
      exception instanceof LeaveSubjectUnavailableError ||
      exception instanceof OvertimeArtistUnavailableError ||
      exception instanceof OvertimeDateInvalidError ||
      exception instanceof OvertimePendingExistsError ||
      exception instanceof OvertimeShiftNotConfiguredError ||
      exception instanceof OvertimeStateConflictError ||
      exception instanceof OvertimeWorkingDayError ||
      exception instanceof InitialShiftAlreadyConfiguredError ||
      exception instanceof ShiftArtistUnavailableError ||
      exception instanceof ShiftChangeEffectiveDateError ||
      exception instanceof ShiftChangeNoOpError ||
      exception instanceof ShiftChangePendingExistsError ||
      exception instanceof ShiftChangeStateConflictError ||
      exception instanceof FixedRequestStateConflictError ||
      exception instanceof FixedRequestUnavailableError ||
      exception instanceof ExportIdempotencyConflictError ||
      exception instanceof ExportSiteUnavailableError ||
      exception instanceof ExportStateConflictError ||
      exception instanceof ExportFileUnavailableError ||
      exception instanceof ArtistUnavailablePeriodDateInvalidError ||
      exception instanceof ArtistUnavailablePeriodImpactChangedError ||
      exception instanceof ArtistUnavailablePeriodScheduleConflictError ||
      exception instanceof ArtistUnavailablePeriodStateConflictError ||
      exception instanceof ArtistUnavailablePeriodTargetInvalidError
    ) {
      return this.response(HttpStatus.CONFLICT, exception.code, '数据状态冲突，请刷新后重试');
    }

    if (
      exception instanceof BackofficeAccountConflictError ||
      exception instanceof LastAdministratorError
    ) {
      return this.response(HttpStatus.CONFLICT, exception.code, '账号或角色状态冲突');
    }

    if (exception instanceof BindingTargetUnavailableError) {
      return this.response(HttpStatus.CONFLICT, exception.code, '目标当前不能签发绑定码');
    }

    if (
      exception instanceof Prisma.PrismaClientKnownRequestError &&
      ['P2002', 'P2003', 'P2004'].includes(exception.code)
    ) {
      return this.response(HttpStatus.CONFLICT, 'MASTER_DATA_CONFLICT', '数据已存在或存在冲突');
    }

    if (
      exception instanceof BindingCodeInvalidError ||
      exception instanceof BindingChallengeInvalidError
    ) {
      return this.response(HttpStatus.BAD_REQUEST, exception.code, '绑定凭证无效或已失效');
    }

    if (
      exception instanceof AuthSessionInvalidError ||
      exception instanceof AccountLoginDeniedError ||
      exception instanceof BackofficeLoginDeniedError ||
      exception instanceof WechatLoginFailedError
    ) {
      return this.response(HttpStatus.UNAUTHORIZED, exception.code, '登录状态无效或账号不可用');
    }

    if (
      exception instanceof AuthConfigurationError ||
      exception instanceof BindingCodeConfigurationError ||
      exception instanceof RateLimitConfigurationError ||
      exception instanceof RateLimitUnavailableError ||
      exception instanceof WechatLoginConfigurationError
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
