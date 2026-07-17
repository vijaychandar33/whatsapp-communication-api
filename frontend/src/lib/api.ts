import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import {
  clearAuth,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './auth';

// Empty string = same-origin (Docker/nginx proxy). Unset = local API default.
const baseURL =
  import.meta.env.VITE_API_URL === undefined
    ? 'http://localhost:3000'
    : import.meta.env.VITE_API_URL;

export type ApiMeta = {
  requestId?: string;
  correlationId?: string;
  timestamp?: string;
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
};

export type ApiEnvelope<T> = {
  success?: boolean;
  message?: string;
  data: T;
  meta?: ApiMeta;
  errors?: Array<{ code?: string; message: string; field?: string }> | null;
};

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    // Let the browser set multipart boundary
    delete config.headers['Content-Type'];
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return null;

  try {
    const { data } = await axios.post<
      ApiEnvelope<{ accessToken: string; refreshToken: string }>
    >(`${baseURL}/admin/v1/auth/refresh`, { refreshToken });

    const access = data.data.accessToken;
    const refresh = data.data.refreshToken;
    setTokens(access, refresh);
    return access;
  } catch {
    clearAuth();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh')
    ) {
      original._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }

      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }

      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  },
);

export function getErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string; errors?: Array<{ message: string }> }
      | undefined;
    if (data?.errors?.[0]?.message) return data.errors[0].message;
    if (data?.message) return data.message;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
