import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, ApiEnvelope, ApiMeta, getErrorMessage } from '../lib/api';

type Options = {
  queryKey: unknown[];
  path: string;
  page: number;
  limit?: number;
  params?: Record<string, string | number | undefined | null>;
  enabled?: boolean;
};

export function usePaginatedList<T>(options: Options) {
  const { queryKey, path, page, limit = 20, params, enabled = true } = options;

  return useQuery({
    queryKey: [...queryKey, page, limit, params],
    enabled,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<T[]>>(path, {
        params: {
          page,
          limit,
          ...params,
        },
      });
      const items = Array.isArray(data.data) ? data.data : [];
      const meta: ApiMeta = data.meta || {};
      return {
        items,
        meta: {
          page: meta.page ?? page,
          limit: meta.limit ?? limit,
          total: meta.total ?? items.length,
          totalPages:
            meta.totalPages ??
            Math.max(1, Math.ceil((meta.total ?? items.length) / (meta.limit ?? limit))),
        },
        message: data.message,
      };
    },
    retry: false,
    meta: {
      errorMessage: 'Failed to load list',
    },
  });
}

export function listErrorMessage(error: unknown): string {
  return getErrorMessage(error, 'Failed to load data. The API may be unavailable.');
}
