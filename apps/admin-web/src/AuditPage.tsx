import { useEffect, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { listAuditLogs, type AuditLogItem } from './audit-api';
import {
  AUDIT_ACTION_LABELS,
  auditActionLabel,
  AUDIT_OBJECT_LABELS,
  auditObjectLabel,
  roleLabel,
} from './business-labels';

interface AuditPageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

function snapshot(value: unknown): string {
  return value === null ? '无' : JSON.stringify(value, null, 2);
}

export function AuditPage({ onUnauthorized, session }: AuditPageProps) {
  const [action, setAction] = useState('');
  const [objectType, setObjectType] = useState('');
  const [applied, setApplied] = useState({ action: '', objectType: '' });
  const [items, setItems] = useState<readonly AuditLogItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    void listAuditLogs(session.accessToken, {
      ...(applied.action ? { action: applied.action } : {}),
      ...(applied.objectType ? { objectType: applied.objectType } : {}),
      page,
      pageSize,
    })
      .then((result) => {
        if (!active) return;
        setItems(result.items);
        setPage(result.page);
        setPageSize(result.pageSize);
        setTotal(result.total);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(cause instanceof Error ? cause.message : '操作记录加载失败');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [applied, onUnauthorized, page, pageSize, reloadVersion, session.accessToken]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <main className="management-main audit-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">系统管理</p>
          <h1>操作记录</h1>
        </div>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={() => setReloadVersion((value) => value + 1)}
          type="button"
        >
          刷新
        </button>
      </header>

      <form
        className="list-filter-card search-form audit-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied({ action: action.trim(), objectType: objectType.trim() });
        }}
      >
        <label className="filter-field">
          <span>操作类型</span>
          <select onChange={(event) => setAction(event.target.value)} value={action}>
            <option value="">全部操作</option>
            {Object.entries(AUDIT_ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="filter-field">
          <span>业务对象</span>
          <select onChange={(event) => setObjectType(event.target.value)} value={objectType}>
            <option value="">全部对象</option>
            {Object.entries(AUDIT_OBJECT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button className="primary-button" disabled={loading} type="submit">
          查询
        </button>
      </form>

      {error ? <div className="content-message error-message">{error}</div> : null}
      <section className="table-card" aria-busy={loading}>
        <div className="table-summary">
          <strong>最近操作</strong>
          <span>
            共 {total} 条，第 {page}/{totalPages} 页
          </span>
        </div>
        {!loading && items.length === 0 ? <div className="content-message">暂无记录</div> : null}
        {items.length > 0 ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>操作人</th>
                    <th>场地</th>
                    <th>操作</th>
                    <th>对象</th>
                    <th>原因与明细</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td>
                      <td>
                        <strong>{item.actorName}</strong>
                        <small>{roleLabel(item.actorRole)}</small>
                      </td>
                      <td>{item.siteName ?? '全部场地'}</td>
                      <td>{auditActionLabel(item.action)}</td>
                      <td>
                        <strong>{auditObjectLabel(item.objectType)}</strong>
                        <small>{item.objectId}</small>
                      </td>
                      <td>
                        {item.reason ? <div>{item.reason}</div> : null}
                        <details>
                          <summary>查看前后记录</summary>
                          <div className="audit-snapshots">
                            <pre>{snapshot(item.beforeData)}</pre>
                            <pre>{snapshot(item.afterData)}</pre>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="audit-pagination">
              <button
                className="secondary-button"
                disabled={loading || page <= 1}
                onClick={() => setPage((value) => value - 1)}
                type="button"
              >
                上一页
              </button>
              <span>
                第 {page}/{totalPages} 页
              </span>
              <button
                className="secondary-button"
                disabled={loading || page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
                type="button"
              >
                下一页
              </button>
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
