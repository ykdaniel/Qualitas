import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api, { User } from '../services/api';
export type { User };

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      verifyToken(token);
    }
  }, []);

  const verifyToken = async (token: string) => {
    try {
      const response = await api.get('/auth/verify');
      if (response.data) {
        setIsAuthenticated(true);
        await fetchUser();
      }
    } catch (error) {
      localStorage.removeItem('token');
      setIsAuthenticated(false);
    }
  };

  const fetchUser = async () => {
    try {
      const response = await api.get('/user/profile');
      setUser(response.data);
    } catch (error) {
      console.error('Failed to fetch user:', error);
    }
  };

  const login = async (accessToken: string, refreshToken: string) => {
    localStorage.setItem('token', accessToken);
    if (refreshToken) {
      localStorage.setItem('refreshToken', refreshToken);
    }
    setIsAuthenticated(true);
    await fetchUser();
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    setIsAuthenticated(false);
    setUser(null);
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
