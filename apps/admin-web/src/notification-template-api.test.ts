import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  activateNotificationTemplate,
  createNotificationTemplate,
  type NotificationTemplate,
} from './notification-template-api';

const template = {
  id: 'template-version-1',
  rowVersion: 2,
} as NotificationTemplate;

describe('notification template API client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('creates a strict template draft request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'template-version-1', status: 'DRAFT' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 201,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createNotificationTemplate('access-token', {
      providerTemplateKey: 'wechat-template-1',
      templateCode: 'APPOINTMENT_CREATED',
      variableMappings: ['thing1=hostName'],
    });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/notification-templates');
    expect(JSON.parse(init.body as string)).toEqual({
      providerTemplateKey: 'wechat-template-1',
      templateCode: 'APPOINTMENT_CREATED',
      variableMappings: ['thing1=hostName'],
    });
  });

  it('activates with the displayed row version', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: template.id, status: 'ACTIVE' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await activateNotificationTemplate('access-token', template);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/notification-templates/template-version-1/activate');
    expect(JSON.parse(init.body as string)).toEqual({ expectedRowVersion: 2 });
  });
});
