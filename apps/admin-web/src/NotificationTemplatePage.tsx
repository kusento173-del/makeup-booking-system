import { useEffect, useMemo, useState } from 'react';

import { ApiError } from './api-client';
import type { SessionTokenPair } from './auth-session';
import {
  activateNotificationTemplate,
  createNotificationTemplate,
  listNotificationTemplates,
  NOTIFICATION_TEMPLATE_CODES,
  NOTIFICATION_TEMPLATE_RECIPIENT_ROLES,
  type NotificationTemplate,
  type NotificationTemplateCode,
  type NotificationTemplatePreview,
  type NotificationRecipientRole,
  type NotificationSubscriptionType,
  previewNotificationTemplate,
  retireNotificationTemplate,
} from './notification-template-api';

interface NotificationTemplatePageProps {
  readonly onUnauthorized: () => void;
  readonly session: SessionTokenPair;
}

const CODE_LABELS: Record<NotificationTemplateCode, string> = {
  APPOINTMENT_NOTICE: '预约变更即时通知',
  APPOINTMENT_REMINDER: '预约开始前一小时提醒',
  DAILY_SCHEDULE_SUMMARY: '每日锁定排班汇总',
};

const ROLE_LABELS: Record<NotificationRecipientRole, string> = {
  ARTIST: '化妆师',
  HOST: '主播',
  OPERATOR: '运营',
};

const STATUS_LABELS = { ACTIVE: '使用中', DRAFT: '草稿', RETIRED: '已退役' } as const;
const SUBSCRIPTION_LABELS = { ONE_TIME: '一次性', PERMANENT: '永久' } as const;

function instantLabel(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
  }).format(new Date(value));
}

function errorMessage(cause: unknown, fallback: string): string {
  return cause instanceof ApiError ? cause.message : fallback;
}

export function NotificationTemplatePage({
  onUnauthorized,
  session,
}: NotificationTemplatePageProps) {
  const isAdmin = session.role.roleCode === 'ADMIN';
  const [templates, setTemplates] = useState<readonly NotificationTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const [templateCode, setTemplateCode] = useState<NotificationTemplateCode>('APPOINTMENT_NOTICE');
  const [recipientRoleCode, setRecipientRoleCode] = useState<NotificationRecipientRole>('HOST');
  const [providerTemplateKey, setProviderTemplateKey] = useState('');
  const [subscriptionType, setSubscriptionType] =
    useState<NotificationSubscriptionType>('ONE_TIME');
  const [mappingText, setMappingText] = useState('');
  const [preview, setPreview] = useState<NotificationTemplatePreview | null>(null);
  const [action, setAction] = useState<{
    readonly kind: 'activate' | 'retire';
    readonly template: NotificationTemplate;
  } | null>(null);
  const [retireReason, setRetireReason] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void listNotificationTemplates(session.accessToken)
      .then((result) => {
        if (!active) return;
        setTemplates(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) {
          onUnauthorized();
          return;
        }
        setError(errorMessage(cause, '通知模板加载失败，请稍后重试'));
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [onUnauthorized, reloadVersion, session.accessToken]);

  const activeScopes = useMemo(
    () =>
      new Set(
        templates
          .filter((item) => item.status === 'ACTIVE')
          .map((item) => `${item.templateCode}:${item.recipientRoleCode}`),
      ),
    [templates],
  );

  function handleUnauthorized(cause: unknown): boolean {
    if (cause instanceof ApiError && cause.status === 401) {
      onUnauthorized();
      return true;
    }
    return false;
  }

  async function handleCreate(): Promise<void> {
    const variableMappings = mappingText
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (!providerTemplateKey.trim() || variableMappings.length === 0) {
      setError('请填写微信模板 ID，并至少填写一行字段映射');
      return;
    }
    setBusyId('create');
    setError(null);
    try {
      await createNotificationTemplate(session.accessToken, {
        providerTemplateKey: providerTemplateKey.trim(),
        recipientRoleCode,
        subscriptionType,
        templateCode,
        variableMappings,
      });
      setProviderTemplateKey('');
      setMappingText('');
      setReloadVersion((value) => value + 1);
    } catch (cause) {
      if (!handleUnauthorized(cause)) {
        setError(errorMessage(cause, '草稿创建失败，请检查模板 ID 和字段映射'));
      }
    } finally {
      setBusyId(null);
    }
  }

  function handleTemplateCodeChange(value: NotificationTemplateCode): void {
    const roles = NOTIFICATION_TEMPLATE_RECIPIENT_ROLES[value];
    setTemplateCode(value);
    setRecipientRoleCode(roles[0] as NotificationRecipientRole);
  }

  async function handlePreview(template: NotificationTemplate): Promise<void> {
    setBusyId(template.id);
    setError(null);
    try {
      setPreview(await previewNotificationTemplate(session.accessToken, template.id));
    } catch (cause) {
      if (!handleUnauthorized(cause)) setError(errorMessage(cause, '预览加载失败'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleTransition(): Promise<void> {
    if (!action) return;
    if (action.kind === 'retire' && !retireReason.trim()) {
      setError('退役模板必须填写原因');
      return;
    }
    setBusyId(action.template.id);
    setError(null);
    try {
      if (action.kind === 'activate') {
        await activateNotificationTemplate(session.accessToken, action.template);
      } else {
        await retireNotificationTemplate(session.accessToken, action.template, retireReason.trim());
      }
      setAction(null);
      setRetireReason('');
      setPreview(null);
      setReloadVersion((value) => value + 1);
    } catch (cause) {
      if (!handleUnauthorized(cause)) {
        setError(errorMessage(cause, '模板状态修改失败，请刷新后重试'));
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="management-main notification-template-main">
      <header className="management-header">
        <div>
          <p className="eyebrow">系统配置</p>
          <h1>通知模板</h1>
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

      <section className="template-readiness" aria-label="通知模板配置状态">
        <strong>当前生效：</strong>
        {NOTIFICATION_TEMPLATE_CODES.flatMap((code) =>
          NOTIFICATION_TEMPLATE_RECIPIENT_ROLES[code].map((roleCode) => {
            const active = activeScopes.has(`${code}:${roleCode}`);
            return (
              <span className={active ? 'ready' : 'missing'} key={`${code}:${roleCode}`}>
                {ROLE_LABELS[roleCode]}·{CODE_LABELS[code]} {active ? '已配置' : '未配置'}
              </span>
            );
          }),
        )}
        <p>AppID 和 AppSecret 只在部署环境配置，本页面不会显示密钥或发送测试消息。</p>
      </section>

      {isAdmin ? (
        <section className="template-create-card" aria-label="新建通知模板草稿">
          <div className="template-create-fields">
            <label className="compact-field">
              <span>通知用途</span>
              <select
                onChange={(event) =>
                  handleTemplateCodeChange(event.target.value as NotificationTemplateCode)
                }
                value={templateCode}
              >
                {NOTIFICATION_TEMPLATE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {CODE_LABELS[code]}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-field">
              <span>接收角色</span>
              <select
                onChange={(event) =>
                  setRecipientRoleCode(event.target.value as NotificationRecipientRole)
                }
                value={recipientRoleCode}
              >
                {NOTIFICATION_TEMPLATE_RECIPIENT_ROLES[templateCode].map((roleCode) => (
                  <option key={roleCode} value={roleCode}>
                    {ROLE_LABELS[roleCode]}
                  </option>
                ))}
              </select>
            </label>
            <label className="compact-field template-id-field">
              <span>微信模板 ID</span>
              <input
                onChange={(event) => setProviderTemplateKey(event.target.value)}
                placeholder="从微信公众平台复制"
                value={providerTemplateKey}
              />
            </label>
            <label className="compact-field">
              <span>订阅类型</span>
              <select
                onChange={(event) =>
                  setSubscriptionType(event.target.value as NotificationSubscriptionType)
                }
                value={subscriptionType}
              >
                <option value="ONE_TIME">一次性订阅</option>
                <option value="PERMANENT">永久订阅</option>
              </select>
            </label>
            <label className="compact-field template-mapping-field">
              <span>字段映射（每行一项）</span>
              <textarea
                onChange={(event) => setMappingText(event.target.value)}
                placeholder={'thing1=hostName\ndate2=appointmentDate\ntime3=timeRange'}
                rows={4}
                value={mappingText}
              />
            </label>
          </div>
          <div className="template-create-help">
            <span>
              {templateCode === 'DAILY_SCHEDULE_SUMMARY'
                ? '可用业务字段：appointmentDate、appointmentCount、hostCount、bookedHostCount、unbookedHostCount、siteName、scheduleStatus、noticeText'
                : '可用业务字段：appointmentDate、appointmentDateTime、appointmentStatus、appointmentCount、hostName、hostCode、artistName、siteName、startTime、endTime、timeRange、durationMinutes、noticeText'}
            </span>
            <button
              className="primary-action"
              disabled={busyId === 'create'}
              onClick={() => void handleCreate()}
              type="button"
            >
              {busyId === 'create' ? '正在创建…' : '保存草稿'}
            </button>
          </div>
        </section>
      ) : null}

      {error ? (
        <div className="export-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="table-card" aria-busy={loading}>
        <div className="table-summary">
          <strong>模板版本</strong>
          <span>{templates.length} 个版本</span>
        </div>
        {loading && templates.length === 0 ? (
          <div className="content-message">正在加载…</div>
        ) : null}
        {!loading && templates.length === 0 ? (
          <div className="content-message">暂无模板版本</div>
        ) : null}
        {templates.length > 0 ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>业务通知</th>
                  <th>接收角色</th>
                  <th>版本</th>
                  <th>状态</th>
                  <th>订阅类型</th>
                  <th>微信模板 ID</th>
                  <th>字段映射</th>
                  <th>启用时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((template) => (
                  <tr key={template.id}>
                    <td>
                      <strong>{CODE_LABELS[template.templateCode]}</strong>
                    </td>
                    <td>{ROLE_LABELS[template.recipientRoleCode]}</td>
                    <td>v{template.version}</td>
                    <td>
                      <span className={`template-status ${template.status.toLowerCase()}`}>
                        {STATUS_LABELS[template.status]}
                      </span>
                    </td>
                    <td>{SUBSCRIPTION_LABELS[template.subscriptionType]}</td>
                    <td className="template-key">{template.providerTemplateKey ?? '—'}</td>
                    <td className="template-mappings">{template.variableMappings.join('；')}</td>
                    <td>{instantLabel(template.activatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="table-action"
                          disabled={busyId === template.id}
                          onClick={() => void handlePreview(template)}
                          type="button"
                        >
                          预览
                        </button>
                        {isAdmin && template.status === 'DRAFT' ? (
                          <button
                            className="table-action"
                            onClick={() => setAction({ kind: 'activate', template })}
                            type="button"
                          >
                            启用
                          </button>
                        ) : null}
                        {isAdmin && template.status === 'ACTIVE' ? (
                          <button
                            className="table-action danger-text"
                            onClick={() => setAction({ kind: 'retire', template })}
                            type="button"
                          >
                            退役
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
      </section>

      {preview ? (
        <section className="template-preview" aria-label="模板示例预览">
          <div>
            <strong>
              {ROLE_LABELS[preview.recipientRoleCode]} · {CODE_LABELS[preview.templateCode]}示例
            </strong>
            <button className="text-button" onClick={() => setPreview(null)} type="button">
              关闭
            </button>
          </div>
          <dl>
            {Object.entries(preview.data).map(([key, item]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{item.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {action ? (
        <div className="dialog-backdrop" role="presentation">
          <section aria-modal="true" className="dialog template-action-dialog" role="dialog">
            <div className="dialog-header">
              <div>
                <p className="dialog-subtitle">
                  {CODE_LABELS[action.template.templateCode]} · v{action.template.version}
                  {' · '}
                  {ROLE_LABELS[action.template.recipientRoleCode]}
                </p>
                <h2>{action.kind === 'activate' ? '启用此模板版本' : '退役当前模板'}</h2>
              </div>
            </div>
            <p className="dialog-note">
              {action.kind === 'activate'
                ? '启用后，原有生效版本会自动退役；已经排队的通知仍使用原历史版本。'
                : '退役后不会再生成使用此版本的新通知；已经排队的通知不受影响。'}
            </p>
            {action.kind === 'retire' ? (
              <label className="compact-field">
                <span>退役原因</span>
                <textarea
                  autoFocus
                  onChange={(event) => setRetireReason(event.target.value)}
                  rows={3}
                  value={retireReason}
                />
              </label>
            ) : null}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                disabled={busyId !== null}
                onClick={() => {
                  setAction(null);
                  setRetireReason('');
                }}
                type="button"
              >
                取消
              </button>
              <button
                className="primary-button"
                disabled={busyId !== null}
                onClick={() => void handleTransition()}
                type="button"
              >
                {busyId ? '正在保存…' : '确认'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
