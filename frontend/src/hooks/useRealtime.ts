import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { getAccessToken, isAuthenticated } from '../lib/auth';
import { useAuth } from './useAuth';

const EVENTS = [
  'message.received',
  'message.sent',
  'message.status_updated',
] as const;

function wsBaseUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL as string | undefined;
  if (apiUrl) {
    try {
      return new URL(apiUrl).origin;
    } catch {
      return window.location.origin;
    }
  }
  return window.location.origin;
}

/** Connects to Socket.IO `/ws` and invalidates messaging queries on events. */
export function useRealtime() {
  const { ready, isAuthenticated: authed } = useAuth();
  const queryClient = useQueryClient();
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!ready || !authed || !isAuthenticated()) {
      return;
    }

    const token = getAccessToken();
    if (!token) return;

    const socket = io(`${wsBaseUrl()}/ws`, {
      transports: ['websocket', 'polling'],
      auth: { token },
      query: { token },
      autoConnect: true,
    });
    socketRef.current = socket;

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['conversations'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    };

    for (const event of EVENTS) {
      socket.on(event, invalidate);
    }

    socket.on('connect_error', (err) => {
      console.warn('[ws] connect_error', err.message);
    });

    return () => {
      for (const event of EVENTS) {
        socket.off(event, invalidate);
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [ready, authed, queryClient]);
}
