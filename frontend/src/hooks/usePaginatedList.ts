import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api, ApiEnvelope, ApiMeta, getErrorMessage } from '../lib/api';
import { useAuth } from './useAuth';

type Options = {
  queryKey: unknown[];
  path: string;
  page: number;
  limit?: number;
  params?: Record<string, string | number | undefined | null>;
  enabled?: boolean;
  /** When false, do not auto-inject organizationId from auth */
  scoped?: boolean;
};

export function usePaginatedList<T>(options: Options) {
  const { user } = useAuth();
  const {
    queryKey,
    path,
    page,
    limit = 20,
    params,
    enabled = true,
    scoped = true,
  } = options;

  const organizationId =
    (params?.organizationId as string | undefined) ||
    (scoped ? user?.organizationId : undefined) ||
    undefined;

  const mergedParams = {
    ...params,
    ...(organizationId ? { organizationId } : {}),
  };

  // Strip client-only search from API params (backend has no search query)
  const { search: _search, ...apiParams } = mergedParams as Record<
    string,
    string | number | undefined | null
  > & { search?: string };

  return useQuery({
    queryKey: [...queryKey, page, limit, mergedParams],
    enabled: enabled && (!scoped || Boolean(organizationId)),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data } = await api.get<ApiEnvelope<T[]>>(path, {
        params: {
          page,
          limit,
          ...apiParams,
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
            Math.max(
              1,
              Math.ceil((meta.total ?? items.length) / (meta.limit ?? limit)),
            ),
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
