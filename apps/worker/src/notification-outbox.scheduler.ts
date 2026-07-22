import type { SchedulerLogger } from './fixed-generation.scheduler';

export interface NotificationOutboxSchedulerOptions {
  readonly apiUrl: string;
  readonly intervalMs: number;
  readonly token: string;
}

type Fetcher = typeof fetch;

export class NotificationOutboxScheduler {
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
    if (options.token.length < 32) throw new Error('INTERNAL_WORKER_TOKEN is not configured');
    const url = new URL(options.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('INTERNAL_API_URL is invalid');
    this.endpoint = new URL('/internal/jobs/notification-outbox', url).toString();
    this.intervalMs = options.intervalMs;
    this.token = options.token;
  }

  start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.logger.log(`通知事件调度已启动，间隔 ${this.intervalMs}ms`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
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
