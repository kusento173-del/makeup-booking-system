"use client";

import { useMemo, useState } from "react";

type Role = "host" | "operator" | "artist" | "service";
type ModalName =
  | "booking"
  | "appointment"
  | "fixed"
  | "shift"
  | "leave"
  | "approval"
  | null;

type BookingMode = "create" | "reschedule" | "service";

type Appointment = {
  id: string;
  date: string;
  weekday: string;
  time: string;
  artist: string;
  site: string;
  duration: number;
  source: "固定预约" | "单次预约";
  sequence: 1 | 2;
};

const roleOptions: Array<{
  id: Role;
  label: string;
  caption: string;
  initials: string;
}> = [
  { id: "host", label: "主播端", caption: "小雨 · ZB01842", initials: "播" },
  { id: "operator", label: "运营端", caption: "周舟 · 松江", initials: "运" },
  { id: "artist", label: "化妆师端", caption: "柔柔 · 松江", initials: "妆" },
  { id: "service", label: "客服后台", caption: "客服小林 · 松江", initials: "客" },
];

const baseAppointments: Appointment[] = [
  {
    id: "AP202607210093",
    date: "7月21日",
    weekday: "周二",
    time: "09:30—10:00",
    artist: "柔柔",
    site: "松江",
    duration: 30,
    source: "固定预约",
    sequence: 1,
  },
];

const artists = [
  { name: "柔柔", next: "10:30", slots: 8, badge: "擅长日常妆" },
  { name: "江江", next: "09:00", slots: 11, badge: "擅长舞台妆" },
  { name: "安安", next: "11:15", slots: 6, badge: "妆发一体" },
];

const timeSlots = [
  "09:00",
  "09:30",
  "10:30",
  "11:00",
  "13:00",
  "13:30",
  "14:15",
  "15:00",
  "16:30",
];

const roleNavigation: Record<Role, string[]> = {
  host: ["首页", "预约", "消息", "我的"],
  operator: ["首页", "主播", "申请", "我的"],
  artist: ["首页", "排班", "申请", "我的"],
  service: ["工作台", "排班管理", "审批中心", "人员管理", "导出中心"],
};

function Icon({ symbol }: { symbol: string }) {
  return (
    <span className="icon" aria-hidden="true">
      {symbol}
    </span>
  );
}

function StatusPill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "accent";
}) {
  return <span className={"status-pill " + tone}>{children}</span>;
}

function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function EmptyState({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-mark">○</div>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

function AppShell() {
  const [role, setRole] = useState<Role>("host");
  const [activeNav, setActiveNav] = useState("首页");
  const [modal, setModal] = useState<ModalName>(null);
  const [toast, setToast] = useState("");
  const [bookingMode, setBookingMode] = useState<BookingMode>("create");
  const [appointments, setAppointments] =
    useState<Appointment[]>(baseAppointments);
  const [selectedAppointment, setSelectedAppointment] =
    useState<Appointment | null>(baseAppointments[0]);
  const [shiftConfigured, setShiftConfigured] = useState(false);
  const [leaveSubmitted, setLeaveSubmitted] = useState(false);
  const [fixedSubmitted, setFixedSubmitted] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<
    "pending" | "approved" | "rejected"
  >("pending");

  const currentRole = roleOptions.find((item) => item.id === role)!;

  function changeRole(nextRole: Role) {
    setRole(nextRole);
    setActiveNav(roleNavigation[nextRole][0]);
    setModal(null);
    setToast("");
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  function openBooking(mode: BookingMode) {
    setBookingMode(mode);
    setModal("booking");
  }

  function addAppointment(appointment: Appointment) {
    setAppointments((current) => {
      if (bookingMode === "reschedule" && selectedAppointment) {
        return current
          .filter((item) => item.id !== selectedAppointment.id)
          .concat(appointment);
      }
      return current.concat(appointment);
    });
    setSelectedAppointment(appointment);
    setModal(null);
    showToast(
      bookingMode === "reschedule"
        ? "改期成功，原预约已取消并保留历史记录"
        : "预约成功，相关人员的通知已创建",
    );
  }

  function cancelAppointment(id: string) {
    setAppointments((current) => current.filter((item) => item.id !== id));
    setModal(null);
    showToast("预约已取消，档期已经释放");
  }

  return (
    <div className={"prototype-app role-" + role}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">妆</div>
          <div>
            <strong>妆序</strong>
            <span>化妆预约系统</span>
          </div>
        </div>

        <div className="role-switcher">
          <span className="sidebar-label">切换原型角色</span>
          {roleOptions.map((item) => (
            <button
              className={role === item.id ? "role-option active" : "role-option"}
              key={item.id}
              onClick={() => changeRole(item.id)}
              type="button"
            >
              <span className="role-avatar">{item.initials}</span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.caption}</small>
              </span>
              <span className="role-check">{role === item.id ? "✓" : ""}</span>
            </button>
          ))}
        </div>

        <nav className="primary-nav" aria-label="主导航">
          <span className="sidebar-label">当前菜单</span>
          {roleNavigation[role].map((item, index) => (
            <button
              className={activeNav === item ? "nav-item active" : "nav-item"}
              key={item}
              onClick={() => setActiveNav(item)}
              type="button"
            >
              <Icon symbol={["⌂", "▦", "◇", "◎", "⇩"][index] || "·"} />
              {item}
              {(item === "审批中心" || item === "申请") &&
              approvalStatus === "pending" ? (
                <span className="nav-count">3</span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="sidebar-foot">
          <span className="live-dot" />
          原型模式 · 模拟数据
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark small">妆</span>
            <strong>妆序</strong>
          </div>
          <div className="topbar-context">
            <span className="topbar-role">{currentRole.label}</span>
            <span className="topbar-date">2026年7月20日 周一</span>
          </div>
          <div className="topbar-actions">
            <button
              className="icon-button"
              aria-label="查看消息"
              onClick={() => setActiveNav("消息")}
              type="button"
            >
              ♢
              <span className="notification-dot" />
            </button>
            <div className="user-chip">
              <span>{currentRole.initials}</span>
              <div>
                <strong>{currentRole.caption.split(" · ")[0]}</strong>
                <small>{currentRole.caption.split(" · ")[1]}</small>
              </div>
            </div>
          </div>
        </header>

        <div className="content">
          {role === "host" ? (
            <HostDashboard
              activeNav={activeNav}
              appointments={appointments}
              openBooking={() => openBooking("create")}
              openAppointment={(appointment) => {
                setSelectedAppointment(appointment);
                setModal("appointment");
              }}
            />
          ) : null}
          {role === "operator" ? (
            <OperatorDashboard
              activeNav={activeNav}
              fixedSubmitted={fixedSubmitted}
              openBooking={() => openBooking("create")}
              openFixed={() => setModal("fixed")}
            />
          ) : null}
          {role === "artist" ? (
            <ArtistDashboard
              activeNav={activeNav}
              shiftConfigured={shiftConfigured}
              leaveSubmitted={leaveSubmitted}
              openShift={() => setModal("shift")}
              openLeave={() => setModal("leave")}
            />
          ) : null}
          {role === "service" ? (
            <ServiceDashboard
              activeNav={activeNav}
              approvalStatus={approvalStatus}
              openBooking={() => openBooking("service")}
              openApproval={() => setModal("approval")}
              showToast={showToast}
            />
          ) : null}
        </div>

        {role !== "service" ? (
          <nav className="mobile-nav" aria-label="手机端导航">
            {roleNavigation[role].map((item, index) => (
              <button
                className={activeNav === item ? "active" : ""}
                key={item}
                onClick={() => setActiveNav(item)}
                type="button"
              >
                <Icon symbol={["⌂", "▦", "◇", "◎"][index] || "·"} />
                <span>{item}</span>
              </button>
            ))}
          </nav>
        ) : null}
      </main>

      {modal === "booking" ? (
        <BookingModal
          existing={appointments}
          mode={bookingMode}
          onClose={() => setModal(null)}
          onSubmit={addAppointment}
        />
      ) : null}
      {modal === "appointment" && selectedAppointment ? (
        <AppointmentModal
          appointment={selectedAppointment}
          onCancel={() => cancelAppointment(selectedAppointment.id)}
          onClose={() => setModal(null)}
          onReschedule={() => openBooking("reschedule")}
        />
      ) : null}
      {modal === "fixed" ? (
        <FixedModal
          onClose={() => setModal(null)}
          onSubmit={() => {
            setFixedSubmitted(true);
            setModal(null);
            showToast("固定申请已提交，长期档期已进入待审核占用");
          }}
        />
      ) : null}
      {modal === "shift" ? (
        <ShiftModal
          onClose={() => setModal(null)}
          onSubmit={() => {
            setShiftConfigured(true);
            setModal(null);
            showToast("首次班次设置成功，明日起开放可预约时间");
          }}
        />
      ) : null}
      {modal === "leave" ? (
        <LeaveModal
          onClose={() => setModal(null)}
          onSubmit={() => {
            setLeaveSubmitted(true);
            setModal(null);
            showToast("请假已生效，受影响预约已取消并通知相关人员");
          }}
        />
      ) : null}
      {modal === "approval" ? (
        <ApprovalModal
          onClose={() => setModal(null)}
          onDecision={(decision) => {
            setApprovalStatus(decision);
            setModal(null);
            showToast(
              decision === "approved"
                ? "审批已通过，固定关系和未来预约已生成"
                : "申请已驳回，长期档期已释放",
            );
          }}
        />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <span>✓</span>
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function HostDashboard({
  activeNav,
  appointments,
  openBooking,
  openAppointment,
}: {
  activeNav: string;
  appointments: Appointment[];
  openBooking: () => void;
  openAppointment: (appointment: Appointment) => void;
}) {
  if (activeNav === "消息") {
    return <MessageCenter />;
  }

  if (activeNav === "我的") {
    return (
      <ProfilePanel
        rows={[
          ["姓名", "小雨"],
          ["主播编号", "ZB01842"],
          ["所属场地", "松江"],
          ["当前运营", "周舟"],
          ["预约资格", "正常"],
        ]}
      />
    );
  }

  if (activeNav === "预约") {
    return (
      <div className="page-stack">
        <SectionHeading
          eyebrow="我的预约"
          title="未来七日"
          action={
            <button className="button primary" onClick={openBooking} type="button">
              ＋ 预约化妆
            </button>
          }
        />
        <DateStrip />
        <div className="appointment-list">
          {appointments.length ? (
            appointments.map((appointment) => (
              <AppointmentCard
                appointment={appointment}
                key={appointment.id}
                onClick={() => openAppointment(appointment)}
              />
            ))
          ) : (
            <EmptyState
              action={
                <button
                  className="button primary"
                  onClick={openBooking}
                  type="button"
                >
                  预约化妆
                </button>
              }
              detail="未来七日还没有预约，可以从明天开始选择空闲时间。"
              title="暂无预约"
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">下午好，小雨</p>
          <h1>化妆安排，一眼就清楚</h1>
          <p>今天的排班已经锁定，明日起未来七日可以预约或调整。</p>
        </div>
        <button className="button primary large" onClick={openBooking} type="button">
          <span>＋</span>
          预约化妆
        </button>
      </section>

      <div className="notice-bar">
        <span className="notice-icon">!</span>
        <div>
          <strong>当天排班已锁定</strong>
          <span>7月20日的预约只能查看，无法新增、改期或取消。</span>
        </div>
      </div>

      <div className="dashboard-grid host-grid">
        <section className="panel next-panel">
          <SectionHeading
            eyebrow="下一场预约"
            title="下一次化妆"
            action={<StatusPill tone="accent">明天</StatusPill>}
          />
          {appointments.length ? (
            <button
              className="hero-appointment"
              onClick={() => openAppointment(appointments[0])}
              type="button"
            >
              <div className="date-block">
                <strong>21</strong>
                <span>7月 · 周二</span>
              </div>
              <div className="appointment-main">
                <strong>{appointments[0].time}</strong>
                <span>
                  {appointments[0].artist} · {appointments[0].site}场地
                </span>
                <div className="tag-row">
                  <StatusPill tone="accent">
                    {appointments[0].source}
                  </StatusPill>
                  <StatusPill tone="success">已预约</StatusPill>
                </div>
              </div>
              <span className="arrow">›</span>
            </button>
          ) : (
            <EmptyState
              detail="明日暂无化妆预约"
              title="还没有安排"
              action={
                <button
                  className="button primary"
                  onClick={openBooking}
                  type="button"
                >
                  现在预约
                </button>
              }
            />
          )}
          <div className="operator-line">
            <span className="avatar small-avatar">周</span>
            <span>
              <small>当前负责运营</small>
              <strong>周舟</strong>
            </span>
            <button className="text-button" type="button">
              查看资料
            </button>
          </div>
        </section>

        <section className="panel week-panel">
          <SectionHeading
            eyebrow="7-DAY OVERVIEW"
            title="未来七日"
            action={
              <button className="text-button" onClick={openBooking} type="button">
                查看全部
              </button>
            }
          />
          <DateStrip compact />
          <div className="week-summary">
            <div>
              <span className="summary-dot accent" />
              <span>已有预约</span>
              <strong>{appointments.length}次</strong>
            </div>
            <div>
              <span className="summary-dot available" />
              <span>可预约日期</span>
              <strong>7天</strong>
            </div>
          </div>
        </section>
      </div>

      <SectionHeading
        eyebrow="常用操作"
        title="常用操作"
      />
      <div className="quick-actions">
        <button onClick={openBooking} type="button">
          <Icon symbol="＋" />
          <span>
            <strong>预约化妆</strong>
            <small>选择空闲化妆师和时间</small>
          </span>
        </button>
        <button
          onClick={() =>
            appointments[0] ? openAppointment(appointments[0]) : openBooking()
          }
          type="button"
        >
          <Icon symbol="↻" />
          <span>
            <strong>改期或取消</strong>
            <small>最晚在预约日前操作</small>
          </span>
        </button>
        <button type="button">
          <Icon symbol="☾" />
          <span>
            <strong>主播请假</strong>
            <small>固定主播可申请未来七日</small>
          </span>
        </button>
      </div>
    </div>
  );
}

function OperatorDashboard({
  activeNav,
  fixedSubmitted,
  openBooking,
  openFixed,
}: {
  activeNav: string;
  fixedSubmitted: boolean;
  openBooking: () => void;
  openFixed: () => void;
}) {
  if (activeNav === "我的") {
    return (
      <ProfilePanel
        rows={[
          ["姓名", "周舟"],
          ["所属场地", "松江"],
          ["当前负责主播", "48人"],
          ["账号状态", "正常"],
        ]}
      />
    );
  }

  if (activeNav === "申请") {
    return (
      <div className="page-stack">
        <SectionHeading
          eyebrow="固定申请"
          title="固定申请"
          action={
            <button className="button primary" onClick={openFixed} type="button">
              ＋ 新建固定申请
            </button>
          }
        />
        <div className="filter-tabs">
          <button className="active" type="button">
            全部 6
          </button>
          <button type="button">待审核 {fixedSubmitted ? 2 : 1}</button>
          <button type="button">已通过 4</button>
          <button type="button">已驳回 1</button>
        </div>
        <div className="application-list">
          {fixedSubmitted ? (
            <ApplicationRow
              host="小雨 · ZB01842"
              meta="柔柔 · 每周二、四 · 09:30—10:00"
              status="待审核"
              tone="warning"
            />
          ) : null}
          <ApplicationRow
            host="安琪 · ZB01703"
            meta="江江 · 每个工作日 · 08:30—09:00"
            status="待审核"
            tone="warning"
          />
          <ApplicationRow
            host="小鹿 · ZB01655"
            meta="柔柔 · 每周一、三、五 · 10:30—11:00"
            status="已通过"
            tone="success"
          />
        </div>
      </div>
    );
  }

  if (activeNav === "主播") {
    return <HostDirectory openBooking={openBooking} openFixed={openFixed} />;
  }

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">运营工作台 · 松江</p>
          <h1>明日排班概览</h1>
          <p>48名负责主播中，36人已有安排，12人暂无化妆预约。</p>
        </div>
        <button className="button primary large" onClick={openBooking} type="button">
          ＋ 代主播预约
        </button>
      </section>

      <div className="metrics-grid">
        <MetricCard label="负责主播" value="48" detail="当前有效关系" tone="dark" />
        <MetricCard label="明日有预约" value="36" detail="75% 已安排" tone="accent" />
        <MetricCard label="明日无预约" value="12" detail="需要关注" tone="warning" />
        <MetricCard
          label="待处理申请"
          value={fixedSubmitted ? "2" : "1"}
          detail="固定相关"
          tone="neutral"
        />
      </div>

      <div className="dashboard-grid operator-grid">
        <section className="panel">
          <SectionHeading
            eyebrow="明日排班"
            title="明日主播排班"
            action={<button className="text-button">查看全部</button>}
          />
          <div className="host-overview-list">
            <HostOverview
              id="ZB01842"
              name="小雨"
              schedule="09:30 · 柔柔"
              status="已预约"
            />
            <HostOverview
              id="ZB01703"
              name="安琪"
              schedule="10:00 · 江江"
              status="已预约"
            />
            <HostOverview
              id="ZB01655"
              name="小鹿"
              schedule="暂无预约"
              status="待安排"
            />
            <HostOverview
              id="ZB01991"
              name="小雨"
              schedule="13:30 · 安安"
              status="已预约"
            />
          </div>
        </section>

        <section className="panel">
          <SectionHeading eyebrow="申请记录" title="固定申请" />
          <div className="fixed-callout">
            <span className="callout-mark">固</span>
            <div>
              <strong>为主播建立长期固定</strong>
              <p>系统会排除已有固定，并计算避开未来单次预约的最早日期。</p>
            </div>
          </div>
          <button className="button secondary full" onClick={openFixed} type="button">
            查看可申请固定时间
          </button>
          <div className="mini-legend">
            <span><i className="red" />固定占用</span>
            <span><i className="orange" />未来单次</span>
            <span><i className="green" />可以申请</span>
          </div>
        </section>
      </div>
    </div>
  );
}

function ArtistDashboard({
  activeNav,
  shiftConfigured,
  leaveSubmitted,
  openShift,
  openLeave,
}: {
  activeNav: string;
  shiftConfigured: boolean;
  leaveSubmitted: boolean;
  openShift: () => void;
  openLeave: () => void;
}) {
  if (activeNav === "我的") {
    return (
      <ProfilePanel
        rows={[
          ["昵称", "柔柔"],
          ["所属场地", "松江"],
          ["班次状态", shiftConfigured ? "已设置" : "未设置"],
          ["账号状态", "正常"],
        ]}
      />
    );
  }

  if (activeNav === "申请") {
    return (
      <div className="page-stack">
        <SectionHeading eyebrow="申请记录" title="申请与请假" />
        <div className="quick-actions two-column">
          <button onClick={openLeave} type="button">
            <Icon symbol="☾" />
            <span>
              <strong>申请请假</strong>
              <small>未来七日内，最多连续七日</small>
            </span>
          </button>
          <button type="button">
            <Icon symbol="＋" />
            <span>
              <strong>申请加班</strong>
              <small>常规非工作日开放指定日期</small>
            </span>
          </button>
          <button onClick={openShift} type="button">
            <Icon symbol="⌚" />
            <span>
              <strong>{shiftConfigured ? "修改班次" : "设置班次"}</strong>
              <small>{shiftConfigured ? "后续修改需要客服审核" : "首次设置无需审核"}</small>
            </span>
          </button>
        </div>
        {leaveSubmitted ? (
          <ApplicationRow
            host="柔柔 · 化妆师请假"
            meta="7月23日—7月24日 · 已取消5条受影响预约"
            status="已生效"
            tone="success"
          />
        ) : (
          <EmptyState
            detail="目前没有进行中的请假或待审核申请。"
            title="暂无申请记录"
          />
        )}
      </div>
    );
  }

  if (activeNav === "排班") {
    return (
      <div className="page-stack">
        <SectionHeading eyebrow="当前排班" title="我的排班" />
        <DateStrip />
        <ArtistSchedule />
      </div>
    );
  }

  return (
    <div className="page-stack">
      <section className="welcome-row">
        <div>
          <p className="eyebrow">柔柔 · 松江场地</p>
          <h1>今天有 6 位主播</h1>
          <p>下一位 10:00 开始，当前排班已经锁定。</p>
        </div>
        <StatusPill tone="success">今日工作日</StatusPill>
      </section>

      {!shiftConfigured ? (
        <div className="setup-banner">
          <span className="setup-icon">⌚</span>
          <div>
            <strong>请先设置固定班次</strong>
            <p>完成工作日、上班、午休和下班时间后，主播才能看到你的可预约时间。</p>
          </div>
          <button className="button light" onClick={openShift} type="button">
            立即设置
          </button>
        </div>
      ) : (
        <div className="notice-bar success">
          <span className="notice-icon">✓</span>
          <div>
            <strong>固定班次已生效</strong>
            <span>周一至周五 · 08:00—18:00 · 午休12:00—13:00</span>
          </div>
          <button className="text-button" onClick={openShift} type="button">
            申请修改
          </button>
        </div>
      )}

      <div className="dashboard-grid artist-grid">
        <section className="panel">
          <SectionHeading
            eyebrow="今日排班"
            title="今日时间线"
            action={<StatusPill tone="neutral">6个预约</StatusPill>}
          />
          <ArtistSchedule />
        </section>
        <section className="panel">
          <SectionHeading eyebrow="明日排班" title="明日概览" />
          <div className="tomorrow-number">
            <strong>7</strong>
            <span>个预约</span>
          </div>
          <div className="mini-stats">
            <div><span>固定预约</span><strong>5</strong></div>
            <div><span>单次预约</span><strong>2</strong></div>
            <div><span>首个时间</span><strong>08:30</strong></div>
          </div>
          <button className="button secondary full" onClick={openLeave} type="button">
            申请请假
          </button>
        </section>
      </div>
    </div>
  );
}

function ServiceDashboard({
  activeNav,
  approvalStatus,
  openBooking,
  openApproval,
  showToast,
}: {
  activeNav: string;
  approvalStatus: "pending" | "approved" | "rejected";
  openBooking: () => void;
  openApproval: () => void;
  showToast: (message: string) => void;
}) {
  if (activeNav === "审批中心") {
    return (
      <div className="page-stack service-page">
        <SectionHeading
          eyebrow="松江场地"
          title="审批中心"
        />
        <div className="filter-tabs">
          <button className="active" type="button">待审核 3</button>
          <button type="button">固定新建 1</button>
          <button type="button">固定变更 1</button>
          <button type="button">班次与加班 1</button>
        </div>
        <div className="approval-table">
          <div className="table-head">
            <span>申请对象</span>
            <span>申请内容</span>
            <span>提交时间</span>
            <span>状态</span>
            <span>操作</span>
          </div>
          <ApprovalRow
            content="每周二、四 · 09:30—10:00"
            name="小雨 · ZB01842"
            onClick={openApproval}
            status={approvalStatus}
            submitted="今天 14:26"
          />
          <ApprovalRow
            content="班次改为 08:30—17:30"
            name="江江 · 化妆师"
            onClick={openApproval}
            status="pending"
            submitted="今天 11:08"
          />
          <ApprovalRow
            content="7月26日加班 09:00—15:00"
            name="安安 · 化妆师"
            onClick={openApproval}
            status="pending"
            submitted="昨天 18:42"
          />
        </div>
      </div>
    );
  }

  if (activeNav === "人员管理") {
    return <PeopleManagement />;
  }

  if (activeNav === "导出中心") {
    return (
      <div className="page-stack service-page">
        <SectionHeading eyebrow="导出范围" title="排班导出" />
        <section className="panel export-panel">
          <div className="form-grid">
            <label>
              <span>排班日期</span>
              <input type="date" defaultValue="2026-07-21" />
            </label>
            <label>
              <span>导出场地</span>
              <select defaultValue="松江"><option>松江</option></select>
            </label>
            <label>
              <span>记录范围</span>
              <select defaultValue="有效预约">
                <option>有效预约</option>
                <option>包含已取消</option>
              </select>
            </label>
          </div>
          <div className="export-summary">
            <span>预计导出</span>
            <strong>487 条排班</strong>
            <small>标准四列 + 结构化详情工作表</small>
          </div>
          <button
            className="button primary"
            onClick={() => showToast("导出任务已创建，文件生成后可下载")}
            type="button"
          >
            生成 Excel
          </button>
        </section>
      </div>
    );
  }

  if (activeNav === "排班管理") {
    return (
      <ScheduleBoard
        openBooking={openBooking}
        showToast={showToast}
        title="排班管理"
      />
    );
  }

  return (
    <div className="page-stack service-page">
      <section className="service-heading">
        <div>
          <p className="eyebrow">松江场地 · 客服工作台</p>
          <h1>今日排班运行正常</h1>
          <p>20:00 将发送明日排班汇总，当前有 3 条申请待审核。</p>
        </div>
        <div className="service-actions">
          <button className="button secondary" type="button">导出明日排班</button>
          <button className="button primary" onClick={openBooking} type="button">
            ＋ 代录预约
          </button>
        </div>
      </section>

      <div className="metrics-grid service-metrics">
        <MetricCard label="今日预约" value="472" detail="已完成 318" tone="dark" />
        <MetricCard label="明日预约" value="487" detail="较今日 +3.2%" tone="accent" />
        <MetricCard label="未配置班次" value="4" detail="需要提醒" tone="warning" />
        <MetricCard label="待审核申请" value="3" detail="最早等待 2小时" tone="neutral" />
        <MetricCard label="通知失败" value="2" detail="可重试" tone="danger" />
      </div>

      <ScheduleBoard
        compact
        openBooking={openBooking}
        showToast={showToast}
        title="今日排班"
      />
    </div>
  );
}

function DateStrip({ compact = false }: { compact?: boolean }) {
  const dates = [
    ["21", "周二"],
    ["22", "周三"],
    ["23", "周四"],
    ["24", "周五"],
    ["25", "周六"],
    ["26", "周日"],
    ["27", "周一"],
  ];
  return (
    <div className={compact ? "date-strip compact" : "date-strip"}>
      {dates.map(([date, day], index) => (
        <button className={index === 0 ? "active" : ""} key={date} type="button">
          <span>{day}</span>
          <strong>{date}</strong>
          <i className={index === 0 ? "has-booking" : ""} />
        </button>
      ))}
    </div>
  );
}

function AppointmentCard({
  appointment,
  onClick,
}: {
  appointment: Appointment;
  onClick: () => void;
}) {
  return (
    <button className="appointment-card" onClick={onClick} type="button">
      <div className="appointment-date">
        <strong>{appointment.date.replace("月", "/").replace("日", "")}</strong>
        <span>{appointment.weekday}</span>
      </div>
      <div className="appointment-card-main">
        <div>
          <strong>{appointment.time}</strong>
          <StatusPill tone={appointment.sequence === 2 ? "warning" : "accent"}>
            第{appointment.sequence}次
          </StatusPill>
        </div>
        <span>{appointment.artist} · {appointment.site}场地 · {appointment.duration}分钟</span>
      </div>
      <div className="appointment-card-state">
        <StatusPill tone="success">已预约</StatusPill>
        <small>{appointment.source}</small>
      </div>
      <span className="arrow">›</span>
    </button>
  );
}

function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  tone: string;
}) {
  return (
    <div className={"metric-card " + tone}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function HostOverview({
  id,
  name,
  schedule,
  status,
}: {
  id: string;
  name: string;
  schedule: string;
  status: string;
}) {
  return (
    <button className="host-overview" type="button">
      <span className="avatar">{name.slice(0, 1)}</span>
      <span className="host-info"><strong>{name}</strong><small>{id} · 松江</small></span>
      <span className="host-schedule">{schedule}</span>
      <StatusPill tone={status === "已预约" ? "success" : "warning"}>{status}</StatusPill>
      <span className="arrow">›</span>
    </button>
  );
}

function ApplicationRow({
  host,
  meta,
  status,
  tone,
}: {
  host: string;
  meta: string;
  status: string;
  tone: "success" | "warning";
}) {
  return (
    <button className="application-row" type="button">
      <span className="application-icon">固</span>
      <span><strong>{host}</strong><small>{meta}</small></span>
      <StatusPill tone={tone}>{status}</StatusPill>
      <span className="arrow">›</span>
    </button>
  );
}

function HostDirectory({
  openBooking,
  openFixed,
}: {
  openBooking: () => void;
  openFixed: () => void;
}) {
  return (
    <div className="page-stack">
      <SectionHeading eyebrow="主播范围" title="负责主播" />
      <div className="toolbar">
        <label className="search-box">
          <span>⌕</span>
          <input placeholder="搜索主播编号或姓名" />
        </label>
        <select defaultValue="全部预约状态">
          <option>全部预约状态</option>
          <option>明日有预约</option>
          <option>明日无预约</option>
        </select>
      </div>
      <section className="panel host-directory">
        {[
          ["小雨", "ZB01842", "明日 09:30 · 柔柔", "固定主播"],
          ["安琪", "ZB01703", "明日 10:00 · 江江", "单次主播"],
          ["小鹿", "ZB01655", "明日暂无预约", "固定主播"],
          ["小雨", "ZB01991", "明日 13:30 · 安安", "单次主播"],
        ].map(([name, id, schedule, type]) => (
          <div className="directory-row" key={id}>
            <span className="avatar">{name.slice(0, 1)}</span>
            <span><strong>{name}</strong><small>{id} · 松江</small></span>
            <span className="directory-schedule">{schedule}</span>
            <StatusPill tone={type === "固定主播" ? "accent" : "neutral"}>{type}</StatusPill>
            <div className="row-actions">
              <button onClick={openBooking} type="button">代预约</button>
              <button onClick={openFixed} type="button">固定</button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function ArtistSchedule() {
  return (
    <div className="artist-schedule">
      {[
        ["08:30", "小鹿 · ZB01655", "固定", "已完成"],
        ["09:30", "小雨 · ZB01842", "固定", "已预约"],
        ["10:00", "安琪 · ZB01703", "单次", "已预约"],
        ["10:45", "可用时间", "", "空闲"],
        ["11:15", "小满 · ZB01339", "单次", "已预约"],
      ].map(([time, host, source, state]) => (
        <div className={"schedule-line " + (state === "空闲" ? "free" : "")} key={time}>
          <span className="schedule-time">{time}</span>
          <i />
          <span className="schedule-host">
            <strong>{host}</strong>
            {source ? <small>{source}预约 · 30分钟</small> : <small>30分钟空档</small>}
          </span>
          <StatusPill tone={state === "已完成" ? "success" : state === "空闲" ? "neutral" : "accent"}>
            {state}
          </StatusPill>
        </div>
      ))}
    </div>
  );
}

function ScheduleBoard({
  title,
  compact = false,
  openBooking,
  showToast,
}: {
  title: string;
  compact?: boolean;
  openBooking: () => void;
  showToast: (message: string) => void;
}) {
  const [view, setView] = useState("紧凑排班");
  return (
    <section className={compact ? "panel schedule-board compact-board" : "panel schedule-board"}>
      <div className="board-heading">
        <div>
          <p className="eyebrow">按化妆师查看</p>
          <h2>{title}</h2>
        </div>
        <div className="board-controls">
          <div className="segmented">
            <button className={view === "紧凑排班" ? "active" : ""} onClick={() => setView("紧凑排班")} type="button">紧凑排班</button>
            <button className={view === "明细表" ? "active" : ""} onClick={() => setView("明细表")} type="button">明细表</button>
          </div>
          <button className="button secondary" onClick={() => showToast("排班已刷新到最新状态")} type="button">↻ 刷新</button>
          <button className="button primary" onClick={openBooking} type="button">＋ 代录</button>
        </div>
      </div>
      <div className="schedule-toolbar">
        <div className="date-picker-fake">‹ <strong>2026-07-20 周一</strong> ›</div>
        <label className="search-box small-search"><span>⌕</span><input placeholder="主播 / 化妆师" /></label>
        <span className="update-time">最后更新 15:42:18</span>
      </div>
      {view === "紧凑排班" ? <CompactSchedule /> : <ScheduleTable />}
      <div className="timeline-legend">
        <span><i className="fixed" />固定预约</span>
        <span><i className="single" />单次预约</span>
        <span className="sort-note">每位化妆师的预约按开始时间排列</span>
      </div>
    </section>
  );
}

function CompactSchedule() {
  const endTimeFor = (start: string, duration: number) => {
    const [hour, minute] = start.split(":").map(Number);
    const endMinutes = hour * 60 + minute + duration;
    return `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  };
  const rows = [
    {
      name: "柔柔",
      blocks: [
        { start: "08:30", duration: 30, host: "小鹿", hostId: "ZB01655", type: "fixed" },
        { start: "09:45", duration: 30, host: "小雨", hostId: "ZB01842", type: "fixed" },
        { start: "10:45", duration: 45, host: "安琪", hostId: "ZB01703", type: "single" },
        { start: "13:15", duration: 30, host: "小满", hostId: "ZB01928", type: "single" },
        { start: "15:30", duration: 30, host: "笑笑", hostId: "ZB01566", type: "fixed" },
      ],
    },
    {
      name: "江江",
      blocks: [
        { start: "08:15", duration: 30, host: "可可", hostId: "ZB01288", type: "single" },
        { start: "09:30", duration: 30, host: "小鱼", hostId: "ZB01302", type: "fixed" },
        { start: "11:15", duration: 30, host: "圆圆", hostId: "ZB01176", type: "single" },
        { start: "13:45", duration: 45, host: "妮妮", hostId: "ZB01491", type: "single" },
        { start: "16:00", duration: 30, host: "阿紫", hostId: "ZB01806", type: "fixed" },
      ],
    },
    {
      name: "安安",
      blocks: [
        { start: "09:00", duration: 30, host: "七七", hostId: "ZB01037", type: "fixed" },
        { start: "10:30", duration: 30, host: "暖暖", hostId: "ZB01772", type: "single" },
        { start: "13:00", duration: 30, host: "小贝", hostId: "ZB01542", type: "fixed" },
        { start: "15:00", duration: 30, host: "佳佳", hostId: "ZB01901", type: "single" },
      ],
    },
    {
      name: "木木",
      blocks: [],
    },
  ];
  return (
    <div className="compact-schedule">
      <div className="schedule-list-head">
        <span className="artist-column">化妆师</span>
        <span>当日预约（按开始时间排序）</span>
      </div>
      {rows.map((row) => (
        <div className="schedule-list-row" key={row.name}>
          <div className="artist-cell">
            <span className="avatar">{row.name.slice(0, 1)}</span>
            <span><strong>{row.name}</strong><small>{row.blocks.length ? row.blocks.length + "个预约" : "未设置班次"}</small></span>
          </div>
          <div className={row.blocks.length ? "appointment-sequence" : "appointment-sequence disabled"}>
            {row.blocks.map((block) => (
              <button
                className={"schedule-booking-card " + block.type}
                key={block.start + block.host}
                title={`${block.start} · ${block.host} · ${block.duration}分钟`}
                type="button"
              >
                <span className="booking-card-time">{block.start}—{endTimeFor(block.start, block.duration)}</span>
                <span className="booking-card-host"><strong>{block.host}</strong><small>{block.hostId}</small></span>
                <span className="booking-card-meta"><i />{block.type === "fixed" ? "固定" : "单次"}<b>{block.duration}分钟</b></span>
              </button>
            ))}
            {!row.blocks.length ? <span className="not-configured">未配置班次，当前不可预约</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleTable() {
  return (
    <div className="simple-table">
      <div className="table-head">
        <span>时间</span><span>主播</span><span>化妆师</span><span>类型</span><span>状态</span>
      </div>
      {[
        ["08:30—09:00", "小鹿 · ZB01655", "柔柔", "固定预约", "已完成"],
        ["09:00—09:30", "可可 · ZB01288", "江江", "单次预约", "已完成"],
        ["09:30—10:00", "小雨 · ZB01842", "柔柔", "固定预约", "已预约"],
        ["10:00—10:45", "安琪 · ZB01703", "柔柔", "单次预约", "已预约"],
      ].map((row) => (
        <button className="table-row" key={row[0] + row[1]} type="button">
          {row.map((cell, index) => <span key={cell}><strong>{index === 0 || index === 1 ? cell : ""}</strong>{index > 1 ? cell : ""}</span>)}
        </button>
      ))}
    </div>
  );
}

function ApprovalRow({
  name,
  content,
  submitted,
  status,
  onClick,
}: {
  name: string;
  content: string;
  submitted: string;
  status: "pending" | "approved" | "rejected";
  onClick: () => void;
}) {
  const statusMap = {
    pending: ["待审核", "warning"] as const,
    approved: ["已通过", "success"] as const,
    rejected: ["已驳回", "danger"] as const,
  };
  return (
    <button className="table-row approval-row" onClick={onClick} type="button">
      <span><strong>{name}</strong><small>松江场地</small></span>
      <span>{content}</span>
      <span>{submitted}</span>
      <span><StatusPill tone={statusMap[status][1]}>{statusMap[status][0]}</StatusPill></span>
      <span className="row-action">查看</span>
    </button>
  );
}

function PeopleManagement() {
  return (
    <div className="page-stack service-page">
      <SectionHeading
        eyebrow="松江场地"
        title="人员管理"
        action={<button className="button primary" type="button">＋ 新增人员</button>}
      />
      <div className="filter-tabs">
        <button className="active" type="button">主播 1,836</button>
        <button type="button">化妆师 56</button>
        <button type="button">运营 128</button>
        <button type="button">负责关系</button>
      </div>
      <div className="toolbar">
        <label className="search-box"><span>⌕</span><input placeholder="搜索主播编号或姓名" /></label>
        <select defaultValue="全部资格"><option>全部资格</option><option>正常</option><option>暂停</option></select>
      </div>
      <section className="panel simple-table people-table">
        <div className="table-head"><span>主播</span><span>场地</span><span>当前运营</span><span>预约资格</span><span>账号绑定</span></div>
        {[
          ["小雨 · ZB01842", "松江", "周舟", "正常", "已绑定"],
          ["安琪 · ZB01703", "松江", "周舟", "正常", "已绑定"],
          ["小鹿 · ZB01655", "松江", "周舟", "正常", "未绑定"],
          ["小雨 · ZB01991", "松江", "林林", "暂停", "已绑定"],
        ].map((row) => (
          <button className="table-row" key={row[0]} type="button">
            {row.map((cell, index) => <span key={cell + index}>{index === 0 ? <strong>{cell}</strong> : cell}</span>)}
          </button>
        ))}
      </section>
    </div>
  );
}

function MessageCenter() {
  return (
    <div className="page-stack">
      <SectionHeading eyebrow="通知记录" title="消息中心" />
      <div className="filter-tabs">
        <button className="active" type="button">全部</button>
        <button type="button">预约变化</button>
        <button type="button">排班汇总</button>
        <button type="button">审批结果</button>
      </div>
      <div className="message-list">
        <button className="message-item unread" type="button">
          <span className="message-symbol">20</span>
          <span><strong>明日排班已生成</strong><small>7月21日 09:30—10:00 · 柔柔 · 松江场地</small></span>
          <time>20:00</time>
        </button>
        <button className="message-item" type="button">
          <span className="message-symbol">✓</span>
          <span><strong>预约成功</strong><small>你的化妆预约已确认，开始前一小时会再次提醒。</small></span>
          <time>14:26</time>
        </button>
        <button className="message-item" type="button">
          <span className="message-symbol">固</span>
          <span><strong>固定申请已通过</strong><small>每周二、四 09:30—10:00，自7月21日起生效。</small></span>
          <time>昨天</time>
        </button>
      </div>
    </div>
  );
}

function ProfilePanel({ rows }: { rows: string[][] }) {
  return (
    <div className="page-stack">
      <SectionHeading eyebrow="账号资料" title="我的资料" />
      <section className="panel profile-card">
        <div className="profile-hero">
          <span className="avatar profile-avatar">{rows[0][1].slice(0, 1)}</span>
          <div><strong>{rows[0][1]}</strong><small>资料由系统人员主档维护</small></div>
          <StatusPill tone="success">账号正常</StatusPill>
        </div>
        {rows.map(([label, value]) => (
          <div className="profile-row" key={label}><span>{label}</span><strong>{value}</strong></div>
        ))}
      </section>
    </div>
  );
}

function Modal({
  children,
  title,
  subtitle,
  onClose,
  wide = false,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-label={title}
        aria-modal="true"
        className={wide ? "modal wide" : "modal"}
        role="dialog"
      >
        <header className="modal-header">
          <div><h2>{title}</h2>{subtitle ? <p>{subtitle}</p> : null}</div>
          <button aria-label="关闭" className="close-button" onClick={onClose} type="button">×</button>
        </header>
        {children}
      </section>
    </div>
  );
}

function BookingModal({
  existing,
  mode,
  onClose,
  onSubmit,
}: {
  existing: Appointment[];
  mode: BookingMode;
  onClose: () => void;
  onSubmit: (appointment: Appointment) => void;
}) {
  const [step, setStep] = useState(1);
  const [date, setDate] = useState("7月21日");
  const [duration, setDuration] = useState(30);
  const [artist, setArtist] = useState("江江");
  const [time, setTime] = useState("10:30");
  const [confirmedSecond, setConfirmedSecond] = useState(false);
  const isSecond = mode !== "reschedule" && existing.length === 1;
  const totalSteps = isSecond ? 4 : 3;

  const endTime = useMemo(() => {
    const [hour, minute] = time.split(":").map(Number);
    const total = hour * 60 + minute + duration;
    return String(Math.floor(total / 60)).padStart(2, "0") + ":" + String(total % 60).padStart(2, "0");
  }, [time, duration]);

  function submit() {
    const sequence: 1 | 2 = isSecond ? 2 : mode === "reschedule" ? 1 : 1;
    onSubmit({
      id: "AP202607210" + String(Math.floor(Math.random() * 900) + 100),
      date,
      weekday: date === "7月21日" ? "周二" : "周三",
      time: time + "—" + endTime,
      artist,
      site: "松江",
      duration,
      source: "单次预约",
      sequence,
    });
  }

  return (
    <Modal
      onClose={onClose}
      subtitle={
        mode === "service"
          ? "客服代录 · 松江场地"
          : mode === "reschedule"
            ? "选择新档期，成功前原预约保持不变"
            : "小雨 · ZB01842 · 松江"
      }
      title={mode === "reschedule" ? "改期" : mode === "service" ? "代录预约" : "预约化妆"}
      wide
    >
      <div className="stepper">
        {Array.from({ length: totalSteps }, (_, index) => (
          <span className={step >= index + 1 ? "active" : ""} key={index}>
            <i>{index + 1}</i>
            {["日期与时长", "化妆师与时间", "确认信息", "第二次确认"][index]}
          </span>
        ))}
      </div>

      <div className="modal-body booking-body">
        {mode === "service" && step === 1 ? (
          <div className="selected-host-line">
            <span className="avatar">小</span>
            <span><small>代录主播</small><strong>小雨 · ZB01842 · 松江</strong></span>
            <button className="text-button" type="button">重新选择</button>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="form-section">
            <h3>选择预约日期</h3>
            <p className="field-help">今天只能查看，可以预约明日起未来七日。</p>
            <div className="choice-grid dates">
              {[
                ["7月21日", "周二"],
                ["7月22日", "周三"],
                ["7月23日", "周四"],
                ["7月24日", "周五"],
                ["7月25日", "周六"],
                ["7月26日", "周日"],
                ["7月27日", "周一"],
              ].map(([value, day]) => (
                <button className={date === value ? "selected" : ""} key={value} onClick={() => setDate(value)} type="button">
                  <span>{day}</span><strong>{value.replace("月", "/").replace("日", "")}</strong>
                </button>
              ))}
            </div>
            <h3>预计化妆时长</h3>
            <div className="duration-choices">
              {[15, 30, 45, 60].map((value) => (
                <button className={duration === value ? "selected" : ""} key={value} onClick={() => setDuration(value)} type="button">
                  <strong>{value}</strong><span>分钟</span>{value === 30 ? <small>常用</small> : null}
                </button>
              ))}
            </div>
            <div className="field-tip">预计需要约40分钟的妆容，请选择45分钟。</div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="booking-selection">
            <div className="artist-selection">
              <h3>选择化妆师</h3>
              {artists.map((item) => (
                <button className={artist === item.name ? "artist-choice selected" : "artist-choice"} key={item.name} onClick={() => setArtist(item.name)} type="button">
                  <span className="avatar">{item.name.slice(0, 1)}</span>
                  <span><strong>{item.name}</strong><small>{item.badge}</small></span>
                  <span><small>最早可约</small><strong>{item.next}</strong></span>
                </button>
              ))}
            </div>
            <div className="time-selection">
              <h3>选择开始时间</h3>
              <div className="selection-summary">{date} · {duration}分钟 · {artist}</div>
              <div className="slot-group"><span>上午</span><div>
                {timeSlots.slice(0, 4).map((slot) => (
                  <button className={time === slot ? "selected" : ""} key={slot} onClick={() => setTime(slot)} type="button">{slot}</button>
                ))}
              </div></div>
              <div className="slot-group"><span>下午</span><div>
                {timeSlots.slice(4).map((slot) => (
                  <button className={time === slot ? "selected" : ""} key={slot} onClick={() => setTime(slot)} type="button">{slot}</button>
                ))}
              </div></div>
              <p className="field-help">只显示能够完整容纳{duration}分钟的时间。</p>
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="confirmation">
            {mode === "reschedule" ? (
              <div className="change-comparison">
                <div className="old"><small>原预约</small><strong>7月21日 09:30—10:00</strong><span>柔柔 · 固定预约</span></div>
                <span className="change-arrow">→</span>
                <div className="new"><small>新预约</small><strong>{date} {time}—{endTime}</strong><span>{artist} · 单次预约</span></div>
              </div>
            ) : (
              <div className="confirmation-mark">✓</div>
            )}
            <h3>{mode === "reschedule" ? "确认新的预约时间" : "请核对预约信息"}</h3>
            <div className="confirmation-card">
              <div><span>主播</span><strong>小雨 · ZB01842</strong></div>
              <div><span>日期</span><strong>{date} · {date === "7月21日" ? "周二" : "周三"}</strong></div>
              <div><span>时间</span><strong>{time}—{endTime} · {duration}分钟</strong></div>
              <div><span>实际预约化妆师</span><strong>{artist} · 松江场地</strong></div>
            </div>
            <div className="notice-bar subtle">
              <span className="notice-icon">i</span>
              <div><strong>提交时会再次检查档期</strong><span>多人选择同一时间时，以数据库成功提交顺序先到先得。</span></div>
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="second-confirmation">
            <div className="warning-mark">2</div>
            <h3>这是当天第2次化妆预约</h3>
            <p>请确认两次化妆均有需要。第二次预约无需审批，确认后直接创建。</p>
            <div className="two-bookings">
              <div><small>已有第1次</small><strong>09:30—10:00</strong><span>柔柔 · 松江</span></div>
              <div><small>本次第2次</small><strong>{time}—{endTime}</strong><span>{artist} · 松江</span></div>
            </div>
            <label className="check-confirm">
              <input checked={confirmedSecond} onChange={(event) => setConfirmedSecond(event.target.checked)} type="checkbox" />
              <span>我已核对，两次预约均有需要</span>
            </label>
          </div>
        ) : null}
      </div>

      <footer className="modal-footer">
        <button className="button ghost" onClick={step === 1 ? onClose : () => setStep(step - 1)} type="button">
          {step === 1 ? "取消" : "上一步"}
        </button>
        {step < totalSteps ? (
          <button className="button primary" onClick={() => setStep(step + 1)} type="button">下一步</button>
        ) : (
          <button className="button primary" disabled={isSecond && !confirmedSecond} onClick={submit} type="button">
            {isSecond ? "确认创建第2次预约" : mode === "reschedule" ? "确认改期" : "确认预约"}
          </button>
        )}
      </footer>
    </Modal>
  );
}

function AppointmentModal({
  appointment,
  onClose,
  onCancel,
  onReschedule,
}: {
  appointment: Appointment;
  onClose: () => void;
  onCancel: () => void;
  onReschedule: () => void;
}) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  return (
    <Modal onClose={onClose} subtitle={appointment.id} title="预约详情">
      <div className="modal-body">
        <div className="detail-hero">
          <div><StatusPill tone="success">已预约</StatusPill><StatusPill tone="accent">{appointment.source}</StatusPill></div>
          <strong>{appointment.date} {appointment.weekday}</strong>
          <span>{appointment.time}</span>
        </div>
        <div className="detail-list">
          <div><span>主播</span><strong>小雨 · ZB01842</strong></div>
          <div><span>实际预约化妆师</span><strong>{appointment.artist}</strong></div>
          <div><span>场地</span><strong>{appointment.site}</strong></div>
          <div><span>预计时长</span><strong>{appointment.duration}分钟</strong></div>
        </div>
        {confirmCancel ? (
          <div className="danger-confirm">
            <strong>确认取消这次预约？</strong>
            <p>{appointment.source === "固定预约" ? "只取消这一天，不会取消长期固定关系。" : "取消后会立即释放化妆师档期。"}</p>
            <div><button className="button ghost" onClick={() => setConfirmCancel(false)} type="button">返回</button><button className="button danger" onClick={onCancel} type="button">确认取消</button></div>
          </div>
        ) : null}
      </div>
      {!confirmCancel ? (
        <footer className="modal-footer split">
          <button className="button danger-ghost" onClick={() => setConfirmCancel(true)} type="button">取消预约</button>
          <button className="button primary" onClick={onReschedule} type="button">改期</button>
        </footer>
      ) : null}
    </Modal>
  );
}

function FixedModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [step, setStep] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState("09:30");
  const [weekdays, setWeekdays] = useState(["周二", "周四"]);
  const [startDate, setStartDate] = useState("2026-07-28");

  function toggleWeekday(day: string) {
    setWeekdays((current) =>
      current.includes(day) ? current.filter((item) => item !== day) : current.concat(day),
    );
  }

  return (
    <Modal onClose={onClose} subtitle="仅主播当前运营可以发起" title="申请长期固定" wide>
      <div className="stepper three">
        {["选择规则", "查看可用性", "确认提交"].map((label, index) => (
          <span className={step >= index + 1 ? "active" : ""} key={label}><i>{index + 1}</i>{label}</span>
        ))}
      </div>
      <div className="modal-body fixed-body">
        {step === 1 ? (
          <div className="form-section">
            <div className="selected-host-line">
              <span className="avatar">小</span>
              <span><small>固定主播</small><strong>小雨 · ZB01842 · 松江</strong></span>
              <StatusPill tone="success">运营关系有效</StatusPill>
            </div>
            <div className="form-grid">
              <label><span>固定化妆师</span><select defaultValue="柔柔"><option>柔柔 · 松江</option><option>江江 · 松江</option></select></label>
              <label><span>固定方式</span><select defaultValue="指定星期"><option>指定星期</option><option>每个工作日</option></select></label>
            </div>
            <h3>选择星期</h3>
            <div className="weekday-choices">
              {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => (
                <button className={weekdays.includes(day) ? "selected" : ""} key={day} onClick={() => toggleWeekday(day)} type="button">{day}</button>
              ))}
            </div>
            <div className="form-grid">
              <label><span>时长</span><select defaultValue="30分钟"><option>15分钟</option><option>30分钟</option><option>45分钟</option><option>60分钟</option></select></label>
              <label><span>期望开始日期</span><input defaultValue="2026-07-25" type="date" /></label>
            </div>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="availability-section">
            <div className="availability-heading">
              <div><h3>柔柔的长期可用时间</h3><p>周二、周四 · 30分钟</p></div>
              <div className="mini-legend"><span><i className="red" />固定占用</span><span><i className="orange" />未来单次</span><span><i className="green" />可以申请</span></div>
            </div>
            <div className="availability-grid">
              {[
                ["08:00", "blocked", "已有固定"],
                ["08:30", "blocked", "待审核占用"],
                ["09:00", "future", "7月25日有单次"],
                ["09:30", "future", "7月27日有单次"],
                ["10:00", "available", "可直接申请"],
                ["10:30", "available", "可直接申请"],
                ["11:00", "blocked", "已有固定"],
                ["13:00", "available", "可直接申请"],
                ["13:30", "available", "可直接申请"],
                ["14:00", "future", "7月23日有单次"],
                ["14:30", "available", "可直接申请"],
                ["15:00", "available", "可直接申请"],
              ].map(([time, state, detail]) => (
                <button
                  className={state + (selectedSlot === time ? " selected" : "")}
                  disabled={state === "blocked"}
                  key={time}
                  onClick={() => {
                    setSelectedSlot(time);
                    setStartDate(state === "future" ? "2026-07-28" : "2026-07-25");
                  }}
                  type="button"
                >
                  <strong>{time}</strong><span>{detail}</span>
                </button>
              ))}
            </div>
            <div className="recommendation">
              <span>系统建议</span>
              <div><strong>{selectedSlot} 可从 {startDate.replaceAll("-", ".")} 起连续固定</strong><p>已避开该时间未来最后一条单次预约。</p></div>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="confirmation">
            <div className="confirmation-mark">固</div>
            <h3>确认固定申请</h3>
            <div className="confirmation-card">
              <div><span>主播</span><strong>小雨 · ZB01842</strong></div>
              <div><span>固定化妆师</span><strong>柔柔 · 松江</strong></div>
              <div><span>固定星期</span><strong>{weekdays.join("、")}</strong></div>
              <div><span>固定时间</span><strong>{selectedSlot} · 30分钟</strong></div>
              <div><span>开始日期</span><strong>{startDate}</strong></div>
            </div>
            <div className="notice-bar subtle"><span className="notice-icon">i</span><div><strong>提交后进入客服审核</strong><span>待审核期间会占用长期档期；驳回或撤回后释放。</span></div></div>
          </div>
        ) : null}
      </div>
      <footer className="modal-footer">
        <button className="button ghost" onClick={step === 1 ? onClose : () => setStep(step - 1)} type="button">{step === 1 ? "取消" : "上一步"}</button>
        {step < 3 ? <button className="button primary" onClick={() => setStep(step + 1)} type="button">下一步</button> : <button className="button primary" onClick={onSubmit} type="button">提交固定申请</button>}
      </footer>
    </Modal>
  );
}

function ShiftModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [days, setDays] = useState(["周一", "周二", "周三", "周四", "周五"]);
  function toggleDay(day: string) {
    setDays((current) => current.includes(day) ? current.filter((item) => item !== day) : current.concat(day));
  }
  return (
    <Modal onClose={onClose} subtitle="首次设置无需审核，后续修改需客服审核" title="设置固定班次">
      <div className="modal-body form-section">
        <h3>每周工作日</h3>
        <div className="weekday-choices">
          {["周一", "周二", "周三", "周四", "周五", "周六", "周日"].map((day) => (
            <button className={days.includes(day) ? "selected" : ""} key={day} onClick={() => toggleDay(day)} type="button">{day}</button>
          ))}
        </div>
        <h3>固定工作时间</h3>
        <div className="form-grid shift-grid">
          <label><span>上班时间</span><input defaultValue="08:00" step="900" type="time" /></label>
          <label><span>午休开始</span><input defaultValue="12:00" step="900" type="time" /></label>
          <label><span>午休结束</span><input defaultValue="13:00" step="900" type="time" /></label>
          <label><span>下班时间</span><input defaultValue="18:00" step="900" type="time" /></label>
        </div>
        <div className="shift-preview">
          <span>一周班次预览</span>
          <strong>{days.join("、")}</strong>
          <p>08:00—12:00 · 13:00—18:00</p>
        </div>
      </div>
      <footer className="modal-footer"><button className="button ghost" onClick={onClose} type="button">取消</button><button className="button primary" disabled={!days.length} onClick={onSubmit} type="button">保存班次</button></footer>
    </Modal>
  );
}

function LeaveModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <Modal onClose={onClose} subtitle="无需审批，确认后立即生效" title="化妆师请假">
      <div className="modal-body form-section">
        <div className="form-grid">
          <label><span>开始日期</span><input defaultValue="2026-07-23" type="date" /></label>
          <label><span>结束日期</span><input defaultValue="2026-07-24" type="date" /></label>
        </div>
        <label><span>请假说明（选填）</span><textarea defaultValue="个人安排" rows={3} /></label>
        <div className="impact-panel">
          <div className="impact-heading"><span className="warning-mark small-warning">!</span><div><strong>请假将影响 5 条预约</strong><p>确认后会立即取消并释放档期。</p></div></div>
          <div className="impact-stats"><div><span>固定预约</span><strong>3</strong></div><div><span>单次预约</span><strong>2</strong></div><div><span>受影响主播</span><strong>5</strong></div></div>
          <ul><li>所有主播和当前运营会收到重新预约通知</li><li>长期固定关系会保留，请假结束后继续生成</li><li>取消请假也不会自动恢复已取消预约</li></ul>
        </div>
        <label className="check-confirm"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>我已了解以上预约会被取消</span></label>
      </div>
      <footer className="modal-footer"><button className="button ghost" onClick={onClose} type="button">返回</button><button className="button danger" disabled={!confirmed} onClick={onSubmit} type="button">确认请假并取消预约</button></footer>
    </Modal>
  );
}

function ApprovalModal({
  onClose,
  onDecision,
}: {
  onClose: () => void;
  onDecision: (decision: "approved" | "rejected") => void;
}) {
  const [note, setNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  return (
    <Modal onClose={onClose} subtitle="固定新建 · 松江场地" title="审批详情" wide>
      <div className="modal-body approval-detail">
        <div className="approval-summary">
          <div className="approval-person"><span className="avatar">小</span><span><small>申请主播</small><strong>小雨 · ZB01842</strong><em>当前运营：周舟</em></span></div>
          <StatusPill tone="warning">待审核</StatusPill>
        </div>
        <div className="confirmation-card horizontal">
          <div><span>固定化妆师</span><strong>柔柔</strong></div>
          <div><span>固定星期</span><strong>周二、周四</strong></div>
          <div><span>固定时间</span><strong>09:30—10:00</strong></div>
          <div><span>开始日期</span><strong>2026-07-28</strong></div>
        </div>
        <div className="approval-checks">
          <div><span className="check-icon">✓</span><span><strong>场地一致</strong><small>主播与化妆师均为松江</small></span></div>
          <div><span className="check-icon">✓</span><span><strong>长期格未冲突</strong><small>待审核期间已完成占位</small></span></div>
          <div><span className="check-icon">✓</span><span><strong>开始日期有效</strong><small>已避开7月27日最后一条单次预约</small></span></div>
        </div>
        <div className="effect-preview">
          <strong>通过后的影响</strong>
          <span>将创建长期固定关系，并生成未来滚动窗口内 4 条固定预约。</span>
        </div>
        {showReject ? <label><span>驳回意见（必填）</span><textarea autoFocus onChange={(event) => setNote(event.target.value)} placeholder="请说明驳回原因" rows={3} value={note} /></label> : null}
      </div>
      <footer className="modal-footer split">
        {showReject ? (
          <><button className="button ghost" onClick={() => setShowReject(false)} type="button">返回</button><button className="button danger" disabled={!note.trim()} onClick={() => onDecision("rejected")} type="button">确认驳回</button></>
        ) : (
          <><button className="button danger-ghost" onClick={() => setShowReject(true)} type="button">驳回</button><button className="button primary" onClick={() => onDecision("approved")} type="button">通过并生成预约</button></>
        )}
      </footer>
    </Modal>
  );
}

export default function PrototypeApp() {
  return <AppShell />;
}
