import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import { AuthorizationPolicyService } from '../auth/authorization-policy.service';
import type { RoleCode } from '../auth/authorization.types';
import { DatabaseService } from '../database/database.service';
import { acquireTransactionLock } from '../database/transaction-lock';
import { NotificationSubscriptionStateConflictError } from './notification-subscription.errors';
import type {
  NotificationSubscriptionContext,
  NotificationSubscriptionGroup,
  NotificationSubscriptionRecorded,
  RecordNotificationSubscriptionCommand,
} from './notification-subscription.types';
import { NOTIFICATION_TEMPLATE_CODES } from './notification-template.types';

const SUBSCRIBER_ROLES: readonly RoleCode[] = ['HOST', 'OPERATOR', 'ARTIST'];

@Injectable()
export class NotificationSubscriptionService {
  constructor(
    private readonly authorization: AuthorizationPolicyService,
    private readonly database: DatabaseService,
  ) {}

  async listActive(
    context: NotificationSubscriptionContext,
  ): Promise<readonly NotificationSubscriptionGroup[]> {
    this.authorization.assertRole(context, SUBSCRIBER_ROLES);
    const templates = await this.database.read((client) =>
      client.notificationTemplateVersion.findMany({
        orderBy: [{ subscriptionType: 'asc' }, { templateCode: 'asc' }],
        select: {
          id: true,
          providerTemplateKey: true,
          subscriptionType: true,
          templateCode: true,
        },
        where: {
          channel: 'WECHAT_MINI_PROGRAM',
          status: 'ACTIVE',
          templateCode: { in: [...NOTIFICATION_TEMPLATE_CODES] },
        },
      }),
    );
    const groups: NotificationSubscriptionGroup[] = [];
    for (const subscriptionType of ['ONE_TIME', 'PERMANENT'] as const) {
      const matching = templates.filter(
        (template) =>
          template.subscriptionType === subscriptionType && template.providerTemplateKey,
      );
      for (let index = 0; index < matching.length; index += 5) {
        groups.push({
          requestId: randomUUID(),
          subscriptionType,
          templates: matching.slice(index, index + 5).map((template) => ({
            providerTemplateKey: template.providerTemplateKey as string,
            templateCode: template.templateCode as (typeof NOTIFICATION_TEMPLATE_CODES)[number],
            templateVersionId: template.id,
          })),
        });
      }
    }
    return groups;
  }

  record(
    context: NotificationSubscriptionContext,
    command: RecordNotificationSubscriptionCommand,
  ): Promise<NotificationSubscriptionRecorded> {
    this.authorization.assertRole(context, SUBSCRIBER_ROLES);
    return this.database.transaction(async (transaction) => {
      await acquireTransactionLock(
        transaction,
        `notification-subscription:${context.userId}:${command.requestId}`,
      );
      const existing = await transaction.notificationSubscriptionDecision.findMany({
        orderBy: { templateVersionId: 'asc' },
        select: { decision: true, templateVersionId: true },
        where: { clientRequestId: command.requestId, userId: context.userId },
      });
      const expected = [...command.decisions].sort((left, right) =>
        left.templateVersionId.localeCompare(right.templateVersionId),
      );
      if (existing.length > 0) {
        if (
          existing.length !== expected.length ||
          existing.some(
            (item, index) =>
              item.templateVersionId !== expected[index]?.templateVersionId ||
              item.decision !== expected[index]?.decision,
          )
        ) {
          throw new NotificationSubscriptionStateConflictError();
        }
        return { recordedCount: existing.length, requestId: command.requestId };
      }

      const templates = await transaction.notificationTemplateVersion.findMany({
        select: {
          channel: true,
          id: true,
          providerTemplateKey: true,
          status: true,
          subscriptionType: true,
          templateCode: true,
        },
        where: { id: { in: command.decisions.map((item) => item.templateVersionId) } },
      });
      if (
        templates.length !== command.decisions.length ||
        new Set(templates.map((item) => item.subscriptionType)).size !== 1 ||
        templates.some(
          (item) =>
            item.channel !== 'WECHAT_MINI_PROGRAM' ||
            !item.providerTemplateKey ||
            !['ACTIVE', 'RETIRED'].includes(item.status) ||
            !NOTIFICATION_TEMPLATE_CODES.includes(
              item.templateCode as (typeof NOTIFICATION_TEMPLATE_CODES)[number],
            ),
        )
      ) {
        throw new NotificationSubscriptionStateConflictError();
      }
      const decisions = new Map(
        command.decisions.map((item) => [item.templateVersionId, item.decision]),
      );
      await transaction.notificationSubscriptionDecision.createMany({
        data: templates.map((template) => ({
          clientRequestId: command.requestId,
          decision: decisions.get(template.id) as string,
          providerTemplateKeySnapshot: template.providerTemplateKey as string,
          roleCode: context.roleCode,
          siteId: context.siteId,
          subscriptionTypeSnapshot: template.subscriptionType,
          templateVersionId: template.id,
          userId: context.userId,
        })),
      });
      return { recordedCount: templates.length, requestId: command.requestId };
    });
  }
}
