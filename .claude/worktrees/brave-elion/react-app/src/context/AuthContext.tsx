import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api, { User } from '../services/api';
export type { User };

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  // SECURITY: On mount, verify if session is valid via httpOnly cookie
  useEffect(() => {
    verifySession();
  }, []);

  const verifySession = async () => {
    try {
      // Token is automatically sent via httpOnly cookie
      const response = await api.get('/auth/verify');
      if (response.data && response.data.ok) {
        setIsAuthenticated(true);
        await fetchUser();
      }
    } catch (error) {
      // Session invalid or expired
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const fetchUser = async () => {
    try {
      // Token is automatically sent via httpOnly cookie
      const response = await api.get('/user/profile');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  const login = async () => {
    // SECURITY: Token is stored in httpOnly cookie by backend
    // No need to handle tokens in frontend JavaScript
    // Just verify the session and fetch user data
    setIsAuthenticated(true);
    await fetchUser();
  };

  const logout = async () => {
    try {
      // Call backend logout endpoint to clear httpOnly cookie
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local state regardless of API call result
      setIsAuthenticated(false);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
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
