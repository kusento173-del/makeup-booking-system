import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { APPROVAL_STATUS_LABELS } from './business-labels';
import {
  cancelUnavailablePeriod,
  createOvertime,
  createUnavailablePeriod,
  getCurrentShift,
  getLatestShiftChange,
  getOwnArtist,
  listOvertimes,
  listUnavailablePeriods,
  type MobileArtist,
  type OvertimeRecord,
  previewUnavailablePeriod,
  setInitialShift,
  type ShiftChange,
  type ShiftDefinition,
  submitShiftChange,
  type UnavailablePeriod,
  withdrawOvertime,
  withdrawShiftChange,
} from './mobile-api';
import { businessDate, minuteLabel, timeToMinute, WEEKDAYS } from './mobile-utils';

export type ArtistTool = 'overtime' | 'shift' | 'unavailability';

interface ShiftDraft {
  readonly breakEnd: string;
  readonly breakStart: string;
  readonly workEnd: string;
  readonly workStart: string;
  readonly workdays: readonly number[];
}

const DEFAULT_SHIFT: ShiftDraft = {
  breakEnd: '13:00',
  breakStart: '12:00',
  workEnd: '18:00',
  workStart: '09:00',
  workdays: [1, 2, 3, 4, 5],
};

function workdayLabels(workdays: readonly number[]): string {
  return WEEKDAYS.filter((day) => workdays.includes(day.id))
    .map((day) => day.label)
    .join('、');
}

function breakLabel(shift: ShiftDefinition): string {
  return shift.breakStartMinute === null || shift.breakEndMinute === null
    ? '无固定休息时段'
    : `${minuteLabel(shift.breakStartMinute)}—${minuteLabel(shift.breakEndMinute)}`;
}

function definition(draft: ShiftDraft): ShiftDefinition {
  return {
    breakEndMinute: draft.breakEnd ? timeToMinute(draft.breakEnd) : null,
    breakStartMinute: draft.breakStart ? timeToMinute(draft.breakStart) : null,
    workEndMinute: timeToMinute(draft.workEnd),
    workStartMinute: timeToMinute(draft.workStart),
    workdays: draft.workdays,
  };
}

function ShiftFields({
  draft,
  onChange,
  showWeekdays,
}: {
  readonly draft: ShiftDraft;
  readonly onChange: (draft: ShiftDraft) => void;
  readonly showWeekdays: boolean;
}) {
  return (
    <>
      {showWeekdays ? (
        <fieldset>
          <legend>工作日</legend>
          <div className="weekday-grid">
            {WEEKDAYS.map((day) => (
              <label key={day.id}>
                <input
                  checked={draft.workdays.includes(day.id)}
                  onChange={(event) =>
                    onChange({
                      ...draft,
                      workdays: event.target.checked
                        ? [...draft.workdays, day.id].sort()
                        : draft.workdays.filter((value) => value !== day.id),
                    })
                  }
                  type="checkbox"
                />
                {day.label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="two-column-fields">
        {(
          [
            ['workStart', '上班时间'],
            ['workEnd', '下班时间'],
            ['breakStart', '休息开始'],
            ['breakEnd', '休息结束'],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              onChange={(event) => onChange({ ...draft, [key]: event.target.value })}
              required={key === 'workStart' || key === 'workEnd'}
              type="time"
              value={draft[key]}
            />
          </label>
        ))}
      </div>
    </>
  );
}

function message(cause: unknown): string {
  return cause instanceof ApiError ? cause.message : '操作失败，请稍后重试';
}

export function MobileArtistTools({
  session,
  tool,
}: {
  readonly session: SessionTokenPair;
  readonly tool: ArtistTool;
}) {
  const [artist, setArtist] = useState<MobileArtist | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getOwnArtist(session.accessToken)
      .then(setArtist)
      .catch((cause: unknown) => setError(message(cause)))
      .finally(() => setBusy(false));
  }, [session.accessToken]);

  if (busy) return <p className="mobile-state">正在读取化妆师资料…</p>;
  if (error || !artist) return <p className="form-error">{error ?? '未找到化妆师档案'}</p>;
  if (tool === 'shift') return <ShiftTool artist={artist} session={session} />;
  if (tool === 'overtime') return <OvertimeTool artist={artist} session={session} />;
  return <UnavailabilityTool session={session} />;
}

function ShiftTool({
  artist,
  session,
}: {
  readonly artist: MobileArtist;
  readonly session: SessionTokenPair;
}) {
  const [current, setCurrent] = useState<Awaited<ReturnType<typeof getCurrentShift>>>(null);
  const [latest, setLatest] = useState<ShiftChange | null>(null);
  const [draft, setDraft] = useState(DEFAULT_SHIFT);
  const [effectiveFrom, setEffectiveFrom] = useState(businessDate(1));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const [shift, change] = await Promise.all([
        getCurrentShift(session.accessToken, artist.id),
        getLatestShiftChange(session.accessToken),
      ]);
      setCurrent(shift);
      setLatest(change);
      if (shift) {
        setDraft({
          breakEnd: shift.breakEndMinute === null ? '' : minuteLabel(shift.breakEndMinute),
          breakStart: shift.breakStartMinute === null ? '' : minuteLabel(shift.breakStartMinute),
          workEnd: minuteLabel(shift.workEndMinute),
          workStart: minuteLabel(shift.workStartMinute),
          workdays: shift.workdays,
        });
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }, [artist.id, session.accessToken]);

  useEffect(() => void load(), [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (current) {
        await submitShiftChange(session.accessToken, artist.id, {
          ...definition(draft),
          effectiveFrom,
          reason,
        });
      } else {
        await setInitialShift(session.accessToken, artist.id, definition(draft));
      }
      await load();
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!latest || latest.status !== 'PENDING') return;
    setBusy(true);
    try {
      await withdrawShiftChange(session.accessToken, latest.id, latest.rowVersion);
      await load();
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }

  return (
    <section className="mobile-view">
      <header className="mobile-section-header">
        <div>
          <p className="eyebrow">化妆师班次</p>
          <h1>{current ? '班次与修改申请' : '首次设置班次'}</h1>
        </div>
      </header>
      {current ? (
        <article className="mobile-card">
          <div className="mobile-card-heading">
            <strong>当前班次</strong>
            <span>当前生效</span>
          </div>
          <dl className="mobile-detail-list">
            <div>
              <dt>工作日</dt>
              <dd>{workdayLabels(current.workdays)}</dd>
            </div>
            <div>
              <dt>上班时间</dt>
              <dd>
                {minuteLabel(current.workStartMinute)}—{minuteLabel(current.workEndMinute)}
              </dd>
            </div>
            <div>
              <dt>休息时间</dt>
              <dd>{breakLabel(current)}</dd>
            </div>
            <div>
              <dt>开始日期</dt>
              <dd>{current.validFrom}</dd>
            </div>
          </dl>
        </article>
      ) : null}
      {latest ? (
        <article className="mobile-card">
          <div className="mobile-card-heading">
            <strong>最近一次修改申请</strong>
            <span>{APPROVAL_STATUS_LABELS[latest.status]}</span>
          </div>
          <dl className="mobile-detail-list">
            <div>
              <dt>工作日</dt>
              <dd>{workdayLabels(latest.workdays)}</dd>
            </div>
            <div>
              <dt>上班时间</dt>
              <dd>
                {minuteLabel(latest.workStartMinute)}—{minuteLabel(latest.workEndMinute)}
              </dd>
            </div>
            <div>
              <dt>休息时间</dt>
              <dd>{breakLabel(latest)}</dd>
            </div>
            <div>
              <dt>生效日期</dt>
              <dd>{latest.effectiveFrom}</dd>
            </div>
            <div>
              <dt>修改原因</dt>
              <dd>{latest.reason}</dd>
            </div>
            {latest.reviewComment ? (
              <div>
                <dt>审核说明</dt>
                <dd>{latest.reviewComment}</dd>
              </div>
            ) : null}
          </dl>
          {latest.status === 'PENDING' ? (
            <div className="mobile-actions">
              <button onClick={() => void withdraw()} type="button">
                撤回申请
              </button>
            </div>
          ) : null}
        </article>
      ) : null}
      <form className="mobile-form-section" onSubmit={(event) => void submit(event)}>
        <ShiftFields draft={draft} onChange={setDraft} showWeekdays />
        {current ? (
          <>
            <label>
              生效日期
              <input
                min={businessDate(1)}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
                type="date"
                value={effectiveFrom}
              />
            </label>
            <label>
              修改原因
              <input
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                required
                value={reason}
              />
            </label>
          </>
        ) : null}
        {error ? <p className="form-error">{error}</p> : null}
        <button
          className="primary-button"
          disabled={busy || draft.workdays.length === 0}
          type="submit"
        >
          {current ? '提交修改申请' : '保存首次班次'}
        </button>
      </form>
    </section>
  );
}

function OvertimeTool({
  artist,
  session,
}: {
  readonly artist: MobileArtist;
  readonly session: SessionTokenPair;
}) {
  const [items, setItems] = useState<readonly OvertimeRecord[]>([]);
  const [draft, setDraft] = useState(DEFAULT_SHIFT);
  const [date, setDate] = useState(businessDate(1));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setItems(await listOvertimes(session.accessToken));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }, [session.accessToken]);
  useEffect(() => void load(), [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const value = definition(draft);
      await createOvertime(session.accessToken, artist.id, {
        breakEndMinute: value.breakEndMinute,
        breakStartMinute: value.breakStartMinute,
        overtimeDate: date,
        reason,
        workEndMinute: value.workEndMinute,
        workStartMinute: value.workStartMinute,
      });
      setReason('');
      await load();
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }

  async function withdraw(item: OvertimeRecord) {
    setBusy(true);
    try {
      await withdrawOvertime(session.accessToken, item.id, item.rowVersion);
      await load();
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }

  return (
    <section className="mobile-view">
      <header className="mobile-section-header">
        <div>
          <p className="eyebrow">非工作日</p>
          <h1>加班申请</h1>
        </div>
      </header>
      <form className="mobile-form-section" onSubmit={(event) => void submit(event)}>
        <label>
          加班日期
          <input
            max={businessDate(7)}
            min={businessDate(1)}
            onChange={(event) => setDate(event.target.value)}
            required
            type="date"
            value={date}
          />
        </label>
        <ShiftFields draft={draft} onChange={setDraft} showWeekdays={false} />
        <label>
          原因
          <input
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          提交加班申请
        </button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="mobile-list">
        {items.map((item) => (
          <article className="mobile-card" key={item.id}>
            <div className="mobile-card-heading">
              <strong>{item.overtimeDate}</strong>
              <span>{APPROVAL_STATUS_LABELS[item.status]}</span>
            </div>
            <p className="mobile-meta">
              {minuteLabel(item.workStartMinute)}—{minuteLabel(item.workEndMinute)} · {item.reason}
            </p>
            {item.status === 'PENDING' ? (
              <div className="mobile-actions">
                <button onClick={() => void withdraw(item)} type="button">
                  撤回
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function UnavailabilityTool({ session }: { readonly session: SessionTokenPair }) {
  const [items, setItems] = useState<readonly UnavailablePeriod[]>([]);
  const [date, setDate] = useState(businessDate(1));
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('10:00');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setItems(await listUnavailablePeriods(session.accessToken));
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }, [session.accessToken]);
  useEffect(() => void load(), [load]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const input = {
        endMinute: timeToMinute(end),
        startMinute: timeToMinute(start),
        unavailableDate: date,
      };
      const preview = await previewUnavailablePeriod(session.accessToken, input);
      if (
        !window.confirm(`确认设置临时不可排班？将取消 ${preview.affectedAppointmentCount} 条预约。`)
      ) {
        setBusy(false);
        return;
      }
      await createUnavailablePeriod(session.accessToken, {
        ...input,
        confirmedAffectedAppointmentCount: preview.affectedAppointmentCount,
        reason,
      });
      setReason('');
      await load();
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }

  async function cancel(item: UnavailablePeriod) {
    setBusy(true);
    try {
      await cancelUnavailablePeriod(session.accessToken, item.id, item.rowVersion);
      await load();
    } catch (cause) {
      setError(message(cause));
      setBusy(false);
    }
  }

  return (
    <section className="mobile-view">
      <header className="mobile-section-header">
        <div>
          <p className="eyebrow">局部时间</p>
          <h1>临时不可排班</h1>
        </div>
      </header>
      <form className="mobile-form-section" onSubmit={(event) => void submit(event)}>
        <label>
          日期
          <input
            max={businessDate(7)}
            min={businessDate(1)}
            onChange={(event) => setDate(event.target.value)}
            required
            type="date"
            value={date}
          />
        </label>
        <div className="two-column-fields">
          <label>
            开始
            <input
              onChange={(event) => setStart(event.target.value)}
              required
              type="time"
              value={start}
            />
          </label>
          <label>
            结束
            <input
              onChange={(event) => setEnd(event.target.value)}
              required
              type="time"
              value={end}
            />
          </label>
        </div>
        <label>
          原因
          <input
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </label>
        <button className="primary-button" disabled={busy} type="submit">
          确认设置
        </button>
      </form>
      {error ? <p className="form-error">{error}</p> : null}
      <div className="mobile-list">
        {items.map((item) => (
          <article className="mobile-card" key={item.id}>
            <div className="mobile-card-heading">
              <strong>
                {item.unavailableDate} · {minuteLabel(item.startMinute)}—
                {minuteLabel(item.endMinute)}
              </strong>
              <span>{item.status === 'ACTIVE' ? '生效中' : '已取消'}</span>
            </div>
            <p className="mobile-meta">
              {item.reason} · 影响预约 {item.affectedAppointmentCount} 条
            </p>
            {item.status === 'ACTIVE' ? (
              <div className="mobile-actions">
                <button className="danger-text" onClick={() => void cancel(item)} type="button">
                  取消设置
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
