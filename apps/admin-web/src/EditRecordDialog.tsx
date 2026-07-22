import type { FormEvent } from 'react';

import type {
  AccountSummary,
  ArtistSummary,
  HostSummary,
  ManagementItem,
  ManagementView,
  OperatorSummary,
  SiteSummary,
} from './master-data-api';

type EditView = Exclude<ManagementView, 'relations'>;

interface EditRecordDialogProps {
  readonly busy: boolean;
  readonly error: string | null;
  readonly item: ManagementItem;
  readonly onClose: () => void;
  readonly onSubmit: (body: Record<string, unknown>) => Promise<void>;
  readonly sites: readonly SiteSummary[];
  readonly view: EditView;
}

const TITLES: Record<EditView, string> = {
  accounts: '维护后台账号',
  artists: '维护化妆师',
  hosts: '维护主播',
  operators: '维护运营',
  sites: '维护场地',
};

function value(form: FormData, key: string): string {
  const entry = form.get(key);
  return typeof entry === 'string' ? entry.trim() : '';
}

export function EditRecordDialog({
  busy,
  error,
  item,
  onClose,
  onSubmit,
  sites,
  view,
}: EditRecordDialogProps) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const shared = { expectedRowVersion: item.rowVersion, reason: value(form, 'reason') };
    let body: Record<string, unknown>;
    switch (view) {
      case 'sites':
        body = {
          ...shared,
          name: value(form, 'name'),
          sortOrder: Number(value(form, 'sortOrder')),
          status: value(form, 'status'),
          timezone: value(form, 'timezone'),
        };
        break;
      case 'hosts':
        body = {
          ...shared,
          nickname: value(form, 'nickname') || null,
          qualificationStatus: value(form, 'status'),
          realName: value(form, 'realName'),
          siteId: value(form, 'siteId'),
        };
        break;
      case 'artists':
        body = {
          ...shared,
          employmentStatus: value(form, 'status'),
          nickname: value(form, 'nickname'),
          realName: value(form, 'realName'),
          siteId: value(form, 'siteId'),
        };
        break;
      case 'operators':
        body = {
          ...shared,
          employmentStatus: value(form, 'status'),
          realName: value(form, 'realName'),
          siteId: value(form, 'siteId'),
        };
        break;
      case 'accounts':
        body = {
          ...shared,
          displayName: value(form, 'displayName'),
          status: value(form, 'status'),
        };
        break;
    }
    void onSubmit(body);
  }

  function siteOptions(itemWithSite: HostSummary | ArtistSummary | OperatorSummary) {
    return (
      <>
        <label htmlFor="edit-site">所属场地</label>
        <select defaultValue={itemWithSite.siteId} id="edit-site" name="siteId" required>
          {sites
            .filter((site) => site.status === 'ACTIVE' || site.id === itemWithSite.siteId)
            .map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
        </select>
      </>
    );
  }

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        aria-labelledby="edit-dialog-title"
        aria-modal="true"
        className="dialog"
        role="dialog"
      >
        <div className="dialog-header">
          <h2 id="edit-dialog-title">{TITLES[view]}</h2>
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
        <form className="record-form" onSubmit={submit}>
          {view === 'sites' ? (
            <>
              <label htmlFor="edit-name">场地名称</label>
              <input
                defaultValue={(item as SiteSummary).name}
                id="edit-name"
                maxLength={64}
                name="name"
                required
              />
              <label htmlFor="edit-timezone">时区</label>
              <input
                defaultValue={(item as SiteSummary).timezone}
                id="edit-timezone"
                maxLength={64}
                name="timezone"
                required
              />
              <label htmlFor="edit-sort-order">排序数字</label>
              <input
                defaultValue={(item as SiteSummary).sortOrder}
                id="edit-sort-order"
                name="sortOrder"
                required
                type="number"
              />
            </>
          ) : null}

          {view === 'hosts' ? (
            <>
              <label htmlFor="edit-real-name">姓名</label>
              <input
                defaultValue={(item as HostSummary).realName}
                id="edit-real-name"
                maxLength={64}
                name="realName"
                required
              />
              <label htmlFor="edit-nickname">昵称（可不填）</label>
              <input
                defaultValue={(item as HostSummary).nickname ?? ''}
                id="edit-nickname"
                maxLength={64}
                name="nickname"
              />
              {siteOptions(item as HostSummary)}
            </>
          ) : null}

          {view === 'artists' ? (
            <>
              <label htmlFor="edit-nickname">化妆师昵称</label>
              <input
                defaultValue={(item as ArtistSummary).nickname}
                id="edit-nickname"
                maxLength={64}
                name="nickname"
                required
              />
              <label htmlFor="edit-real-name">姓名</label>
              <input
                defaultValue={(item as ArtistSummary).realName}
                id="edit-real-name"
                maxLength={64}
                name="realName"
                required
              />
              {siteOptions(item as ArtistSummary)}
            </>
          ) : null}

          {view === 'operators' ? (
            <>
              <label htmlFor="edit-real-name">运营姓名</label>
              <input
                defaultValue={(item as OperatorSummary).realName}
                id="edit-real-name"
                maxLength={64}
                name="realName"
                required
              />
              {siteOptions(item as OperatorSummary)}
            </>
          ) : null}

          {view === 'accounts' ? (
            <>
              <label htmlFor="edit-display-name">账号名称</label>
              <input
                defaultValue={(item as AccountSummary).displayName}
                id="edit-display-name"
                maxLength={64}
                name="displayName"
                required
              />
            </>
          ) : null}

          <label htmlFor="edit-status">状态</label>
          <select
            defaultValue={
              view === 'hosts'
                ? (item as HostSummary).qualificationStatus
                : view === 'sites'
                  ? (item as SiteSummary).status
                  : view === 'accounts'
                    ? (item as AccountSummary).status
                    : (item as ArtistSummary | OperatorSummary).employmentStatus
            }
            id="edit-status"
            name="status"
          >
            <option value="ACTIVE">正常</option>
            {view === 'hosts' ? <option value="SUSPENDED">暂停资格</option> : null}
            {view === 'hosts' ? <option value="CANCELLED">取消资格</option> : null}
            {view === 'accounts' ? <option value="DISABLED">停用</option> : null}
            {view !== 'hosts' && view !== 'accounts' ? (
              <option value="INACTIVE">停用</option>
            ) : null}
          </select>

          <label htmlFor="edit-reason">修改原因</label>
          <textarea id="edit-reason" maxLength={500} name="reason" required rows={3} />
          {error ? <p className="form-error">{error}</p> : null}
          <div className="dialog-actions">
            <button className="secondary-button" disabled={busy} onClick={onClose} type="button">
              取消
            </button>
            <button className="primary-button" disabled={busy} type="submit">
              {busy ? '正在保存…' : '保存修改'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
