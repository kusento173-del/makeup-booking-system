import { type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import { currentBusinessDate } from './business-date';
import { CreateRecordDialog } from './CreateRecordDialog';
import { EditRecordDialog } from './EditRecordDialog';
import { EndRelationDialog } from './EndRelationDialog';
import {
  type AccountSummary,
  type ArtistSummary,
  createManagementItem,
  endRelation,
  type HostSummary,
  issueBindingCode,
  type IssuedBindingCode,
  listManagementItems,
  listSites,
  type ManagementItem,
  type ManagementView,
  type OperatorSummary,
  type RelationSummary,
  type SiteSummary,
  updateManagementItem,
} from './master-data-api';
import { RelationDialog } from './RelationDialog';
import { RoleDialog } from './RoleDialog';

interface ManagementPageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
  readonly view: ManagementView;
}

interface Column {
  readonly key: string;
  readonly label: string;
  readonly render: (item: ManagementItem) => ReactNode;
}

const STATUS_NAMES: Record<string, string> = {
  ACTIVE: '正常',
  CANCELLED: '已取消资格',
  DISABLED: '已停用',
  INACTIVE: '已停用',
  SUSPENDED: '暂停资格',
};

const NAV_ITEMS: readonly { readonly id: ManagementView; readonly label: string }[] = [
  { id: 'hosts', label: '主播' },
  { id: 'artists', label: '化妆师' },
  { id: 'operators', label: '运营' },
  { id: 'relations', label: '主播—运营关系' },
  { id: 'sites', label: '场地' },
  { id: 'accounts', label: '账号与角色' },
];

function personName(realName: string, nickname: string | null): string {
  return nickname ? `${nickname}（${realName}）` : realName;
}

function roleNames(account: AccountSummary, siteNames: ReadonlyMap<string, string>): string {
  return account.roles
    .map((role) =>
      role.roleCode === 'ADMIN'
        ? '管理员'
        : `客服（${role.siteId ? (siteNames.get(role.siteId) ?? '未知场地') : '未指定场地'}）`,
    )
    .join('、');
}

function columns(view: ManagementView, siteNames: ReadonlyMap<string, string>): readonly Column[] {
  const site = (siteId: string) => siteNames.get(siteId) ?? '未知场地';
  switch (view) {
    case 'hosts':
      return [
        { key: 'code', label: '主播编号', render: (item) => (item as HostSummary).hostCode },
        {
          key: 'name',
          label: '主播',
          render: (item) => {
            const host = item as HostSummary;
            return personName(host.realName, host.nickname);
          },
        },
        { key: 'site', label: '场地', render: (item) => site((item as HostSummary).siteId) },
        {
          key: 'status',
          label: '预约资格',
          render: (item) => STATUS_NAMES[(item as HostSummary).qualificationStatus] ?? '未知',
        },
      ];
    case 'artists':
      return [
        {
          key: 'name',
          label: '化妆师',
          render: (item) => {
            const artist = item as ArtistSummary;
            return personName(artist.realName, artist.nickname);
          },
        },
        { key: 'site', label: '场地', render: (item) => site((item as ArtistSummary).siteId) },
        {
          key: 'shift',
          label: '班次',
          render: (item) => ((item as ArtistSummary).initialShiftConfigured ? '已设置' : '未设置'),
        },
        {
          key: 'status',
          label: '状态',
          render: (item) => STATUS_NAMES[(item as ArtistSummary).employmentStatus] ?? '未知',
        },
      ];
    case 'operators':
      return [
        { key: 'name', label: '运营', render: (item) => (item as OperatorSummary).realName },
        { key: 'site', label: '场地', render: (item) => site((item as OperatorSummary).siteId) },
        {
          key: 'status',
          label: '状态',
          render: (item) => STATUS_NAMES[(item as OperatorSummary).employmentStatus] ?? '未知',
        },
      ];
    case 'relations':
      return [
        {
          key: 'host',
          label: '主播',
          render: (item) => {
            const relation = item as RelationSummary;
            return `${relation.hostName}｜${relation.hostCode}`;
          },
        },
        {
          key: 'operator',
          label: '运营',
          render: (item) => (item as RelationSummary).operatorName,
        },
        { key: 'site', label: '场地', render: (item) => site((item as RelationSummary).siteId) },
        {
          key: 'validity',
          label: '有效期',
          render: (item) => {
            const relation = item as RelationSummary;
            return `${relation.validFrom} 至 ${relation.validUntil ?? '长期'}`;
          },
        },
      ];
    case 'sites':
      return [
        { key: 'name', label: '场地', render: (item) => (item as SiteSummary).name },
        { key: 'code', label: '代码', render: (item) => (item as SiteSummary).code },
        { key: 'timezone', label: '时区', render: (item) => (item as SiteSummary).timezone },
        {
          key: 'status',
          label: '状态',
          render: (item) => STATUS_NAMES[(item as SiteSummary).status] ?? '未知',
        },
      ];
    case 'accounts':
      return [
        { key: 'name', label: '账号名称', render: (item) => (item as AccountSummary).displayName },
        {
          key: 'login',
          label: '登录名',
          render: (item) => (item as AccountSummary).loginName ?? '未设置密码登录',
        },
        {
          key: 'roles',
          label: '有效角色',
          render: (item) => roleNames(item as AccountSummary, siteNames) || '无',
        },
        {
          key: 'status',
          label: '状态',
          render: (item) => STATUS_NAMES[(item as AccountSummary).status] ?? '未知',
        },
      ];
  }
}

export function ManagementPage({ onUnauthorized, session, view }: ManagementPageProps) {
  const [sites, setSites] = useState<readonly SiteSummary[]>([]);
  const [items, setItems] = useState<readonly ManagementItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [bindingCode, setBindingCode] = useState<IssuedBindingCode | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [editItem, setEditItem] = useState<ManagementItem | null>(null);
  const [relationToEnd, setRelationToEnd] = useState<RelationSummary | null>(null);
  const [roleAccount, setRoleAccount] = useState<AccountSummary | null>(null);

  const siteNames = useMemo(() => new Map(sites.map((site) => [site.id, site.name])), [sites]);
  const tableColumns = useMemo(() => columns(view, siteNames), [siteNames, view]);
  const pageCount = Math.max(1, Math.ceil(total / 50));

  useEffect(() => {
    let active = true;
    void listSites(session.accessToken)
      .then((result) => active && setSites(result))
      .catch((cause: unknown) => {
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
        }
      });
    return () => {
      active = false;
    };
  }, [onUnauthorized, session.accessToken]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    const request =
      view === 'sites'
        ? listSites(session.accessToken).then((result) => ({ items: result, total: result.length }))
        : listManagementItems(view, session.accessToken, page, search);

    void request
      .then((result) => {
        if (active) {
          setItems(result.items);
          setTotal(result.total);
        }
      })
      .catch((cause: unknown) => {
        if (!active) {
          return;
        }
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(cause instanceof ApiError ? cause.message : '数据加载失败，请稍后重试');
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [onUnauthorized, page, reloadVersion, search, session.accessToken, view]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(draftSearch.trim());
  }

  async function createRecord(body: Record<string, unknown>) {
    if (view === 'relations') {
      return;
    }
    setMutating(true);
    setMutationError(null);
    try {
      await createManagementItem(view, session.accessToken, body);
      setCreateOpen(false);
      setReloadVersion((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setMutationError(cause instanceof ApiError ? cause.message : '保存失败，请稍后重试');
    } finally {
      setMutating(false);
    }
  }

  async function updateRecord(body: Record<string, unknown>) {
    if (!editItem || view === 'relations') {
      return;
    }
    setMutating(true);
    setMutationError(null);
    try {
      await updateManagementItem(view, session.accessToken, editItem.id, body);
      setEditItem(null);
      setReloadVersion((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setMutationError(cause instanceof ApiError ? cause.message : '修改失败，请稍后重试');
    } finally {
      setMutating(false);
    }
  }

  async function finishRelation(validUntil: string, reason: string) {
    if (!relationToEnd) {
      return;
    }
    setMutating(true);
    setMutationError(null);
    try {
      await endRelation(session.accessToken, relationToEnd.id, {
        expectedRowVersion: relationToEnd.rowVersion,
        reason,
        validUntil,
      });
      setRelationToEnd(null);
      setReloadVersion((value) => value + 1);
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setMutationError(cause instanceof ApiError ? cause.message : '关系结束失败，请稍后重试');
    } finally {
      setMutating(false);
    }
  }

  function changedFromDialog(close: () => void) {
    close();
    setReloadVersion((value) => value + 1);
  }

  async function createBindingCode(item: HostSummary | ArtistSummary | OperatorSummary) {
    const roleCode = view === 'hosts' ? 'HOST' : view === 'artists' ? 'ARTIST' : 'OPERATOR';
    setMutating(true);
    setError(null);
    try {
      setBindingCode(await issueBindingCode(session.accessToken, item.id, roleCode));
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 401) {
        onUnauthorized();
        return;
      }
      setError(cause instanceof ApiError ? cause.message : '绑定码生成失败，请稍后重试');
    } finally {
      setMutating(false);
    }
  }

  const title = NAV_ITEMS.find((item) => item.id === view)?.label ?? '主数据';

  return (
    <>
      <section className="management-main">
        <header className="management-header">
          <div>
            <p className="eyebrow">主数据管理</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            {view === 'sites' ? null : (
              <form className="search-form" onSubmit={submitSearch}>
                <label className="sr-only" htmlFor="management-search">
                  搜索
                </label>
                <input
                  id="management-search"
                  onChange={(event) => setDraftSearch(event.target.value)}
                  placeholder="输入姓名或编号"
                  value={draftSearch}
                />
                <button type="submit">搜索</button>
              </form>
            )}
            {view !== 'sites' || session.role.roleCode === 'ADMIN' ? (
              <button
                className="primary-action"
                onClick={() => {
                  setMutationError(null);
                  setCreateOpen(true);
                }}
                type="button"
              >
                新增
              </button>
            ) : null}
          </div>
        </header>

        <div className="table-card">
          <div className="table-summary">
            <span>共 {total} 条</span>
            <span>{loading ? '正在加载…' : '数据已更新'}</span>
          </div>
          {error ? <div className="content-message error-message">{error}</div> : null}
          {!error && !loading && items.length === 0 ? (
            <div className="content-message">暂无数据</div>
          ) : null}
          {!error && items.length > 0 ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {tableColumns.map((column) => (
                      <th key={column.key}>{column.label}</th>
                    ))}
                    {view === 'hosts' || view === 'artists' || view === 'operators' ? (
                      <th>账号绑定</th>
                    ) : null}
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      {tableColumns.map((column) => (
                        <td key={column.key}>{column.render(item)}</td>
                      ))}
                      {view === 'hosts' || view === 'artists' || view === 'operators' ? (
                        <td>
                          {(item as HostSummary | ArtistSummary | OperatorSummary).accountBound ? (
                            <span className="muted-text">已绑定</span>
                          ) : (
                            <button
                              className="table-action"
                              disabled={mutating}
                              onClick={() =>
                                void createBindingCode(
                                  item as HostSummary | ArtistSummary | OperatorSummary,
                                )
                              }
                              type="button"
                            >
                              生成绑定码
                            </button>
                          )}
                        </td>
                      ) : null}
                      <td>
                        <div className="row-actions">
                          {view !== 'relations' &&
                          (view !== 'sites' || session.role.roleCode === 'ADMIN') ? (
                            <button
                              className="table-action"
                              onClick={() => {
                                setMutationError(null);
                                setEditItem(item);
                              }}
                              type="button"
                            >
                              编辑
                            </button>
                          ) : view === 'relations' &&
                            ((item as RelationSummary).validUntil === null ||
                              (item as RelationSummary).validUntil! > currentBusinessDate()) ? (
                            <button
                              className="table-action danger-text"
                              onClick={() => {
                                setMutationError(null);
                                setRelationToEnd(item as RelationSummary);
                              }}
                              type="button"
                            >
                              {(item as RelationSummary).validUntil ? '调整结束日' : '结束关系'}
                            </button>
                          ) : view === 'relations' ? (
                            <span className="muted-text">已结束</span>
                          ) : null}
                          {view === 'accounts' ? (
                            <button
                              className="table-action"
                              onClick={() => setRoleAccount(item as AccountSummary)}
                              type="button"
                            >
                              角色
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {view !== 'sites' && pageCount > 1 ? (
            <div className="pagination">
              <button
                disabled={page === 1 || loading}
                onClick={() => setPage(page - 1)}
                type="button"
              >
                上一页
              </button>
              <span>
                第 {page} / {pageCount} 页
              </span>
              <button
                disabled={page >= pageCount || loading}
                onClick={() => setPage(page + 1)}
                type="button"
              >
                下一页
              </button>
            </div>
          ) : null}
        </div>
      </section>

      {createOpen && view !== 'relations' ? (
        <CreateRecordDialog
          busy={mutating}
          error={mutationError}
          onClose={() => {
            setCreateOpen(false);
            setMutationError(null);
          }}
          onSubmit={createRecord}
          session={session}
          sites={sites}
          view={view}
        />
      ) : null}

      {createOpen && view === 'relations' ? (
        <RelationDialog
          onClose={() => setCreateOpen(false)}
          onSaved={() => changedFromDialog(() => setCreateOpen(false))}
          onUnauthorized={onUnauthorized}
          session={session}
        />
      ) : null}

      {editItem && view !== 'relations' ? (
        <EditRecordDialog
          busy={mutating}
          error={mutationError}
          item={editItem}
          onClose={() => {
            setEditItem(null);
            setMutationError(null);
          }}
          onSubmit={updateRecord}
          sites={sites}
          view={view}
        />
      ) : null}

      {relationToEnd ? (
        <EndRelationDialog
          busy={mutating}
          error={mutationError}
          onClose={() => {
            setRelationToEnd(null);
            setMutationError(null);
          }}
          onSubmit={finishRelation}
          relation={relationToEnd}
        />
      ) : null}

      {roleAccount ? (
        <RoleDialog
          account={roleAccount}
          onChanged={() => changedFromDialog(() => setRoleAccount(null))}
          onClose={() => setRoleAccount(null)}
          onUnauthorized={onUnauthorized}
          session={session}
          sites={sites}
        />
      ) : null}

      {bindingCode ? (
        <div className="dialog-backdrop" role="presentation">
          <section
            aria-labelledby="binding-code-title"
            aria-modal="true"
            className="dialog"
            role="dialog"
          >
            <div className="dialog-header">
              <h2 id="binding-code-title">一次性绑定码</h2>
              <button
                aria-label="关闭"
                className="icon-button"
                onClick={() => setBindingCode(null)}
                type="button"
              >
                ×
              </button>
            </div>
            <p className="dialog-note">绑定码只显示这一次，请立即安全地交给本人。</p>
            <strong className="binding-code">{bindingCode.code}</strong>
            <p className="dialog-note">
              有效期至 {new Date(bindingCode.expiresAt).toLocaleString('zh-CN', { hour12: false })}
            </p>
            <div className="dialog-actions">
              <button className="primary-button" onClick={() => setBindingCode(null)} type="button">
                我已记录
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
