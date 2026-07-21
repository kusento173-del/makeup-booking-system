import { Injectable } from '@nestjs/common';

import type { AuditJsonValue, AuditSnapshot } from './audit.types';

const SENSITIVE_KEYS = new Set([
  'accesstoken',
  'authorization',
  'cookie',
  'externalsubject',
  'mobile',
  'mobileciphertext',
  'mobilehash',
  'mobilenumber',
  'openid',
  'password',
  'passwordhash',
  'phone',
  'phonenumber',
  'refreshtoken',
  'token',
  'unionid',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll(/[-_]/g, '');
}

function isAuditArray(value: AuditJsonValue): value is readonly AuditJsonValue[] {
  return Array.isArray(value);
}

function sanitizeValue(value: AuditJsonValue): AuditJsonValue {
  if (isAuditArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === 'object') {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(snapshot: AuditSnapshot): AuditSnapshot {
  return Object.fromEntries(
    Object.entries(snapshot)
      .filter(([key]) => !SENSITIVE_KEYS.has(normalizeKey(key)))
      .map(([key, value]) => [key, sanitizeValue(value)]),
  );
}

@Injectable()
export class AuditSnapshotSanitizerService {
  sanitize(snapshot: AuditSnapshot): AuditSnapshot {
    return sanitizeObject(snapshot);
  }
}
