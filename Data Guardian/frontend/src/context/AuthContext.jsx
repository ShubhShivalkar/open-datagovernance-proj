import { createContext, useContext, useState, useEffect } from "react";
import { authApi } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // undefined = still loading, null = not authenticated, object = authenticated user
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    authApi.me()
      .then(setUser)
      .catch(() => setUser(null));
  }, []);

  async function login(credentials) {
    const u = await authApi.login(credentials);
    setUser(u);
    return u;
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
