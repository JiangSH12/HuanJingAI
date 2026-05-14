/**
 * Auth store - manages login state in localStorage
 *
 * Stores full user profile including role, membership, and credits.
 * In demo mode (Supabase not configured), role is inferred from email.
 * In production, role comes from the profiles table.
 */

import React, { useCallback, useRef } from 'react';

export interface AuthUser {
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  role: 'guest' | 'user' | 'vip' | 'admin' | 'enterprise_admin' | 'enterprise_member';
  membershipTier: 'free' | 'basic' | 'pro' | 'enterprise';
  creditsBalance: number;
  dailyQuotaUsed: number;
  dailyQuotaLimit: number;
  phone: string | null;
  createdAt: string | null;
}

export interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  isLoggedIn: boolean;
}

const STORAGE_KEY = 'miaojing_auth';
const EVENT_KEY = 'miaojing_auth_updated';

function getStoredAuth(): AuthState {
  if (typeof window === 'undefined') {
    return { user: null, accessToken: null, isLoggedIn: false };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { user: null, accessToken: null, isLoggedIn: false };
    const parsed = JSON.parse(raw) as AuthState;
    return parsed;
  } catch {
    return { user: null, accessToken: null, isLoggedIn: false };
  }
}

function setStoredAuth(state: AuthState): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: state }));
}

function clearStoredAuth(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: { user: null, accessToken: null, isLoggedIn: false } }));
}

/**
 * Parse API user data into AuthUser format.
 * The API returns snake_case fields, we convert to camelCase.
 */
export function parseApiUser(apiUser: Record<string, unknown>): AuthUser {
  return {
    id: (apiUser.id as string) || 'demo-user-id',
    email: (apiUser.email as string) || '',
    nickname: (apiUser.nickname as string) || ((apiUser.email as string) || '').split('@')[0],
    avatarUrl: (apiUser.avatar_url as string | null) ?? null,
    role: (apiUser.role as AuthUser['role']) || 'user',
    membershipTier: (apiUser.membership_tier as AuthUser['membershipTier']) || 'free',
    creditsBalance: (apiUser.credits_balance as number) ?? 0,
    dailyQuotaUsed: (apiUser.daily_quota_used as number) ?? 0,
    dailyQuotaLimit: (apiUser.daily_quota_limit as number) ?? 5,
    phone: (apiUser.phone as string | null) ?? null,
    createdAt: (apiUser.created_at as string | null) ?? null,
  };
}

/**
 * React hook for auth state with cross-tab sync
 */
export function useAuth() {
  const [authState, setAuthState] = React.useState<AuthState>(getStoredAuth);

  // Keep a ref to the latest user ID so refreshProfile doesn't depend on authState
  const userIdRef = useRef<string | null>(null);
  React.useEffect(() => {
    userIdRef.current = authState.user?.id ?? null;
  }, [authState.user?.id]);

  React.useEffect(() => {
    const handleCustomEvent = (e: Event) => {
      const detail = (e as CustomEvent<AuthState>).detail;
      setAuthState(detail);
    };

    const handleStorageEvent = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setAuthState(getStoredAuth());
      }
    };

    window.addEventListener(EVENT_KEY, handleCustomEvent);
    window.addEventListener('storage', handleStorageEvent);

    return () => {
      window.removeEventListener(EVENT_KEY, handleCustomEvent);
      window.removeEventListener('storage', handleStorageEvent);
    };
  }, []);

  const login = (user: AuthUser, accessToken: string) => {
    const state: AuthState = { user, accessToken, isLoggedIn: true };
    setStoredAuth(state);
    setAuthState(state);
  };

  const logout = () => {
    clearStoredAuth();
    setAuthState({ user: null, accessToken: null, isLoggedIn: false });
  };

  const updateProfile = (updates: Partial<AuthUser>) => {
    if (!authState.user) return;
    const updatedUser = { ...authState.user, ...updates };
    const state: AuthState = { ...authState, user: updatedUser };
    setStoredAuth(state);
    setAuthState(state);
  };

  const isAdmin = authState.user?.role === 'admin' || authState.user?.role === 'enterprise_admin';
  const isVip = authState.user?.role === 'vip' || authState.user?.membershipTier === 'pro' || authState.user?.membershipTier === 'enterprise';

  /**
   * Refresh user profile from server (e.g. after admin changes membership/credits).
   * Fetches the latest profile from /api/profile and updates the auth store.
   * Uses a ref for user ID to avoid dependency on authState (prevents infinite loops).
   */
  const refreshProfile = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId) return;
    try {
      const res = await fetch(`/api/profile?userId=${userId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.profile) {
          const updatedUser = parseApiUser({
            id: userId,
            email: data.profile.email,
            ...data.profile,
          });
          // Read current state and merge
          const currentState = getStoredAuth();
          const state: AuthState = { ...currentState, user: updatedUser };
          setStoredAuth(state);
          setAuthState(state);
        }
      }
    } catch { /* non-critical */ }
  }, []);

  return {
    ...authState,
    login,
    logout,
    updateProfile,
    refreshProfile,
    isAdmin,
    isVip,
  };
}
