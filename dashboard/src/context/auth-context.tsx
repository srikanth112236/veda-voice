"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { api, UserProfile } from "@/lib/api";

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<UserProfile>;
  logout: () => void;
  setUser: (u: UserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({} as UserProfile),
  logout: () => {},
  setUser: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let active = true;
    api
      .getMe()
      .then((profile) => {
        if (active) setUser(profile);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const login = async (email: string, pass: string): Promise<UserProfile> => {
    const res = await api.login({ email, password: pass });
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Ignore network errors during logout
    }
    if (typeof window !== "undefined") {
      localStorage.removeItem("vedavoice_token");
      localStorage.removeItem("vedavoice_admin_token");
    }
    setUser(null);
    window.location.href = "/login";
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
