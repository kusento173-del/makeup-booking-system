import { useState } from 'react';

import type { SessionTokenPair } from './auth-session';
import { MobileArtistTools, type ArtistTool } from './MobileArtistTools';
import { MobileBooking } from './MobileBooking';
import { MobileFixedRelations } from './MobileFixedRelations';
import { MobileLeave } from './MobileLeave';
import { MobileOperator } from './MobileOperator';
import { MobileSchedule } from './MobileSchedule';
import type { MobileAppointment } from './mobile-api';

type MobileView =
  | 'booking'
  | 'fixed'
  | 'home'
  | 'leave'
  | 'managed-hosts'
  | 'overtime'
  | 'schedule'
  | 'shift'
  | 'unavailability';

const ROLE_LABELS = {
  ARTIST: '化妆师',
  HOST: '主播',
  OPERATOR: '运营',
} as const;

const FEATURES: Readonly<
  Record<
    keyof typeof ROLE_LABELS,
    readonly { readonly description: string; readonly id: MobileView; readonly title: string }[]
  >
> = {
  HOST: [
    { description: '今日、明日、未来七日和历史预约', id: 'schedule', title: '我的排班' },
    { description: '选择化妆师和空闲时间', id: 'booking', title: '预约化妆' },
    { description: '固定主播可申请未来七日内请假', id: 'leave', title: '请假' },
  ],
  OPERATOR: [
    { description: '按负责关系查看主播并代预约', id: 'managed-hosts', title: '负责主播' },
    { description: '直接选择负责主播预约', id: 'booking', title: '代主播预约' },
    { description: '新建、变更和取消固定关系', id: 'fixed', title: '固定申请' },
    { description: '查看负责主播的排班', id: 'schedule', title: '排班' },
  ],
  ARTIST: [
    { description: '今日、明日、未来七日和历史预约', id: 'schedule', title: '我的排班' },
    { description: '首次设置与修改固定班次', id: 'shift', title: '班次' },
    { description: '申请未来七日内请假', id: 'leave', title: '请假' },
    {
      description: '设置上课、开会等局部不可预约时间',
      id: 'unavailability',
      title: '临时不可排班',
    },
    { description: '为非工作日提交加班申请', id: 'overtime', title: '加班' },
  ],
};

export function MobileDashboard({
  busy,
  onLogout,
  session,
}: {
  readonly busy: boolean;
  readonly onLogout: () => Promise<void>;
  readonly session: SessionTokenPair;
}) {
  const roleCode = session.role.roleCode;
  const [view, setView] = useState<MobileView>('home');
  const [reschedule, setReschedule] = useState<MobileAppointment | null>(null);
  const [bookingHostId, setBookingHostId] = useState<string | undefined>();
  if (roleCode !== 'HOST' && roleCode !== 'OPERATOR' && roleCode !== 'ARTIST') return null;

  function open(nextView: MobileView) {
    setReschedule(null);
    setBookingHostId(undefined);
    setView(nextView);
  }

  let content;
  if (view === 'schedule') {
    content = (
      <MobileSchedule
        onReschedule={(appointment) => {
          setReschedule(appointment);
          setView('booking');
        }}
        session={session}
      />
    );
  } else if (view === 'booking') {
    content = (
      <MobileBooking
        appointment={reschedule}
        {...(bookingHostId ? { initialHostId: bookingHostId } : {})}
        onCompleted={() => open('schedule')}
        session={session}
      />
    );
  } else if (view === 'leave') {
    content = <MobileLeave session={session} />;
  } else if (view === 'fixed' || view === 'managed-hosts') {
    content = (
      <MobileOperator
        onBookHost={(hostId) => {
          setBookingHostId(hostId);
          setView('booking');
        }}
        session={session}
        view={view}
      />
    );
  } else if (['overtime', 'shift', 'unavailability'].includes(view)) {
    content = <MobileArtistTools session={session} tool={view as ArtistTool} />;
  } else {
    content = (
      <section className="mobile-home">
        <div className="mobile-hero">
          <p className="eyebrow">{ROLE_LABELS[roleCode]}</p>
          <h1>
            {roleCode === 'HOST'
              ? '我的化妆安排'
              : roleCode === 'OPERATOR'
                ? '主播化妆安排'
                : '我的工作安排'}
          </h1>
          <p>
            {roleCode === 'HOST'
              ? '预约、改期和查看自己的化妆排班。'
              : roleCode === 'OPERATOR'
                ? '管理负责主播的预约和固定申请。'
                : '查看排班并管理班次、请假和加班。'}
          </p>
        </div>
        <MobileFixedRelations roleCode={roleCode} session={session} />
        <div className="mobile-feature-grid">
          {FEATURES[roleCode].map((feature) => (
            <button key={feature.id} onClick={() => open(feature.id)} type="button">
              <strong>{feature.title}</strong>
              <span>{feature.description}</span>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="mobile-shell">
      <header className="mobile-topbar">
        <button disabled={view === 'home'} onClick={() => open('home')} type="button">
          {view === 'home' ? '妆序' : '返回'}
        </button>
        <strong>{ROLE_LABELS[roleCode]}端</strong>
        <button disabled={busy} onClick={() => void onLogout()} type="button">
          退出
        </button>
      </header>
      {content}
      <nav className="mobile-bottom-nav" aria-label="主要导航">
        <button
          className={view === 'home' ? 'active' : ''}
          onClick={() => open('home')}
          type="button"
        >
          首页
        </button>
        <button
          className={view === 'schedule' ? 'active' : ''}
          onClick={() => open('schedule')}
          type="button"
        >
          排班
        </button>
        {roleCode !== 'ARTIST' ? (
          <button
            className={view === 'booking' ? 'active' : ''}
            onClick={() => open('booking')}
            type="button"
          >
            预约
          </button>
        ) : (
          <button
            className={view === 'shift' ? 'active' : ''}
            onClick={() => open('shift')}
            type="button"
          >
            班次
          </button>
        )}
      </nav>
    </div>
  );
}
