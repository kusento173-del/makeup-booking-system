import { useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { makeupTypeLabel } from './makeup-type';
import { listMyFixedRelations, type MyFixedRelation, type MobileRoleCode } from './mobile-api';
import { minuteLabel, WEEKDAYS } from './mobile-utils';

function weekdayLabel(weekdays: readonly number[]): string {
  return weekdays
    .map((weekday) => WEEKDAYS.find(({ id }) => id === weekday)?.label)
    .filter(Boolean)
    .join('、');
}

export function MobileFixedRelations({
  roleCode,
  session,
}: {
  readonly roleCode: MobileRoleCode;
  readonly session: SessionTokenPair;
}) {
  const [relations, setRelations] = useState<readonly MyFixedRelation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (roleCode === 'OPERATOR') {
      setLoading(false);
      return;
    }
    let active = true;
    void listMyFixedRelations(session.accessToken)
      .then((items) => active && setRelations(items))
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof ApiError ? cause.message : '固定关系读取失败');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [roleCode, session.accessToken]);

  if (roleCode === 'OPERATOR') return null;

  return (
    <section aria-label={roleCode === 'HOST' ? '我的固定化妆师' : '我的固定主播'}>
      <h2>{roleCode === 'HOST' ? '固定化妆师' : '固定主播名单'}</h2>
      {loading ? <p className="mobile-state">正在读取固定关系…</p> : null}
      {error ? <p className="form-error">{error}</p> : null}
      {!loading && !error && relations.length === 0 ? (
        <p className="mobile-state">
          {roleCode === 'HOST' ? '当前没有固定化妆师。' : '当前没有固定主播。'}
        </p>
      ) : null}
      <div className="mobile-list">
        {relations.map((relation) => (
          <article className="mobile-card" key={relation.id}>
            <strong>
              {roleCode === 'HOST'
                ? `固定化妆师：${relation.artistNickname}`
                : `固定主播：${relation.hostName}（${relation.hostCode}）`}
            </strong>
            <p className="mobile-meta">
              {weekdayLabel(relation.weekdays)} · {minuteLabel(relation.startMinute)}–
              {minuteLabel(relation.startMinute + relation.durationMinutes)} ·{' '}
              {makeupTypeLabel(relation.durationMinutes)}
            </p>
            <p className="mobile-meta">
              {relation.siteName} · {relation.validFrom} 起
              {relation.validUntil ? `，至 ${relation.validUntil}` : ''}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
