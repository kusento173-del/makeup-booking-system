export class NotificationTemplateRequestInvalidError extends Error {
  readonly code = 'NOTIFICATION_TEMPLATE_REQUEST_INVALID';

  constructor() {
    super('Notification template request is invalid');
    this.name = 'NotificationTemplateRequestInvalidError';
  }
}

export class NotificationTemplateNotFoundError extends Error {
  readonly code = 'NOTIFICATION_TEMPLATE_NOT_FOUND';

  constructor() {
    super('Notification template was not found');
    this.name = 'NotificationTemplateNotFoundError';
  }
}

export class NotificationTemplateStateConflictError extends Error {
  readonly code = 'NOTIFICATION_TEMPLATE_STATE_CONFLICT';

  constructor() {
    super('Notification template state conflicts with the requested operation');
    this.name = 'NotificationTemplateStateConflictError';
  }
}
