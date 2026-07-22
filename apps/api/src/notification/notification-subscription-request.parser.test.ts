import { describe, expect, it } from 'vitest';

import { NotificationSubscriptionRequestInvalidError } from './notification-subscription.errors';
import { parseNotificationSubscriptionRequest } from './notification-subscription-request.parser';

const requestId = '019b0000-0000-7000-8000-000000000001';
const templateVersionId = '019b0000-0000-7000-8000-000000000002';

describe('notification subscription request parser', () => {
  it('accepts only the four official decision values and a strict UUID contract', () => {
    expect(
      parseNotificationSubscriptionRequest({
        decisions: [{ decision: 'ACCEPT', templateVersionId }],
        requestId,
      }),
    ).toEqual({ decisions: [{ decision: 'ACCEPT', templateVersionId }], requestId });

    expect(() =>
      parseNotificationSubscriptionRequest({
        decisions: [{ decision: 'UNKNOWN', templateVersionId }],
        requestId,
      }),
    ).toThrow(NotificationSubscriptionRequestInvalidError);
  });

  it('rejects duplicate templates and more than five results', () => {
    expect(() =>
      parseNotificationSubscriptionRequest({
        decisions: [
          { decision: 'ACCEPT', templateVersionId },
          { decision: 'REJECT', templateVersionId },
        ],
        requestId,
      }),
    ).toThrow(NotificationSubscriptionRequestInvalidError);

    expect(() =>
      parseNotificationSubscriptionRequest({
        decisions: Array.from({ length: 6 }, (_, index) => ({
          decision: 'ACCEPT',
          templateVersionId: `019b0000-0000-7000-8000-${String(index + 10).padStart(12, '0')}`,
        })),
        requestId,
      }),
    ).toThrow(NotificationSubscriptionRequestInvalidError);
  });
});
