export interface SchedulerLogger {
  error(message: string): void;
  log(message: string): void;
  warn(message: string): void;
}

export interface BookingMaintenanceSchedulerOptions {
  readonly apiUrl: string;
  readonly intervalMs: number;
  readonly token: string;
}

type Fetcher = typeof fetch;

export class BookingMaintenanceScheduler {
  private completionRunning = false;
  private readonly completionEndpoint: string;
  private generationRunning = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly endpoint: string;

  constructor(
    options: BookingMaintenanceSchedulerOptions,
    private readonly logger: SchedulerLogger,
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 15_000) {
      throw new Error('BOOKING_MAINTENANCE_INTERVAL_MS must be at least 15000');
    }
    if (options.token.length < 32) throw new Error('INTERNAL_WORKER_TOKEN is not configured');
    const url = new URL(options.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('INTERNAL_API_URL is invalid');
    this.endpoint = new URL('/internal/jobs/fixed-generation', url).toString();
    this.completionEndpoint = new URL('/internal/jobs/appointment-completion', url).toString();
    this.intervalMs = options.intervalMs;
    this.token = options.token;
  }

  private readonly intervalMs: number;
  private readonly token: string;

  start(): void {
    if (this.timer) return;
    void this.runGenerationOnce();
    void this.runCompletionOnce();
    this.timer = setInterval(() => {
      void this.runGenerationOnce();
      void this.runCompletionOnce();
    }, this.intervalMs);
    this.logger.log(`预约后台维护已启动，间隔 ${this.intervalMs}ms`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runCompletionOnce(): Promise<boolean> {
    if (this.completionRunning) {
      this.logger.warn('上一轮预约自动完成仍在运行，本轮已跳过');
      return false;
    }
    this.completionRunning = true;
    try {
      const response = await this.request(this.completionEndpoint);
      if (!response.ok) throw new Error(`API responded with ${response.status}`);
      const result = (await response.json()) as { completed?: unknown };
      const completed = typeof result.completed === 'number' ? result.completed : 0;
      if (completed > 0) this.logger.log(`预约自动完成 ${completed} 条`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`预约自动完成失败：${message}`);
      return false;
    } finally {
      this.completionRunning = false;
    }
  }

  async runGenerationOnce(): Promise<boolean> {
    if (this.generationRunning) {
      this.logger.warn('上一轮固定预约生成仍在运行，本轮已跳过');
      return false;
    }
    this.generationRunning = true;
    try {
      const response = await this.request(this.endpoint);
      if (!response.ok) throw new Error(`API responded with ${response.status}`);
      const result = (await response.json()) as { generated?: unknown };
      const generated = typeof result.generated === 'number' ? result.generated : 0;
      this.logger.log(`固定预约生成完成，新增 ${generated} 条`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`固定预约生成失败：${message}`);
      return false;
    } finally {
      this.generationRunning = false;
    }
  }

  private request(endpoint: string): Promise<Response> {
    return this.fetcher(endpoint, {
      headers: { 'x-worker-token': this.token },
      method: 'POST',
      signal: AbortSignal.timeout(30_000),
    });
  }
}
