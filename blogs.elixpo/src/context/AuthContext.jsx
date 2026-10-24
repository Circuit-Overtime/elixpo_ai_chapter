'use client';

import { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser();
  }, []);

  async function fetchUser() {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      }
    } catch {
      // Not authenticated
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    // Clear all localStorage except user preferences (theme, etc.)
    const preserve = ['lixblogs_theme'];
    const preserved = {};
    preserve.forEach(key => {
      const val = localStorage.getItem(key);
      if (val !== null) preserved[key] = val;
    });
    localStorage.clear();
    Object.entries(preserved).forEach(([key, val]) => localStorage.setItem(key, val));
    setUser(null);
    window.location.href = '/';
  }

  return (
    <AuthContext.Provider value={{ user, loading, logout, refetchUser: fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
