import { Button, Input, Text, View } from '@tarojs/components';
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '../../api-client';
import {
  bindWechatAccount,
  type BindableRoleCode,
  type AuthFlowResult,
  type LoginRole,
  loginWithWechat,
  restoreSession,
  saveSession,
  selectLoginRole,
  type SessionTokenPair,
} from '../../auth-session';
import {
  listSubscriptionGroups,
  requestSubscription,
  type SubscriptionGroup,
} from '../../notification-subscription';
import './index.css';

const ROLE_LABELS = { ARTIST: '化妆师', HOST: '主播', OPERATOR: '运营' } as const;
const SITE_OPTIONS = [
  { code: 'SONGJIANG', name: '松江' },
  { code: 'XIANCHANG', name: '现厂' },
  { code: 'WUXI', name: '无锡' },
] as const;

function message(cause: unknown): string {
  if (cause instanceof ApiError) return cause.message;
  if (cause instanceof Error && cause.message) return cause.message;
  return '操作失败，请稍后重试';
}

export default function IndexPage() {
  const initialized = useRef(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionTokenPair | null>(null);
  const [binding, setBinding] = useState<Extract<
    AuthFlowResult,
    { kind: 'BINDING_REQUIRED' }
  > | null>(null);
  const [roleSelection, setRoleSelection] = useState<Extract<
    AuthFlowResult,
    { kind: 'ROLE_SELECTION_REQUIRED' }
  > | null>(null);
  const [bindingRole, setBindingRole] = useState<BindableRoleCode>('HOST');
  const [bindingCode, setBindingCode] = useState('');
  const [targetName, setTargetName] = useState('');
  const [siteCode, setSiteCode] = useState('SONGJIANG');
  const [groups, setGroups] = useState<readonly SubscriptionGroup[]>([]);
  const [subscriptionBusy, setSubscriptionBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void initialize();
  }, []);

  async function initialize(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const restored = await restoreSession();
      if (restored) {
        await activateSession(restored);
      } else {
        await handleAuthFlow(await loginWithWechat());
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleAuthFlow(result: AuthFlowResult): Promise<void> {
    if (result.kind === 'SESSION_CREATED') {
      saveSession(result.session);
      await activateSession(result.session);
      return;
    }
    setBinding(result.kind === 'BINDING_REQUIRED' ? result : null);
    setRoleSelection(result.kind === 'ROLE_SELECTION_REQUIRED' ? result : null);
  }

  async function activateSession(value: SessionTokenPair): Promise<void> {
    setSession(value);
    setBinding(null);
    setRoleSelection(null);
    setGroups(await listSubscriptionGroups(value.accessToken));
  }

  async function submitBinding(): Promise<void> {
    if (!binding || !bindingCode.trim() || !targetName.trim()) {
      setError('请填写绑定码和人员信息');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const target =
        bindingRole === 'HOST'
          ? { hostCode: targetName.trim(), roleCode: bindingRole }
          : bindingRole === 'ARTIST'
            ? { nickname: targetName.trim(), roleCode: bindingRole }
            : { realName: targetName.trim(), roleCode: bindingRole, siteCode };
      await handleAuthFlow(
        await bindWechatAccount({
          bindingChallenge: binding.bindingChallenge,
          bindingCode: bindingCode.trim(),
          target,
        }),
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function chooseRole(role: LoginRole): Promise<void> {
    if (!roleSelection) return;
    setBusy(true);
    setError(null);
    try {
      await handleAuthFlow(
        await selectLoginRole({
          roleAssignmentId: role.roleAssignmentId,
          roleSelectionChallenge: roleSelection.roleSelectionChallenge,
        }),
      );
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }

  async function subscribe(group: SubscriptionGroup): Promise<void> {
    if (!session) return;
    setSubscriptionBusy(group.requestId);
    setError(null);
    setNotice(null);
    try {
      const decisions = await requestSubscription(session.accessToken, group);
      const accepted = decisions.filter((decision) => decision === 'ACCEPT').length;
      setNotice(
        accepted > 0
          ? `已开启 ${accepted} 类通知。一次性订阅发出后需要再次授权。`
          : '本次未开启通知，可稍后再次操作或检查微信通知设置。',
      );
      try {
        setGroups(await listSubscriptionGroups(session.accessToken));
      } catch {
        setGroups([]);
      }
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSubscriptionBusy(null);
    }
  }

  return (
    <View className="page">
      <View className="page-header">
        <Text className="title">化妆预约</Text>
        <Text className="description">查看排班、预约化妆并接收变更提醒</Text>
      </View>

      {busy && !session ? <View className="card status-text">正在登录…</View> : null}

      {binding ? (
        <View className="card">
          <Text className="section-title">首次绑定</Text>
          <Text className="section-note">使用客服提供的一次性绑定码关联你的人员档案。</Text>
          <View className="choice-row">
            {(['HOST', 'OPERATOR', 'ARTIST'] as const).map((role) => (
              <Button
                className={bindingRole === role ? 'choice active' : 'choice'}
                key={role}
                onClick={() => {
                  setBindingRole(role);
                  setTargetName('');
                }}
                size="mini"
              >
                {ROLE_LABELS[role]}
              </Button>
            ))}
          </View>
          <Text className="field-label">绑定码</Text>
          <Input
            className="field-input"
            maxlength={32}
            onInput={(event) => setBindingCode(event.detail.value)}
            placeholder="例如 ABCD-EFGH"
            value={bindingCode}
          />
          <Text className="field-label">
            {bindingRole === 'HOST'
              ? '主播编号'
              : bindingRole === 'ARTIST'
                ? '化妆师昵称'
                : '运营姓名'}
          </Text>
          <Input
            className="field-input"
            maxlength={64}
            onInput={(event) => setTargetName(event.detail.value)}
            value={targetName}
          />
          {bindingRole === 'OPERATOR' ? (
            <>
              <Text className="field-label">所属场地</Text>
              <View className="choice-row">
                {SITE_OPTIONS.map((site) => (
                  <Button
                    className={siteCode === site.code ? 'choice active' : 'choice'}
                    key={site.code}
                    onClick={() => setSiteCode(site.code)}
                    size="mini"
                  >
                    {site.name}
                  </Button>
                ))}
              </View>
            </>
          ) : null}
          <Button className="primary-button" disabled={busy} onClick={() => void submitBinding()}>
            {busy ? '正在绑定…' : '确认绑定'}
          </Button>
        </View>
      ) : null}

      {roleSelection ? (
        <View className="card">
          <Text className="section-title">选择本次身份</Text>
          <Text className="section-note">同一微信关联了多个角色，请选择现在要使用的身份。</Text>
          {roleSelection.roles.map((role) => (
            <Button
              className="role-button"
              disabled={busy}
              key={role.roleAssignmentId}
              onClick={() => void chooseRole(role)}
            >
              {role.roleCode in ROLE_LABELS
                ? ROLE_LABELS[role.roleCode as keyof typeof ROLE_LABELS]
                : role.roleCode}
            </Button>
          ))}
        </View>
      ) : null}

      {session ? (
        <View className="card">
          <View className="section-heading">
            <Text className="section-title">微信通知</Text>
            <Text className="role-tag">
              {session.role.roleCode in ROLE_LABELS
                ? ROLE_LABELS[session.role.roleCode as keyof typeof ROLE_LABELS]
                : session.role.roleCode}
            </Text>
          </View>
          <Text className="section-note">
            预约新增、改期或取消后及时提醒。微信要求由你主动点击授权。
          </Text>
          {groups.length === 0 ? (
            <Text className="status-text">管理员尚未启用通知模板。</Text>
          ) : (
            groups.map((group) => (
              <Button
                className="primary-button"
                disabled={subscriptionBusy !== null}
                key={group.requestId}
                onClick={() => void subscribe(group)}
              >
                {subscriptionBusy === group.requestId
                  ? '正在处理…'
                  : group.subscriptionType === 'PERMANENT'
                    ? '开启长期通知'
                    : '开启本次通知'}
              </Button>
            ))
          )}
          <Text className="subscription-help">
            一次性订阅每发送一次即消耗一次授权；系统不会把历史授权记录当作剩余次数。
          </Text>
        </View>
      ) : null}

      {notice ? <View className="notice success">{notice}</View> : null}
      {error ? (
        <View className="notice error" role="alert">
          {error}
        </View>
      ) : null}
      {!session && !binding && !roleSelection && !busy ? (
        <Button className="secondary-button" onClick={() => void initialize()}>
          重新登录
        </Button>
      ) : null}
    </View>
  );
}
