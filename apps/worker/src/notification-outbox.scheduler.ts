import type { SchedulerLogger } from './fixed-generation.scheduler';

export interface NotificationOutboxSchedulerOptions {
  readonly apiUrl: string;
  readonly deliveryIntervalMs: number;
  readonly intervalMs: number;
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
  private running = false;
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
    if (options.token.length < 32) throw new Error('INTERNAL_WORKER_TOKEN is not configured');
    const url = new URL(options.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('INTERNAL_API_URL is invalid');
    this.endpoint = new URL('/internal/jobs/notification-outbox', url).toString();
    this.deliveryEndpoint = new URL('/internal/jobs/notification-delivery', url).toString();
    this.deliveryIntervalMs = options.deliveryIntervalMs;
    this.intervalMs = options.intervalMs;
    this.token = options.token;
  }

  start(): void {
    if (this.timer) return;
    void this.runOnce();
    void this.runDeliveryOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.deliveryTimer = setInterval(() => void this.runDeliveryOnce(), this.deliveryIntervalMs);
    this.logger.log(`通知事件调度已启动，间隔 ${this.intervalMs}ms`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.deliveryTimer) clearInterval(this.deliveryTimer);
    this.timer = null;
    this.deliveryTimer = null;
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
}
