export class WechatLoginConfigurationError extends Error {
  readonly code = 'WECHAT_LOGIN_CONFIGURATION_ERROR';

  constructor() {
    super('WeChat Mini Program credentials are not configured');
    this.name = 'WechatLoginConfigurationError';
  }
}

export class WechatLoginFailedError extends Error {
  readonly code = 'WECHAT_LOGIN_FAILED';

  constructor() {
    super('WeChat login failed');
    this.name = 'WechatLoginFailedError';
  }
}

export class AccountLoginDeniedError extends Error {
  readonly code = 'ACCOUNT_LOGIN_DENIED';

  constructor() {
    super('The account cannot log in');
    this.name = 'AccountLoginDeniedError';
  }
}

export class BindingChallengeInvalidError extends Error {
  readonly code = 'BINDING_CHALLENGE_INVALID';

  constructor() {
    super('The binding challenge is invalid or unavailable');
    this.name = 'BindingChallengeInvalidError';
  }
}
