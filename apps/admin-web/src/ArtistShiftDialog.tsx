import { type FormEvent, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import {
  directlyChangeShift,
  getCurrentShift,
  setInitialShift,
  type ArtistShift,
  type ShiftDefinition,
} from './artist-shift-api';
import type { SessionTokenPair } from './auth-session';
import { addBusinessDays, currentBusinessDate } from './business-date';
import type { ArtistSummary } from './master-data-api';
import { minuteLabel, timeToMinute, WEEKDAYS } from './mobile-utils';

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

function toDraft(shift: ArtistShift): ShiftDraft {
  return {
    breakEnd: shift.breakEndMinute === null ? '' : minuteLabel(shift.breakEndMinute),
    breakStart: shift.breakStartMinute === null ? '' : minuteLabel(shift.breakStartMinute),
    workEnd: minuteLabel(shift.workEndMinute),
    workStart: minuteLabel(shift.workStartMinute),
    workdays: shift.workdays,
  };
}

function toDefinition(draft: ShiftDraft): ShiftDefinition {
  return {
    breakEndMinute: draft.breakEnd ? timeToMinute(draft.breakEnd) : null,
    breakStartMinute: draft.breakStart ? timeToMinute(draft.breakStart) : null,
    workEndMinute: timeToMinute(draft.workEnd),
    workStartMinute: timeToMinute(draft.workStart),
    workdays: draft.workdays,
  };
}

export function ArtistShiftDialog({
  artist,
  onClose,
  onSaved,
  onUnauthorized,
  session,
}: {
  readonly artist: ArtistSummary;
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}) {
  const [current, setCurrent] = useState<ArtistShift | null>(null);
  const [draft, setDraft] = useState(DEFAULT_SHIFT);
  const [effectiveFrom, setEffectiveFrom] = useState(addBusinessDays(currentBusinessDate(), 1));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void getCurrentShift(session.accessToken, artist.id)
      .then((shift) => {
        setCurrent(shift);
        if (shift) setDraft(toDraft(shift));
      })
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
        else setError(cause instanceof ApiError ? cause.message : '班次读取失败，请稍后重试');
      })
      .finally(() => setBusy(false));
  }, [artist.id, onUnauthorized, session.accessToken]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const definition = toDefinition(draft);
      if (current) {
        await directlyChangeShift(session.accessToken, artist.id, {
          ...definition,
          effectiveFrom,
          expectedVersionNo: current.versionNo,
          reason,
        });
      } else {
        await setInitialShift(session.accessToken, artist.id, definition);
      }
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      else setError(cause instanceof ApiError ? cause.message : '班次保存失败，请稍后重试');
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="artist-shift-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <div>
            <h2 id="artist-shift-title">{current ? '修改化妆师班次' : '设置化妆师班次'}</h2>
            <p className="muted-text">{artist.nickname}</p>
          </div>
          <button aria-label="关闭" className="icon-button" disabled={busy} onClick={onClose}>
            ×
          </button>
        </div>
        <form className="record-form" onSubmit={(event) => void submit(event)}>
          <fieldset>
            <legend>工作日</legend>
            <div className="weekday-grid">
              {WEEKDAYS.map((day) => (
                <label key={day.id}>
                  <input
                    checked={draft.workdays.includes(day.id)}
                    onChange={(event) =>
                      setDraft({
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
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                  required={key === 'workStart' || key === 'workEnd'}
                  step={900}
                  type="time"
                  value={draft[key]}
                />
              </label>
            ))}
          </div>
          {current ? (
            <>
              <label htmlFor="shift-effective-from">生效日期</label>
              <input
                id="shift-effective-from"
                min={addBusinessDays(currentBusinessDate(), 1)}
                onChange={(event) => setEffectiveFrom(event.target.value)}
                required
                type="date"
                value={effectiveFrom}
              />
              <label htmlFor="shift-reason">修改原因</label>
              <textarea
                id="shift-reason"
                maxLength={500}
                onChange={(event) => setReason(event.target.value)}
                required
                rows={3}
                value={reason}
              />
            </>
          ) : null}
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy || draft.workdays.length === 0}
              type="submit"
            >
              {busy ? '正在保存…' : current ? '确认修改' : '保存班次'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
