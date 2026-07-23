import type { SchedulerLogger } from './booking-maintenance.scheduler';

export interface NotificationOutboxSchedulerOptions {
  readonly apiUrl: string;
  readonly deliveryIntervalMs: number;
  readonly intervalMs: number;
  readonly scheduleIntervalMs: number;
  readonly token: string;
}

type Fetcher = typeof fetch;

export class NotificationOutboxScheduler {
  private readonly deliveryEndpoint: string;
  private readonly deliveryIntervalMs: number;
  private deliveryRunning = false;
  private deliveryTimer: ReturnType<typeof setInterval> | null = null;
  private readonly endpoint: string;
  private readonly intervalMs: number;
  private readonly reminderEndpoint: string;
  private running = false;
  private scheduleRunning = false;
  private readonly scheduleIntervalMs: number;
  private scheduleTimer: ReturnType<typeof setInterval> | null = null;
  private readonly summaryEndpoint: string;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly token: string;

  constructor(
    options: NotificationOutboxSchedulerOptions,
    private readonly logger: SchedulerLogger,
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 1_000) {
      throw new Error('NOTIFICATION_OUTBOX_INTERVAL_MS must be at least 1000');
    }
    if (!Number.isSafeInteger(options.deliveryIntervalMs) || options.deliveryIntervalMs < 1_000) {
      throw new Error('NOTIFICATION_DELIVERY_INTERVAL_MS must be at least 1000');
    }
    if (!Number.isSafeInteger(options.scheduleIntervalMs) || options.scheduleIntervalMs < 10_000) {
      throw new Error('NOTIFICATION_SCHEDULE_INTERVAL_MS must be at least 10000');
    }
    if (options.token.length < 32) throw new Error('INTERNAL_WORKER_TOKEN is not configured');
    const url = new URL(options.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('INTERNAL_API_URL is invalid');
    this.endpoint = new URL('/internal/jobs/notification-outbox', url).toString();
    this.deliveryEndpoint = new URL('/internal/jobs/notification-delivery', url).toString();
    this.reminderEndpoint = new URL('/internal/jobs/notification-reminders', url).toString();
    this.summaryEndpoint = new URL('/internal/jobs/notification-daily-summaries', url).toString();
    this.deliveryIntervalMs = options.deliveryIntervalMs;
    this.intervalMs = options.intervalMs;
    this.scheduleIntervalMs = options.scheduleIntervalMs;
    this.token = options.token;
  }

  start(): void {
    if (this.timer) return;
    void this.runOnce();
    void this.runDeliveryOnce();
    void this.runScheduleOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.deliveryTimer = setInterval(() => void this.runDeliveryOnce(), this.deliveryIntervalMs);
    this.scheduleTimer = setInterval(() => void this.runScheduleOnce(), this.scheduleIntervalMs);
    this.logger.log(`通知事件调度已启动，间隔 ${this.intervalMs}ms`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.deliveryTimer) clearInterval(this.deliveryTimer);
    if (this.scheduleTimer) clearInterval(this.scheduleTimer);
    this.timer = null;
    this.deliveryTimer = null;
    this.scheduleTimer = null;
  }

  async runDeliveryOnce(): Promise<boolean> {
    if (this.deliveryRunning) {
      this.logger.warn('上一轮通知投递仍在运行，本轮已跳过');
      return false;
    }
    this.deliveryRunning = true;
    try {
      const response = await this.fetcher(this.deliveryEndpoint, {
        headers: { 'x-worker-token': this.token },
        method: 'POST',
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) throw new Error(`API responded with ${response.status}`);
      const result = (await response.json()) as {
        failedCount?: unknown;
        processedCount?: unknown;
        retryCount?: unknown;
        succeededCount?: unknown;
      };
      const processed = Number.isSafeInteger(result.processedCount)
        ? Number(result.processedCount)
        : 0;
      if (processed > 0) {
        const succeeded = Number.isSafeInteger(result.succeededCount)
          ? Number(result.succeededCount)
          : 0;
        const retry = Number.isSafeInteger(result.retryCount) ? Number(result.retryCount) : 0;
        const failed = Number.isSafeInteger(result.failedCount) ? Number(result.failedCount) : 0;
        this.logger.log(
          `通知已投递 ${processed} 项：成功 ${succeeded}，待重试 ${retry}，失败 ${failed}`,
        );
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`通知投递调度失败：${message}`);
      return false;
    } finally {
      this.deliveryRunning = false;
    }
  }

  async runOnce(): Promise<boolean> {
    if (this.running) {
      this.logger.warn('上一轮通知事件消费仍在运行，本轮已跳过');
      return false;
    }
    this.running = true;
    try {
      const response = await this.fetcher(this.endpoint, {
        headers: { 'x-worker-token': this.token },
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) throw new Error(`API responded with ${response.status}`);
      const result = (await response.json()) as {
        deferredEventCount?: unknown;
        processedEventCount?: unknown;
        taskCount?: unknown;
      };
      const processed = Number.isSafeInteger(result.processedEventCount)
        ? Number(result.processedEventCount)
        : 0;
      const tasks = Number.isSafeInteger(result.taskCount) ? Number(result.taskCount) : 0;
      const deferred = Number.isSafeInteger(result.deferredEventCount)
        ? Number(result.deferredEventCount)
        : 0;
      if (processed > 0) {
        this.logger.log(`通知事件已处理 ${processed} 条，生成 ${tasks} 项，延后 ${deferred} 条`);
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`通知事件调度失败：${message}`);
      return false;
    } finally {
      this.running = false;
    }
  }

  async runScheduleOnce(): Promise<boolean> {
    if (this.scheduleRunning) {
      this.logger.warn('上一轮通知计划仍在运行，本轮已跳过');
      return false;
    }
    this.scheduleRunning = true;
    try {
      const request = (endpoint: string) =>
        this.fetcher(endpoint, {
          headers: { 'x-worker-token': this.token },
          method: 'POST',
          signal: AbortSignal.timeout(120_000),
        });
      const reminderResponse = await request(this.reminderEndpoint);
      if (!reminderResponse.ok) {
        throw new Error(`Reminder API responded with ${reminderResponse.status}`);
      }
      const reminder = (await reminderResponse.json()) as {
        cancelledTaskCount?: unknown;
        createdTaskCount?: unknown;
      };
      const summaryResponse = await request(this.summaryEndpoint);
      if (!summaryResponse.ok) {
        throw new Error(`Summary API responded with ${summaryResponse.status}`);
      }
      const summary = (await summaryResponse.json()) as { createdTaskCount?: unknown };
      const reminderCreated = Number.isSafeInteger(reminder.createdTaskCount)
        ? Number(reminder.createdTaskCount)
        : 0;
      const reminderCancelled = Number.isSafeInteger(reminder.cancelledTaskCount)
        ? Number(reminder.cancelledTaskCount)
        : 0;
      const summaryCreated = Number.isSafeInteger(summary.createdTaskCount)
        ? Number(summary.createdTaskCount)
        : 0;
      if (reminderCreated > 0 || reminderCancelled > 0 || summaryCreated > 0) {
        this.logger.log(
          `通知计划已更新：提醒新增 ${reminderCreated}，提醒取消 ${reminderCancelled}，汇总新增 ${summaryCreated}`,
        );
      }
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`通知计划调度失败：${message}`);
      return false;
    } finally {
      this.scheduleRunning = false;
    }
  }
}
