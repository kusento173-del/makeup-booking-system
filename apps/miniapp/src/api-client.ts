import Taro from '@tarojs/taro';

declare const __API_BASE_URL__: string;

const API_BASE_URL = __API_BASE_URL__.replace(/\/+$/, '');

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
  const hasBody = options.body !== undefined;
  const response = await Taro.request<T | ApiErrorBody>({
    ...(hasBody ? { data: options.body } : {}),
    header: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
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
