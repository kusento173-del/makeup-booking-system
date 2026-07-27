const BUSINESS_TIME_ZONE = 'Asia/Shanghai';

interface HostQualificationRecord {
  readonly qualificationStatus: string;
  readonly qualificationValidUntil: Date | null;
}

function businessDate(value: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values['year']}-${values['month']}-${values['day']}`;
}

export function isHostQualifiedOn(host: HostQualificationRecord, date: Date): boolean {
  if (host.qualificationStatus === 'ACTIVE') {
    return true;
  }
  return Boolean(
    host.qualificationStatus === 'CANCELLED' &&
    host.qualificationValidUntil &&
    businessDate(date) > host.qualificationValidUntil.toISOString().slice(0, 10),
  );
}

export function effectiveHostQualification(
  host: HostQualificationRecord,
  date: Date,
): 'ACTIVE' | 'CANCELLED' {
  return isHostQualifiedOn(host, date) ? 'ACTIVE' : 'CANCELLED';
}
