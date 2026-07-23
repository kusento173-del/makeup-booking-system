import { describe, expect, it } from 'vitest';

import { NotificationTemplateRequestInvalidError } from './notification-template.errors';
import {
  parseActivateNotificationTemplateRequest,
  parseCreateNotificationTemplateRequest,
  parseRetireNotificationTemplateRequest,
} from './notification-template-request.parser';

describe('notification template request parser', () => {
  it('accepts only the supported strict create contract', () => {
    expect(
      parseCreateNotificationTemplateRequest({
        providerTemplateKey: ' template-1 ',
        recipientRoleCode: 'HOST',
        subscriptionType: 'ONE_TIME',
        templateCode: 'APPOINTMENT_NOTICE',
        variableMappings: ['thing1=hostName', 'time2=timeRange'],
      }),
    ).toEqual({
      providerTemplateKey: 'template-1',
      recipientRoleCode: 'HOST',
      subscriptionType: 'ONE_TIME',
      templateCode: 'APPOINTMENT_NOTICE',
      variableMappings: ['thing1=hostName', 'time2=timeRange'],
    });
    expect(() =>
      parseCreateNotificationTemplateRequest({
        extra: true,
        providerTemplateKey: 'template-1',
        recipientRoleCode: 'HOST',
        subscriptionType: 'ONE_TIME',
        templateCode: 'APPOINTMENT_NOTICE',
        variableMappings: [],
      }),
    ).toThrow(NotificationTemplateRequestInvalidError);
    expect(() =>
      parseCreateNotificationTemplateRequest({
        providerTemplateKey: 'template-1',
        recipientRoleCode: 'CUSTOMER_SERVICE',
        subscriptionType: 'ONE_TIME',
        templateCode: 'APPOINTMENT_NOTICE',
        variableMappings: ['thing1=hostName'],
      }),
    ).toThrow(NotificationTemplateRequestInvalidError);
  });

  it('parses activate and retire row-version commands without coercion', () => {
    expect(parseActivateNotificationTemplateRequest({ expectedRowVersion: 2 })).toEqual({
      expectedRowVersion: 2,
    });
    expect(
      parseRetireNotificationTemplateRequest({ expectedRowVersion: 3, reason: ' 模板调整 ' }),
    ).toEqual({ expectedRowVersion: 3, reason: '模板调整' });
    expect(() => parseActivateNotificationTemplateRequest({ expectedRowVersion: '2' })).toThrow(
      NotificationTemplateRequestInvalidError,
    );
  });
});
