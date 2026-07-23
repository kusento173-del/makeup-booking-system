export class NotificationTaskRequestInvalidError extends Error {
  readonly code = 'NOTIFICATION_TASK_REQUEST_INVALID';

  constructor() {
    super('Notification task request is invalid');
    this.name = 'NotificationTaskRequestInvalidError';
  }
}

export class NotificationTaskNotFoundError extends Error {
  readonly code = 'NOTIFICATION_TASK_NOT_FOUND';

  constructor() {
    super('Notification task was not found');
    this.name = 'NotificationTaskNotFoundError';
  }
}

export class NotificationTaskRetryConflictError extends Error {
  readonly code = 'NOTIFICATION_TASK_RETRY_CONFLICT';

  constructor() {
    super('Notification task cannot be retried');
    this.name = 'NotificationTaskRetryConflictError';
  }
}
