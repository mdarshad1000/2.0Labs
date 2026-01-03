import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { api, User, fetchFromApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: (allDevices?: boolean) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AUTH_STORAGE_KEY = 'auth_user';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Initialize from localStorage if in browser environment
    if (typeof window !== 'undefined') {
      const storedUser = localStorage.getItem(AUTH_STORAGE_KEY);
      return storedUser ? JSON.parse(storedUser) : null;
    }
    return null;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Sync user state with localStorage whenever it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  }, [user]);

  // Check if user is logged in on mount
  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      setLoading(true);
      const response = await api.getMe();
      if (response.success && response.user) {
        setUser(response.user);
      } else {
        // Auth check failed, clear the user
        setUser(null);
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      setError('Failed to check authentication status');
      // Also clear the user on error
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  // Refresh user data
  async function refreshUser() {
    await checkAuth();
  }

  // Start Google login flow
  const login = async () => {
    try {
      setLoading(true);
      const response = await api.getGoogleAuthUrl();
      if (response.auth_url) {
        // Store the current URL as the return location after login
        localStorage.setItem('returnTo', window.location.pathname);
        // Redirect to Google OAuth
        window.location.href = response.auth_url;
      }
    } catch (err) {
      console.error('Login failed:', err);
      setError('Failed to start login process');
    } finally {
      setLoading(false);
    }
  };

  // Logout user
  const logout = async (allDevices = false) => {
    try {
      setLoading(true);
      await api.logout(allDevices);
      setUser(null);
    } catch (err) {
      console.error('Logout failed:', err);
      setError('Failed to logout');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

