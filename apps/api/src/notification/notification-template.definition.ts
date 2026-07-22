import type { NotificationTemplateCode } from './notification-template.types';

const APPOINTMENT_SAMPLES = {
  appointmentDate: '2026-07-23',
  artistName: '柔柔',
  durationMinutes: '30',
  endAt: '2026-07-23T02:00:00.000Z',
  endTime: '10:00',
  hostCode: 'ZB01842',
  hostName: '小雨',
  siteName: '松江场地',
  startAt: '2026-07-23T01:30:00.000Z',
  startTime: '09:30',
  timeRange: '09:30~10:00',
} as const;

export const NOTIFICATION_TEMPLATE_SAMPLE_FIELDS: Readonly<
  Record<NotificationTemplateCode, Readonly<Record<string, string>>>
> = {
  APPOINTMENT_CANCELLED: APPOINTMENT_SAMPLES,
  APPOINTMENT_CREATED: APPOINTMENT_SAMPLES,
  APPOINTMENT_RESCHEDULED: APPOINTMENT_SAMPLES,
};

export const WECHAT_VARIABLE_MAPPING =
  /^(thing|number|letter|symbol|character_string|time|date|amount|phone_number|car_number|name|phrase|enum)\d{1,2}=([A-Za-z][A-Za-z0-9]*)$/;

export function mappedTemplateData(
  templateCode: NotificationTemplateCode,
  mappings: readonly string[],
): Readonly<Record<string, { readonly value: string }>> {
  const samples = NOTIFICATION_TEMPLATE_SAMPLE_FIELDS[templateCode];
  return Object.fromEntries(
    mappings.map((mapping) => {
      const [providerKey, payloadKey] = mapping.split('=');
      if (!providerKey || !payloadKey || !(payloadKey in samples)) {
        throw new Error('Stored notification template mapping is invalid');
      }
      const value = samples[payloadKey];
      if (!value) throw new Error('Stored notification template mapping is invalid');
      return [providerKey, { value }];
    }),
  );
}
