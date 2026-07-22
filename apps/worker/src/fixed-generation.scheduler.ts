export interface SchedulerLogger {
  error(message: string): void;
  log(message: string): void;
  warn(message: string): void;
}

export interface FixedGenerationSchedulerOptions {
  readonly apiUrl: string;
  readonly intervalMs: number;
  readonly token: string;
}

type Fetcher = typeof fetch;

export class FixedGenerationScheduler {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly endpoint: string;

  constructor(
    options: FixedGenerationSchedulerOptions,
    private readonly logger: SchedulerLogger,
    private readonly fetcher: Fetcher = fetch,
  ) {
    if (!Number.isSafeInteger(options.intervalMs) || options.intervalMs < 15_000) {
      throw new Error('FIXED_GENERATION_INTERVAL_MS must be at least 15000');
    }
    if (options.token.length < 32) throw new Error('INTERNAL_WORKER_TOKEN is not configured');
    const url = new URL(options.apiUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('INTERNAL_API_URL is invalid');
    this.endpoint = new URL('/internal/jobs/fixed-generation', url).toString();
    this.intervalMs = options.intervalMs;
    this.token = options.token;
  }

  private readonly intervalMs: number;
  private readonly token: string;

  start(): void {
    if (this.timer) return;
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.logger.log(`固定预约生成调度已启动，间隔 ${this.intervalMs}ms`);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<boolean> {
    if (this.running) {
      this.logger.warn('上一轮固定预约生成仍在运行，本轮已跳过');
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
      const result = (await response.json()) as { generated?: unknown };
      const generated = typeof result.generated === 'number' ? result.generated : 0;
      this.logger.log(`固定预约生成完成，新增 ${generated} 条`);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`固定预约生成失败：${message}`);
      return false;
    } finally {
      this.running = false;
    }
  }
}
