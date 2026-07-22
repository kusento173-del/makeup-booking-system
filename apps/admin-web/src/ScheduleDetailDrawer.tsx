import { useEffect } from 'react';

import type { ScheduleAppointment, ScheduleArtist } from './schedule-board-api';

interface ScheduleDetailDrawerProps {
  readonly appointment: ScheduleAppointment;
  readonly artist: ScheduleArtist;
  readonly canEdit: boolean;
  readonly date: string;
  readonly onCancel: () => void;
  readonly onClose: () => void;
  readonly onReschedule: () => void;
  readonly siteName: string;
}

function minuteLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function ScheduleDetailDrawer({
  appointment,
  artist,
  canEdit,
  date,
  onCancel,
  onClose,
  onReschedule,
  siteName,
}: ScheduleDetailDrawerProps) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return (
    <div className="schedule-drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside
        aria-labelledby="schedule-detail-title"
        aria-modal="true"
        className="schedule-detail-drawer"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="dialog-header">
          <div>
            <p className="eyebrow">预约详情</p>
            <h2 id="schedule-detail-title">{appointment.hostName}</h2>
          </div>
          <button aria-label="关闭" className="icon-button" onClick={onClose} type="button">
            ×
          </button>
        </header>
        <dl className="schedule-detail-list">
          <div>
            <dt>主播编号</dt>
            <dd>{appointment.hostCode}</dd>
          </div>
          <div>
            <dt>排班日期</dt>
            <dd>{date}</dd>
          </div>
          <div>
            <dt>预约时间</dt>
            <dd>
              {minuteLabel(appointment.startMinute)}—{minuteLabel(appointment.endMinute)}
            </dd>
          </div>
          <div>
            <dt>时长</dt>
            <dd>{appointment.durationMinutes} 分钟</dd>
          </div>
          <div>
            <dt>实际预约化妆师</dt>
            <dd>{artist.artistNickname}</dd>
          </div>
          <div>
            <dt>场地</dt>
            <dd>{siteName}</dd>
          </div>
          <div>
            <dt>预约来源</dt>
            <dd>{appointment.appointmentType === 'FIXED' ? '固定预约' : '单次预约'}</dd>
          </div>
          <div>
            <dt>预约状态</dt>
            <dd>{appointment.status === 'COMPLETED' ? '已完成' : '已预约'}</dd>
          </div>
          <div>
            <dt>当日次数</dt>
            <dd>第 {appointment.dailySequence} 次</dd>
          </div>
          <div>
            <dt>运营</dt>
            <dd>{appointment.operatorName ?? '未分配'}</dd>
          </div>
        </dl>
        {canEdit ? (
          <div className="schedule-detail-actions">
            <button className="primary-button" onClick={onReschedule} type="button">
              改期或换化妆师
            </button>
            <button className="danger-button" onClick={onCancel} type="button">
              取消预约
            </button>
          </div>
        ) : (
          <p className="schedule-detail-note">
            当天排班和已完成预约只读；特殊情况请由管理员通过审计流程处理。
          </p>
        )}
      </aside>
    </div>
  );
}
