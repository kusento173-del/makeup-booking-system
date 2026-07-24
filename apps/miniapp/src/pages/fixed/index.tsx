import { Button, Picker, Text, Textarea, View } from '@tarojs/components';
import Taro, { useDidShow } from '@tarojs/taro';
import { useMemo, useRef, useState } from 'react';

import { ApiError } from '../../api-client';
import { restoreSession } from '../../auth-session';
import {
  type ArtistSummary,
  type BookingDuration,
  type HostSummary,
  listAvailableArtists,
  listSites,
  type SiteSummary,
} from '../../booking-api';
import { ManagedHostPicker } from '../../components/ManagedHostPicker';
import { PageState } from '../../components/PageState';
import {
  cancelFixedRequest,
  changeFixedRequest,
  createFixedRequest,
  type FixedAvailabilityResult,
  type FixedAvailabilitySlot,
  type FixedHostState,
  type FixedRequestItem,
  getFixedAvailability,
  getFixedHostState,
  getManagedHostWorkspace,
  listFixedRequests,
  withdrawFixedRequest,
} from '../../fixed-api';
import {
  createFixedIdempotencyKey,
  FIXED_DURATIONS,
  FIXED_UNAVAILABLE_LABELS,
  FIXED_WEEKDAYS,
  fixedTimeLabel,
  nextBusinessDate,
  requestStatusLabel,
  requestTypeLabel,
  weekdayLabel,
} from '../../fixed-view';
import { toBookingHost } from '../../managed-host-view';
import './index.css';

type RequestMode = 'CANCEL' | 'CHANGE' | 'CREATE';

interface PendingAttempt {
  readonly key: string;
  readonly signature: string;
}

const API_ERROR_LABELS: Readonly<Record<string, string>> = {
  FIXED_AVAILABILITY_DATE_INVALID: '固定开始日期必须晚于今天。',
  FIXED_AVAILABILITY_WEEKDAYS_INVALID: '请至少选择一个固定星期。',
  FIXED_REQUEST_REASON_INVALID: '请填写有效的申请原因。',
  FIXED_REQUEST_STATE_CONFLICT: '固定关系或申请状态已变化，请刷新后重试。',
  FIXED_REQUEST_UNAVAILABLE: '当前条件已不可提交，请重新查询可固定时间。',
};

function errorMessage(cause: unknown): string {
  if (cause instanceof ApiError) return API_ERROR_LABELS[cause.code] ?? cause.message;
  return '固定申请操作失败，请稍后重试。';
}

export default function FixedPage() {
  const routeParams = Taro.getCurrentInstance().router?.params ?? {};
  const [token, setToken] = useState('');
  const [sites, setSites] = useState<readonly SiteSummary[]>([]);
  const [artists, setArtists] = useState<readonly ArtistSummary[]>([]);
  const [requests, setRequests] = useState<readonly FixedRequestItem[]>([]);
  const [host, setHost] = useState<HostSummary | null>(null);
  const [hostState, setHostState] = useState<FixedHostState | null>(null);
  const [mode, setMode] = useState<RequestMode>('CREATE');
  const [effectiveFrom, setEffectiveFrom] = useState(nextBusinessDate);
  const [artistId, setArtistId] = useState('');
  const [duration, setDuration] = useState<BookingDuration>(30);
  const [weekdays, setWeekdays] = useState<readonly number[]>([1, 2, 3, 4, 5]);
  const [reason, setReason] = useState('');
  const [availability, setAvailability] = useState<FixedAvailabilityResult | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<FixedAvailabilitySlot | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateBusy, setStateBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingAttempt = useRef<PendingAttempt | null>(null);

  useDidShow(() => {
    void load();
  });

  const siteArtists = useMemo(
    () => artists.filter((artist) => !host || artist.siteId === host.siteId),
    [artists, host],
  );

  async function load(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const session = await restoreSession();
      if (!session) {
        await Taro.reLaunch({ url: '/pages/index/index' });
        return;
      }
      if (session.role.roleCode !== 'OPERATOR') {
        setError('只有运营可以提交固定申请。');
        return;
      }
      const requestedHostId = typeof routeParams.hostId === 'string' ? routeParams.hostId : null;
      const requestedDate =
        typeof routeParams.date === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(routeParams.date)
          ? routeParams.date
          : effectiveFrom;
      const [artistItems, siteItems, requestPage, managedHost] = await Promise.all([
        listAvailableArtists(session.accessToken),
        listSites(session.accessToken),
        listFixedRequests(session.accessToken),
        requestedHostId
          ? getManagedHostWorkspace(session.accessToken, requestedDate, requestedHostId)
          : Promise.resolve(null),
      ]);
      setToken(session.accessToken);
      setEffectiveFrom(requestedDate);
      setArtists(
        artistItems.filter(
          (artist) => artist.employmentStatus === 'ACTIVE' && artist.initialShiftConfigured,
        ),
      );
      setSites(siteItems);
      setRequests(requestPage.items);
      if (requestedHostId && !managedHost) {
        setError('该主播不在目标日期的负责范围内，请返回负责主播列表重新选择。');
        return;
      }
      if (managedHost) {
        applyHostState(toBookingHost(managedHost), {
          activeRule: managedHost.activeRule,
          hostId: managedHost.hostId,
          pendingRequest: managedHost.pendingRequest,
          siteId: managedHost.siteId,
        });
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  async function selectHost(nextHost: HostSummary): Promise<void> {
    setHostState(null);
    setStateBusy(true);
    setError(null);
    resetPreview();
    try {
      const state = await getFixedHostState(token, nextHost.id);
      applyHostState(nextHost, state);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setStateBusy(false);
    }
  }

  function applyHostState(nextHost: HostSummary, state: FixedHostState): void {
    setHost(nextHost);
    setHostState(state);
    setReason('');
    resetPreview();
    if (state.activeRule) {
      setMode('CHANGE');
      setArtistId(state.activeRule.artistId);
      setDuration(normalizeDuration(state.activeRule.durationMinutes));
      setWeekdays(state.activeRule.weekdays);
    } else {
      setMode('CREATE');
      setArtistId('');
      setDuration(30);
      setWeekdays([1, 2, 3, 4, 5]);
    }
  }

  function chooseMode(nextMode: RequestMode): void {
    const rule = hostState?.activeRule;
    if (!rule && nextMode !== 'CREATE') return;
    setMode(nextMode);
    setReason('');
    if (rule && nextMode === 'CHANGE') {
      setArtistId(rule.artistId);
      setDuration(normalizeDuration(rule.durationMinutes));
      setWeekdays(rule.weekdays);
    }
    resetPreview();
  }

  function toggleWeekday(weekday: number): void {
    setWeekdays((current) =>
      current.includes(weekday)
        ? current.filter((item) => item !== weekday)
        : [...current, weekday].sort((left, right) => left - right),
    );
    resetPreview();
  }

  function resetPreview(): void {
    setAvailability(null);
    setSelectedSlot(null);
    pendingAttempt.current = null;
  }

  async function queryAvailability(): Promise<void> {
    if (!host || !artistId || weekdays.length === 0 || busy) {
      setError(
        !host ? '请先选择主播。' : !artistId ? '请选择化妆师。' : '请至少选择一个固定星期。',
      );
      return;
    }
    setBusy(true);
    setError(null);
    setAvailability(null);
    setSelectedSlot(null);
    try {
      const result = await getFixedAvailability(token, {
        artistId,
        ...(mode === 'CHANGE' && hostState?.activeRule
          ? { currentRuleId: hostState.activeRule.id }
          : {}),
        durationMinutes: duration,
        hostId: host.id,
        requestedStartDate: effectiveFrom,
        weekdays,
      });
      setAvailability(result);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  function selectSlot(slot: FixedAvailabilitySlot): void {
    if (!slot.available || !slot.earliestStartDate) return;
    setSelectedSlot(slot);
    setEffectiveFrom(slot.earliestStartDate);
    pendingAttempt.current = null;
  }

  async function submitSchedule(): Promise<void> {
    if (!host || !selectedSlot || !artistId || !reason.trim() || busy) {
      setError(!reason.trim() ? '请填写申请原因。' : '请先查询并选择一个可固定时间。');
      return;
    }
    const artist = artists.find((item) => item.id === artistId);
    if (!artist) return;
    const confirmed = await Taro.showModal({
      cancelText: '返回检查',
      confirmText: '提交审核',
      content: [
        `${host.nickname ?? host.realName}（${host.hostCode}）`,
        `${artist.nickname} · ${weekdayLabel(weekdays)}`,
        `${effectiveFrom} 起 · ${fixedTimeLabel(selectedSlot.startMinute, selectedSlot.endMinute)} · ${duration}分钟`,
        '提交后由所属场地客服或管理员审核。',
      ].join('\n'),
      title: mode === 'CHANGE' ? '确认变更固定' : '确认申请固定',
    });
    if (!confirmed.confirm) return;

    const input = {
      artistId,
      durationMinutes: duration,
      effectiveFrom,
      hostId: host.id,
      reason: reason.trim(),
      startMinute: selectedSlot.startMinute,
      weekdays,
    };
    const signature = JSON.stringify({ mode, ...input });
    const attempt =
      pendingAttempt.current?.signature === signature
        ? pendingAttempt.current
        : { key: createFixedIdempotencyKey(), signature };
    pendingAttempt.current = attempt;
    setBusy(true);
    setError(null);
    try {
      if (mode === 'CHANGE' && hostState?.activeRule) {
        await changeFixedRequest(
          token,
          { ...input, currentRuleId: hostState.activeRule.id },
          attempt.key,
        );
      } else {
        await createFixedRequest(token, input, attempt.key);
      }
      pendingAttempt.current = null;
      await refreshAfterSubmit(host.id, '固定申请已提交');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function submitCancellation(): Promise<void> {
    const rule = hostState?.activeRule;
    if (!host || !rule || !reason.trim() || busy) {
      setError(!reason.trim() ? '请填写取消固定原因。' : '当前没有可取消的固定关系。');
      return;
    }
    const confirmed = await Taro.showModal({
      cancelText: '保留固定',
      confirmColor: '#9b342d',
      confirmText: '提交取消',
      content: `${host.nickname ?? host.realName}（${host.hostCode}）\n计划 ${effectiveFrom} 起取消固定，提交后由客服或管理员审核。`,
      title: '确认取消固定',
    });
    if (!confirmed.confirm) return;
    const signature = JSON.stringify({ effectiveFrom, hostId: host.id, mode, reason });
    const attempt =
      pendingAttempt.current?.signature === signature
        ? pendingAttempt.current
        : { key: createFixedIdempotencyKey(), signature };
    pendingAttempt.current = attempt;
    setBusy(true);
    setError(null);
    try {
      await cancelFixedRequest(
        token,
        {
          currentRuleId: rule.id,
          effectiveFrom,
          hostId: host.id,
          reason: reason.trim(),
        },
        attempt.key,
      );
      pendingAttempt.current = null;
      await refreshAfterSubmit(host.id, '取消申请已提交');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(requestId: string, rowVersion: number): Promise<void> {
    if (busy) return;
    const confirmed = await Taro.showModal({
      cancelText: '保留申请',
      confirmText: '确认撤回',
      content: '撤回后可以重新提交固定申请。',
      title: '撤回待审核申请',
    });
    if (!confirmed.confirm) return;
    setBusy(true);
    setError(null);
    try {
      await withdrawFixedRequest(token, requestId, rowVersion);
      setRequests((current) =>
        current.map((item) =>
          item.id === requestId
            ? { ...item, rowVersion: item.rowVersion + 1, status: 'WITHDRAWN' }
            : item,
        ),
      );
      if (host) setHostState(await getFixedHostState(token, host.id));
      await Taro.showToast({ icon: 'success', title: '已撤回' });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  }

  async function refreshAfterSubmit(hostId: string, toast: string): Promise<void> {
    const [state, page] = await Promise.all([
      getFixedHostState(token, hostId),
      listFixedRequests(token),
    ]);
    setHostState(state);
    setRequests(page.items);
    setReason('');
    resetPreview();
    await Taro.showToast({ icon: 'success', title: toast });
  }

  if (loading) {
    return (
      <View className="fixed-page">
        <PageState kind="LOADING" message="正在读取固定关系与申请记录。" />
      </View>
    );
  }
  if (error && !token) {
    return (
      <View className="fixed-page">
        <PageState
          actionLabel="重新加载"
          kind="ERROR"
          message={error}
          onAction={() => void load()}
        />
      </View>
    );
  }

  const activeRule = hostState?.activeRule;
  const pendingRequest = hostState?.pendingRequest;
  const unavailable = availability?.unavailableReason
    ? (FIXED_UNAVAILABLE_LABELS[availability.unavailableReason] ?? '当前条件无法固定')
    : null;

  return (
    <View className="fixed-page">
      <View className="fixed-section">
        <Text className="fixed-title">1. 选择负责主播</Text>
        <Text className="fixed-note">名单按计划生效日期的有效负责关系生成。</Text>
        <View className="fixed-field">
          <Text>计划生效日期</Text>
          <Picker
            mode="date"
            onChange={(event) => {
              setEffectiveFrom(event.detail.value);
              resetPreview();
            }}
            start={nextBusinessDate()}
            value={effectiveFrom}
          >
            <View className="fixed-value">{effectiveFrom}</View>
          </Picker>
        </View>
        <ManagedHostPicker
          date={effectiveFrom}
          onSelect={(item) => void selectHost(item)}
          selectedHostId={host?.id}
          token={token}
        />
      </View>
      {error && !host ? <View className="fixed-error">{error}</View> : null}

      {host ? (
        <View className="fixed-section">
          <Text className="fixed-title">2. 当前固定状态</Text>
          <Text className="fixed-note">
            {host.nickname ?? host.realName} · {host.hostCode} ·{' '}
            {sites.find((site) => site.id === host.siteId)?.name ?? '当前场地'}
          </Text>
          {stateBusy ? <Text className="fixed-empty">正在读取固定状态…</Text> : null}
          {activeRule ? (
            <View className="current-rule">
              <Text className="rule-strong">{activeRule.artistNickname}</Text>
              <Text>
                {weekdayLabel(activeRule.weekdays)} ·{' '}
                {fixedTimeLabel(
                  activeRule.startMinute,
                  activeRule.startMinute + activeRule.durationMinutes,
                )}{' '}
                · {activeRule.durationMinutes}分钟
              </Text>
              <Text>{activeRule.validFrom} 起生效</Text>
            </View>
          ) : !stateBusy ? (
            <Text className="fixed-empty">当前没有固定关系，可以申请固定。</Text>
          ) : null}
          {pendingRequest ? (
            <View className="pending-card">
              <Text className="rule-strong">
                {requestTypeLabel(pendingRequest.requestType)} · 待审核
              </Text>
              <Text>计划 {pendingRequest.effectiveFrom} 生效</Text>
              <Button
                className="fixed-secondary"
                disabled={busy}
                onClick={() => void withdraw(pendingRequest.id, pendingRequest.rowVersion)}
              >
                撤回申请
              </Button>
            </View>
          ) : null}
        </View>
      ) : null}

      {host && hostState && !pendingRequest ? (
        <View className="fixed-section">
          <Text className="fixed-title">3. 填写申请</Text>
          <View className="mode-row">
            {activeRule ? (
              <>
                <Button
                  className={mode === 'CHANGE' ? 'mode-button active' : 'mode-button'}
                  onClick={() => chooseMode('CHANGE')}
                  size="mini"
                >
                  变更固定
                </Button>
                <Button
                  className={mode === 'CANCEL' ? 'mode-button danger active' : 'mode-button danger'}
                  onClick={() => chooseMode('CANCEL')}
                  size="mini"
                >
                  取消固定
                </Button>
              </>
            ) : (
              <Text className="mode-label">申请新固定关系</Text>
            )}
          </View>

          {mode !== 'CANCEL' ? (
            <>
              <Text className="field-label">固定星期</Text>
              <View className="weekday-row">
                {FIXED_WEEKDAYS.map((weekday) => (
                  <Button
                    className={
                      weekdays.includes(weekday.value) ? 'weekday-button active' : 'weekday-button'
                    }
                    key={weekday.value}
                    onClick={() => toggleWeekday(weekday.value)}
                    size="mini"
                  >
                    {weekday.label}
                  </Button>
                ))}
              </View>

              <Text className="field-label">每次时长</Text>
              <View className="duration-row">
                {FIXED_DURATIONS.map((minutes) => (
                  <Button
                    className={duration === minutes ? 'fixed-option active' : 'fixed-option'}
                    key={minutes}
                    onClick={() => {
                      setDuration(minutes);
                      resetPreview();
                    }}
                    size="mini"
                  >
                    {minutes}分钟
                  </Button>
                ))}
              </View>

              <Text className="field-label">固定化妆师</Text>
              <View className="artist-row">
                {siteArtists.map((artist) => (
                  <Button
                    className={artistId === artist.id ? 'fixed-option active' : 'fixed-option'}
                    key={artist.id}
                    onClick={() => {
                      setArtistId(artist.id);
                      resetPreview();
                    }}
                    size="mini"
                  >
                    {artist.nickname}
                  </Button>
                ))}
              </View>
              {siteArtists.length === 0 ? (
                <Text className="fixed-empty">该场地暂无已设置班次的化妆师。</Text>
              ) : null}

              <Button
                className="fixed-primary"
                disabled={busy}
                onClick={() => void queryAvailability()}
              >
                {busy ? '正在查询…' : '查询可固定时间'}
              </Button>

              {unavailable ? <View className="fixed-error">{unavailable}</View> : null}
              {availability && !unavailable ? (
                <View className="slot-list">
                  <Text className="field-label">选择长期可固定时间</Text>
                  {availability.slots.map((slot) => (
                    <Button
                      className={[
                        'fixed-slot',
                        slot.available ? '' : 'unavailable',
                        selectedSlot?.startMinute === slot.startMinute ? 'active' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      disabled={!slot.available}
                      key={slot.startMinute}
                      onClick={() => selectSlot(slot)}
                    >
                      <Text className="slot-time">
                        {fixedTimeLabel(slot.startMinute, slot.endMinute)}
                      </Text>
                      <Text className="slot-detail">
                        {slot.available
                          ? `${slot.earliestStartDate} 起可持续固定`
                          : `固定占用：${weekdayLabel(slot.fixedConflictWeekdays)}`}
                      </Text>
                      {slot.singleConflictDates.length > 0 ? (
                        <Text className="slot-detail">
                          此前单次占用：{slot.singleConflictDates.join('、')}
                        </Text>
                      ) : null}
                      {slot.unavailablePeriodConflictDates.length > 0 ? (
                        <Text className="slot-detail">
                          此前临时不可排班：{slot.unavailablePeriodConflictDates.join('、')}
                        </Text>
                      ) : null}
                    </Button>
                  ))}
                </View>
              ) : null}
            </>
          ) : null}

          <Text className="field-label">{mode === 'CANCEL' ? '取消原因' : '申请原因'}</Text>
          <Textarea
            className="fixed-reason"
            maxlength={500}
            onInput={(event) => {
              setReason(event.detail.value);
              pendingAttempt.current = null;
            }}
            placeholder={mode === 'CANCEL' ? '请填写取消固定原因' : '请填写申请或变更原因'}
            value={reason}
          />
          {error ? <View className="fixed-error">{error}</View> : null}
          <Button
            className={mode === 'CANCEL' ? 'fixed-primary danger' : 'fixed-primary'}
            disabled={busy || (mode !== 'CANCEL' && !selectedSlot)}
            onClick={() => void (mode === 'CANCEL' ? submitCancellation() : submitSchedule())}
          >
            {busy ? '正在提交…' : mode === 'CANCEL' ? '提交取消审核' : '提交固定审核'}
          </Button>
        </View>
      ) : null}

      <View className="fixed-section">
        <Text className="fixed-title">我的固定申请</Text>
        {requests.length === 0 ? (
          <Text className="fixed-empty">暂无固定申请记录。</Text>
        ) : (
          requests.map((request) => (
            <View className="request-card" key={request.id}>
              <View className="request-heading">
                <Text className="rule-strong">
                  {request.hostName} · {request.hostCode}
                </Text>
                <Text className={`request-status ${request.status.toLowerCase()}`}>
                  {requestStatusLabel(request.status)}
                </Text>
              </View>
              <Text>
                {requestTypeLabel(request.requestType)} · 计划 {request.effectiveFrom} 生效
              </Text>
              {request.targetArtistNickname ? (
                <Text>
                  {request.targetArtistNickname} · {weekdayLabel(request.targetWeekdays)} ·{' '}
                  {fixedTimeLabel(
                    request.targetStartMinute ?? 0,
                    (request.targetStartMinute ?? 0) + (request.targetDurationMinutes ?? 0),
                  )}
                </Text>
              ) : null}
              <Text>原因：{request.reason}</Text>
              {request.reviewComment ? <Text>审核意见：{request.reviewComment}</Text> : null}
              {request.status === 'PENDING' ? (
                <Button
                  className="fixed-secondary"
                  disabled={busy}
                  onClick={() => void withdraw(request.id, request.rowVersion)}
                >
                  撤回申请
                </Button>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function normalizeDuration(duration: number): BookingDuration {
  return FIXED_DURATIONS.includes(duration as BookingDuration) ? (duration as BookingDuration) : 30;
}
