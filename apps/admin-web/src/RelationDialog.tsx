import { type FormEvent, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import {
  createManagementItem,
  type HostSummary,
  listManagementItems,
  type OperatorSummary,
} from './master-data-api';

interface RelationDialogProps {
  readonly onClose: () => void;
  readonly onSaved: () => void;
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

function businessDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(new Date());
}

export function RelationDialog({ onClose, onSaved, onUnauthorized, session }: RelationDialogProps) {
  const [hostQuery, setHostQuery] = useState('');
  const [operatorQuery, setOperatorQuery] = useState('');
  const [hosts, setHosts] = useState<readonly HostSummary[]>([]);
  const [operators, setOperators] = useState<readonly OperatorSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void listManagementItems('hosts', session.accessToken, 1, hostQuery || undefined)
      .then((page) => active && setHosts(page.items as readonly HostSummary[]))
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
        } else if (active) {
          setError(cause instanceof ApiError ? cause.message : '主播加载失败');
        }
      });
    return () => {
      active = false;
    };
  }, [hostQuery, onUnauthorized, session.accessToken]);

  useEffect(() => {
    let active = true;
    void listManagementItems('operators', session.accessToken, 1, operatorQuery || undefined)
      .then((page) => active && setOperators(page.items as readonly OperatorSummary[]))
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
        } else if (active) {
          setError(cause instanceof ApiError ? cause.message : '运营加载失败');
        }
      });
    return () => {
      active = false;
    };
  }, [onUnauthorized, operatorQuery, session.accessToken]);

  function search(event: FormEvent<HTMLFormElement>, setQuery: (value: string) => void) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const entry = form.get('query');
    setQuery(typeof entry === 'string' ? entry.trim() : '');
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => {
      const entry = form.get(key);
      return typeof entry === 'string' ? entry.trim() : '';
    };
    setBusy(true);
    setError(null);
    try {
      const validUntil = text('validUntil');
      await createManagementItem('relations', session.accessToken, {
        changeReason: text('changeReason') || undefined,
        hostId: text('hostId'),
        operatorId: text('operatorId'),
        validFrom: text('validFrom'),
        ...(validUntil ? { validUntil } : {}),
      });
      onSaved();
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
      } else {
        setError(cause instanceof ApiError ? cause.message : '关系保存失败');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="relation-dialog-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <h2 id="relation-dialog-title">建立主播—运营关系</h2>
          <button
            aria-label="关闭"
            className="icon-button"
            disabled={busy}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>
        <form className="record-form" onSubmit={(event) => void submit(event)}>
          <label htmlFor="relation-host">主播</label>
          <div className="inline-search">
            <input
              aria-label="查找主播"
              form="host-search-form"
              name="query"
              placeholder="输入主播编号或姓名"
            />
            <button form="host-search-form" type="submit">
              查找
            </button>
          </div>
          <select id="relation-host" name="hostId" required>
            <option value="">请选择主播</option>
            {hosts.map((host) => (
              <option key={host.id} value={host.id}>
                {host.nickname ?? host.realName}｜{host.hostCode}
              </option>
            ))}
          </select>
          <label htmlFor="relation-operator">运营</label>
          <div className="inline-search">
            <input
              aria-label="查找运营"
              form="operator-search-form"
              name="query"
              placeholder="输入运营姓名"
            />
            <button form="operator-search-form" type="submit">
              查找
            </button>
          </div>
          <select id="relation-operator" name="operatorId" required>
            <option value="">请选择运营</option>
            {operators.map((operator) => (
              <option key={operator.id} value={operator.id}>
                {operator.realName}
              </option>
            ))}
          </select>
          <label htmlFor="relation-from">开始日期</label>
          <input
            defaultValue={businessDate()}
            id="relation-from"
            name="validFrom"
            required
            type="date"
          />
          <label htmlFor="relation-until">结束日期（长期可不填）</label>
          <input id="relation-until" name="validUntil" type="date" />
          <label htmlFor="relation-reason">变更说明（可不填）</label>
          <textarea id="relation-reason" maxLength={500} name="changeReason" rows={3} />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              取消
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? '正在保存…' : '建立关系'}
            </button>
          </div>
        </form>
        <form
          className="sr-only"
          id="host-search-form"
          onSubmit={(event) => search(event, setHostQuery)}
        />
        <form
          className="sr-only"
          id="operator-search-form"
          onSubmit={(event) => search(event, setOperatorQuery)}
        />
      </section>
    </div>
  );
}
