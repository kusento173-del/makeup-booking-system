export class BindingCodeConfigurationError extends Error {
  readonly code = 'BINDING_CODE_CONFIGURATION_ERROR';

  constructor() {
    super('AUTH_BINDING_CODE_PEPPER must contain at least 32 characters');
    this.name = 'BindingCodeConfigurationError';
  }
}

export class BindingTargetNotFoundError extends Error {
  readonly code = 'BINDING_TARGET_NOT_FOUND';

  constructor() {
    super('The binding target was not found');
    this.name = 'BindingTargetNotFoundError';
  }
}

export class BindingTargetUnavailableError extends Error {
  readonly code = 'BINDING_TARGET_UNAVAILABLE';

  constructor() {
    super('The binding target is inactive, already bound, or belongs to an inactive site');
    this.name = 'BindingTargetUnavailableError';
  }
}

export class BindingCodeInvalidError extends Error {
  readonly code = 'BINDING_CODE_INVALID';

  constructor() {
    super('The binding code is invalid or unavailable');
    this.name = 'BindingCodeInvalidError';
  }
}
