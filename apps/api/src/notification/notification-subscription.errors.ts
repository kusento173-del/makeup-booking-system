export class NotificationSubscriptionRequestInvalidError extends Error {
  readonly code = 'NOTIFICATION_SUBSCRIPTION_REQUEST_INVALID';

  constructor() {
    super('Notification subscription request is invalid');
    this.name = 'NotificationSubscriptionRequestInvalidError';
  }
}

export class NotificationSubscriptionStateConflictError extends Error {
  readonly code = 'NOTIFICATION_SUBSCRIPTION_STATE_CONFLICT';

  constructor() {
    super('Notification subscription request conflicts with existing state');
    this.name = 'NotificationSubscriptionStateConflictError';
  }
}
