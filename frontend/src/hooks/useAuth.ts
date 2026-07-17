import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, getErrorMessage } from '../lib/api';
import {
  AuthUser,
  clearAuth,
  getRefreshToken,
  getStoredUser,
  isAuthenticated,
  setAuthSession,
} from '../lib/auth';

type LoginPayload = { email: string; password: string };

type RegisterPayload = {
  email: string;
  password: string;
  organizationName: string;
  organizationSlug?: string;
  firstName?: string;
  lastName?: string;
};

type LoginResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
};

export function useAuth() {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(() => getStoredUser());

  useEffect(() => {
    setReady(true);
  }, []);

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: async () => {
      const { data } = await api.get<{ data: AuthUser }>('/admin/v1/auth/me');
      return data.data;
    },
    enabled: ready && isAuthenticated(),
    staleTime: 60_000,
    retry: false,
  });

  useEffect(() => {
    if (meQuery.data) {
      setUser(meQuery.data);
      localStorage.setItem('cp_user', JSON.stringify(meQuery.data));
    }
  }, [meQuery.data]);

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginPayload) => {
      const { data } = await api.post<{ data: LoginResponse }>(
        '/admin/v1/auth/login',
        payload,
      );
      return data.data;
    },
    onSuccess: (result) => {
      setAuthSession(result.accessToken, result.refreshToken, result.user);
      setUser(result.user);
      queryClient.setQueryData(['auth', 'me'], result.user);
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (payload: RegisterPayload) => {
      const { data } = await api.post<{ data: LoginResponse }>(
        '/admin/v1/auth/register',
        payload,
      );
      return data.data;
    },
    onSuccess: (result) => {
      setAuthSession(result.accessToken, result.refreshToken, result.user);
      setUser(result.user);
      queryClient.setQueryData(['auth', 'me'], result.user);
    },
  });

  const logout = useCallback(async () => {
    const refresh = getRefreshToken();
    try {
      if (refresh) {
        await api.post('/admin/v1/auth/logout', { refreshToken: refresh });
      }
    } catch {
      // ignore network errors on logout
    }
    clearAuth();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  return useMemo(
    () => ({
      ready,
      user,
      isAuthenticated: ready && isAuthenticated(),
      login: loginMutation.mutateAsync,
      loginLoading: loginMutation.isPending,
      loginError: loginMutation.error
        ? getErrorMessage(loginMutation.error, 'Login failed')
        : null,
      register: registerMutation.mutateAsync,
      registerLoading: registerMutation.isPending,
      registerError: registerMutation.error
        ? getErrorMessage(registerMutation.error, 'Registration failed')
        : null,
      logout,
      meLoading: meQuery.isLoading,
    }),
    [
      ready,
      user,
      loginMutation.mutateAsync,
      loginMutation.isPending,
      loginMutation.error,
      registerMutation.mutateAsync,
      registerMutation.isPending,
      registerMutation.error,
      logout,
      meQuery.isLoading,
    ],
  );
}
