import { type FormEvent, useCallback, useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { FixedRuleDialog } from './FixedRuleDialog';
import { type FixedRule, type FixedRuleStatus, listFixedRules } from './fixed-rule-api';
import { makeupTypeLabel } from './makeup-type';
import { listSites, type SiteSummary } from './master-data-api';

const WEEKDAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const PAGE_SIZE = 50;

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(
    2,
    '0',
  )}`;
}

function weekdaysLabel(weekdays: readonly number[]): string {
  if (weekdays.length === 7) return '每天';
  return weekdays
    .map((weekday) => WEEKDAYS[weekday - 1])
    .filter(Boolean)
    .join('、');
}

function validityLabel(rule: FixedRule): string {
  return `${rule.validFrom} 至 ${rule.validUntil ?? '长期'}`;
}

interface FixedRulePageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

export function FixedRulePage({ onUnauthorized, session }: FixedRulePageProps) {
  const [items, setItems] = useState<readonly FixedRule[]>([]);
  const [sites, setSites] = useState<readonly SiteSummary[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [siteId, setSiteId] = useState('');
  const [status, setStatus] = useState<FixedRuleStatus>('ACTIVE');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dialogRule, setDialogRule] = useState<FixedRule | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listFixedRules(session.accessToken, {
        page,
        ...(search ? { search } : {}),
        ...(session.role.roleCode === 'ADMIN' && siteId ? { siteId } : {}),
        status,
      });
      setItems(result.items);
      setTotal(result.total);
      setError(null);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '固定主播名单加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [onUnauthorized, page, search, session, siteId, status]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (session.role.roleCode !== 'ADMIN') return;
    void listSites(session.accessToken)
      .then(setSites)
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) onUnauthorized();
      });
  }, [onUnauthorized, session]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <main className="management-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">排班管理</p>
          <h1>固定主播名单</h1>
        </div>
        <div className="header-actions">
          <button className="secondary-button" disabled={loading} onClick={() => void load()}>
            刷新
          </button>
          <button className="primary-button" onClick={() => setDialogRule(null)}>
            设置固定关系
          </button>
        </div>
      </header>

      <section className="list-filter-card" aria-label="固定主播筛选">
        <form className="search-form" onSubmit={submitSearch}>
          <label className="filter-field">
            <span>搜索</span>
            <input
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="主播编号、姓名或化妆师"
              value={searchInput}
            />
          </label>
          {session.role.roleCode === 'ADMIN' ? (
            <label className="filter-field">
              <span>场地</span>
              <select
                onChange={(event) => {
                  setPage(1);
                  setSiteId(event.target.value);
                }}
                value={siteId}
              >
                <option value="">全部场地</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="filter-field">
            <span>状态</span>
            <select
              onChange={(event) => {
                setPage(1);
                setStatus(event.target.value as FixedRuleStatus);
              }}
              value={status}
            >
              <option value="ACTIVE">生效中</option>
              <option value="ENDED">已结束</option>
            </select>
          </label>
          <button type="submit">查询</button>
        </form>
      </section>

      <section className="table-card">
        <div className="table-summary">
          <span>共 {total} 位固定主播</span>
          <span>仅展示系统审批生成的固定关系</span>
        </div>
        {error ? <div className="content-message error-message">{error}</div> : null}
        {loading ? (
          <div className="content-message">正在加载固定主播名单…</div>
        ) : items.length === 0 ? (
          <div className="content-message">当前筛选条件下没有固定主播</div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>主播</th>
                  <th>固定化妆师</th>
                  <th>场地</th>
                  <th>固定星期</th>
                  <th>固定时间</th>
                  <th>生效周期</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map((rule) => (
                  <tr key={rule.id}>
                    <td>
                      <strong>{rule.hostName}</strong>
                      <div className="muted-text">{rule.hostCode}</div>
                    </td>
                    <td>{rule.artistNickname}</td>
                    <td>{rule.siteName}</td>
                    <td>{weekdaysLabel(rule.weekdays)}</td>
                    <td>
                      <strong>
                        {minuteLabel(rule.startMinute)}–
                        {minuteLabel(rule.startMinute + rule.durationMinutes)}
                      </strong>
                      <div className="muted-text">{makeupTypeLabel(rule.durationMinutes)}</div>
                    </td>
                    <td>{validityLabel(rule)}</td>
                    <td>
                      <span className={`status-pill ${rule.status.toLowerCase()}`}>
                        {rule.status === 'ACTIVE' ? '生效中' : '已结束'}
                      </span>
                    </td>
                    <td>
                      {rule.status === 'ACTIVE' ? (
                        <button
                          className="table-action"
                          onClick={() => setDialogRule(rule)}
                          type="button"
                        >
                          修改或取消
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pageCount > 1 ? (
          <div className="pagination">
            <span>
              第 {page} / {pageCount} 页
            </span>
            <button disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>
              上一页
            </button>
            <button disabled={loading || page >= pageCount} onClick={() => setPage(page + 1)}>
              下一页
            </button>
          </div>
        ) : null}
      </section>
      {dialogRule !== undefined ? (
        <FixedRuleDialog
          onClose={() => setDialogRule(undefined)}
          onSaved={() => {
            setDialogRule(undefined);
            void load();
          }}
          onUnauthorized={onUnauthorized}
          rule={dialogRule}
          session={session}
          sites={sites}
        />
      ) : null}
    </main>
  );
}
