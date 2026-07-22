import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { AuthRequestInvalidError } from './auth/auth-request.parser';
import {
  AuthRateLimitExceededError,
  RateLimitConfigurationError,
  RateLimitUnavailableError,
} from './auth/auth-rate-limit.errors';
import { AuthSessionInvalidError, AuthConfigurationError } from './auth/auth-session.errors';
import { BindingCodeInvalidError } from './auth/binding-code.errors';
import {
  AccountLoginDeniedError,
  BindingChallengeInvalidError,
  WechatLoginConfigurationError,
  WechatLoginFailedError,
} from './auth/wechat-login.errors';

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

    if (exception instanceof AuthRequestInvalidError) {
      return this.response(HttpStatus.BAD_REQUEST, exception.code, '请求内容不正确');
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
