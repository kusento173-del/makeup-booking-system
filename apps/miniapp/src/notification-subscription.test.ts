import { describe, expect, it, vi } from 'vitest';

vi.mock('@tarojs/taro', () => ({ default: {} }));

import { mapSubscriptionDecisions, type SubscriptionGroup } from './notification-subscription';

const group: SubscriptionGroup = {
  requestId: '019b0000-0000-7000-8000-000000000001',
  subscriptionType: 'ONE_TIME',
  templates: [
    {
      providerTemplateKey: 'wechat-template-1',
      templateCode: 'APPOINTMENT_NOTICE',
      templateVersionId: '019b0000-0000-7000-8000-000000000002',
    },
    {
      providerTemplateKey: 'wechat-template-2',
      templateCode: 'APPOINTMENT_NOTICE',
      templateVersionId: '019b0000-0000-7000-8000-000000000003',
    },
  ],
};

describe('subscription decision mapping', () => {
  it('maps only official template results to backend decision records', () => {
    expect(
      mapSubscriptionDecisions(group, {
        errMsg: 'requestSubscribeMessage:ok',
        'wechat-template-1': 'accept',
        'wechat-template-2': 'ban',
      }),
    ).toEqual([
      { decision: 'ACCEPT', templateVersionId: group.templates[0]?.templateVersionId },
      { decision: 'BAN', templateVersionId: group.templates[1]?.templateVersionId },
    ]);
    expect(mapSubscriptionDecisions(group, { 'wechat-template-1': 'unknown' })).toEqual([]);
  });
});
