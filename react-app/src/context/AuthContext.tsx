import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import api, { User, setupLogoutHandler } from '../services/api';

export type { User };

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  /** Call after a successful POST /auth/login. The JWTs are already set as
   *  httpOnly cookies by the server, so no token values are passed here. */
  login: () => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const response = await api.get('/user/profile');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  }, []);

  const verifyToken = useCallback(async () => {
    try {
      const response = await api.get('/auth/verify');
      if (response.data) {
        setIsAuthenticated(true);
        await fetchUser();
      }
    } catch {
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }, [fetchUser]);

  useEffect(() => {
    // Register the logout function to be called on 401 responses
    setupLogoutHandler(logout);

    // Always attempt verification on mount. Auth may now come from the
    // httpOnly access_token cookie (which JS cannot read), so we can't gate
    // verification on localStorage being populated — that would make a fresh
    // tab look "logged out" even when the cookie is still valid.
    verifyToken();
  }, [verifyToken]);

  const login = async () => {
    // Cookies were already set by the server's login response; just reflect the
    // authenticated state and load the profile.
    setIsAuthenticated(true);
    await fetchUser();
  };

  const logout = () => {
    // Best-effort: tell the server to blacklist the access/refresh tokens and
    // expire the cookies. Don't await — local state should clear regardless.
    api.post('/auth/logout').catch(() => {/* server may already be unreachable */});
    setIsAuthenticated(false);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
