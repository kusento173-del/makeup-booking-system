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
import { BindingCodeInvalidError } from './auth/binding-code.errors';
import {
  AccountLoginDeniedError,
  BindingChallengeInvalidError,
  WechatLoginConfigurationError,
  WechatLoginFailedError,
} from './auth/wechat-login.errors';
import { MasterDataRequestInvalidError } from './master-data/master-data-request.parser';
import {
  MasterDataDateRangeError,
  MasterDataInactiveSiteError,
  MasterDataNotFoundError,
  MasterDataSiteMismatchError,
  MasterDataVersionConflictError,
} from './master-data/master-data.errors';

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
      exception instanceof MasterDataRequestInvalidError
    ) {
      return this.response(HttpStatus.BAD_REQUEST, exception.code, '请求内容不正确');
    }

    if (exception instanceof AuthorizationDeniedError) {
      return this.response(HttpStatus.FORBIDDEN, exception.code, '无权执行该操作');
    }

    if (exception instanceof MasterDataNotFoundError) {
      return this.response(HttpStatus.NOT_FOUND, exception.code, '目标数据不存在');
    }

    if (
      exception instanceof MasterDataVersionConflictError ||
      exception instanceof MasterDataDateRangeError ||
      exception instanceof MasterDataInactiveSiteError ||
      exception instanceof MasterDataSiteMismatchError
    ) {
      return this.response(HttpStatus.CONFLICT, exception.code, '数据状态冲突，请刷新后重试');
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
