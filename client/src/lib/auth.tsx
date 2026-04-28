import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { apiRequest, setAuthToken } from "./queryClient";

export type SessionUser = {
  id: number;
  username: string;
  name: string;
  role: "admin" | "physician" | "pa" | "viewer";
  providerId: number | null;
  feedToken: string;
};

type AuthCtx = {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(false);

  // On first boot, no token. Users must log in to access admin/provider features.
  useEffect(() => {}, []);

  const login = async (username: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      const body = await res.json();
      setAuthToken(body.token);
      setUser(body.user);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } catch {}
    setAuthToken(null);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}
