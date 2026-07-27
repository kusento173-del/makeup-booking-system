import { type FormEvent, useState } from 'react';

import { currentBusinessDate } from './business-date';
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
  const host = view === 'hosts' ? (item as HostSummary) : null;
  const [qualificationStatus, setQualificationStatus] = useState<'ACTIVE' | 'CANCELLED'>(
    host?.qualificationStatus ?? 'ACTIVE',
  );

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
          hostCode: value(form, 'hostCode'),
          nickname: value(form, 'nickname') || null,
          qualificationStatus,
          ...(qualificationStatus === 'CANCELLED'
            ? { qualificationValidUntil: value(form, 'qualificationValidUntil') }
            : {}),
          realName: value(form, 'realName'),
          siteId: value(form, 'siteId'),
        };
        break;
      case 'artists':
        body = {
          ...shared,
          nickname: value(form, 'nickname'),
          realName: value(form, 'realName'),
          siteId: value(form, 'siteId'),
        };
        break;
      case 'operators':
        body = {
          ...shared,
          realName: value(form, 'realName'),
          siteId: value(form, 'siteId'),
        };
        break;
      case 'accounts':
        body = {
          ...shared,
          displayName: value(form, 'displayName'),
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
              <label htmlFor="edit-host-code">主播编号</label>
              <input
                defaultValue={(item as HostSummary).hostCode}
                id="edit-host-code"
                maxLength={32}
                name="hostCode"
                required
              />
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

          {view === 'sites' ? (
            <>
              <label htmlFor="edit-status">状态</label>
              <select defaultValue={(item as SiteSummary).status} id="edit-status" name="status">
                <option value="ACTIVE">正常</option>
                <option value="INACTIVE">停用</option>
              </select>
            </>
          ) : null}

          {view === 'hosts' ? (
            <>
              <label htmlFor="edit-status">预约资格</label>
              <select
                id="edit-status"
                name="status"
                onChange={(event) =>
                  setQualificationStatus(event.target.value as 'ACTIVE' | 'CANCELLED')
                }
                value={qualificationStatus}
              >
                <option value="ACTIVE">正常</option>
                <option value="CANCELLED">取消资格</option>
              </select>
              {qualificationStatus === 'CANCELLED' ? (
                <>
                  <label htmlFor="edit-qualification-valid-until">取消资格截止日</label>
                  <input
                    defaultValue={host?.qualificationValidUntil ?? currentBusinessDate()}
                    id="edit-qualification-valid-until"
                    max={maximumQualificationDate()}
                    min={currentBusinessDate()}
                    name="qualificationValidUntil"
                    required
                    type="date"
                  />
                  <p className="dialog-note">到截止日当天仍不可预约，次日自动恢复正常。</p>
                </>
              ) : null}
            </>
          ) : null}

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

function maximumQualificationDate(): string {
  const date = new Date(`${currentBusinessDate()}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}
