import Taro from '@tarojs/taro';

const API_BASE_URL = (process.env.TARO_APP_API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/+$/,
  '',
);

interface ApiErrorBody {
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
    readonly method?: 'GET' | 'POST';
    readonly token?: string;
  } = {},
): Promise<T> {
  const response = await Taro.request<T | ApiErrorBody>({
    data: options.body,
    header: {
      ...options.headers,
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    method: options.method ?? 'GET',
    url: `${API_BASE_URL}${path}`,
  });
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const error = response.data as ApiErrorBody;
    throw new ApiError(
      response.statusCode,
      error.error?.code ?? 'REQUEST_FAILED',
      error.error?.message ?? '请求失败，请稍后重试',
    );
  }
  return response.data as T;
}
