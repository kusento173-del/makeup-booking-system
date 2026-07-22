export interface ApiErrorBody {
  readonly error?: { readonly code?: string; readonly message?: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  options: {
    readonly body?: unknown;
    readonly headers?: Readonly<Record<string, string>>;
    readonly method?: string;
    readonly token?: string;
  } = {},
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: {
      Accept: 'application/json',
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    method: options.method ?? 'GET',
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new ApiError(
      response.status,
      payload.error?.code ?? 'REQUEST_FAILED',
      payload.error?.message ?? '请求失败，请稍后重试',
    );
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
