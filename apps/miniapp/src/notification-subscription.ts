import Taro from '@tarojs/taro';

import { apiRequest } from './api-client';

export type SubscriptionDecision = 'ACCEPT' | 'REJECT' | 'BAN' | 'FILTER';

export interface SubscriptionGroup {
  readonly requestId: string;
  readonly subscriptionType: 'ONE_TIME' | 'PERMANENT';
  readonly templates: readonly {
    readonly providerTemplateKey: string;
    readonly templateCode: 'APPOINTMENT_NOTICE';
    readonly templateVersionId: string;
  }[];
}

const RESULT_MAP = {
  accept: 'ACCEPT',
  ban: 'BAN',
  filter: 'FILTER',
  reject: 'REJECT',
} as const;

export function listSubscriptionGroups(token: string): Promise<readonly SubscriptionGroup[]> {
  return apiRequest('/notification-subscriptions/templates', { token });
}

export function mapSubscriptionDecisions(
  group: SubscriptionGroup,
  result: Readonly<Record<string, unknown>>,
): readonly { readonly decision: SubscriptionDecision; readonly templateVersionId: string }[] {
  return group.templates.flatMap((template) => {
    const decision = RESULT_MAP[result[template.providerTemplateKey] as keyof typeof RESULT_MAP];
    return decision ? [{ decision, templateVersionId: template.templateVersionId }] : [];
  });
}

export async function requestSubscription(
  token: string,
  group: SubscriptionGroup,
): Promise<readonly SubscriptionDecision[]> {
  const option = {
    tmplIds: group.templates.map((template) => template.providerTemplateKey),
  } as unknown as Taro.requestSubscribeMessage.Option;
  const result = await Taro.requestSubscribeMessage(option);
  const decisions = mapSubscriptionDecisions(group, result as Readonly<Record<string, unknown>>);
  if (decisions.length === 0) throw new Error('微信未返回有效的订阅结果');
  await apiRequest('/notification-subscriptions/decisions', {
    body: { decisions, requestId: group.requestId },
    method: 'POST',
    token,
  });
  return decisions.map((item) => item.decision);
}
