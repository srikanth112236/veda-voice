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
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("vedavoice_token") : null;
      if (!token) {
        setLoading(false);
        return;
      }

      // 2-second hard timeout to guarantee loading never gets stuck
      const timer = setTimeout(() => {
        if (active) setLoading(false);
      }, 2000);

      api
        .getMe()
        .then((profile) => {
          if (active) setUser(profile);
        })
        .catch(() => {
          if (typeof window !== "undefined") {
            localStorage.removeItem("vedavoice_token");
          }
          if (active) setUser(null);
        })
        .finally(() => {
          clearTimeout(timer);
          if (active) setLoading(false);
        });
    } catch {
      setLoading(false);
    }

    return () => {
      active = false;
    };
  }, []);

  const login = async (email: string, pass: string): Promise<UserProfile> => {
    const res = await api.login({ email, password: pass });
    localStorage.setItem("vedavoice_token", res.access_token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem("vedavoice_token");
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
