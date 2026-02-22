import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api, { User, setupLogoutHandler } from '../services/api';
import { useITPStore } from '../store/itpStore';
import { useNCRStore } from '../store/ncrStore';
import { useNOIStore } from '../store/noiStore';
import { useOBSStore } from '../store/obsStore';
import { useITRStore } from '../store/itrStore';
import { usePQPStore } from '../store/pqpStore';
import { useChecklistStore } from '../store/checklistStore';
import { useFollowUpStore } from '../store/followUpStore';
import { useAuditStore } from '../store/auditStore';
import { useFATStore } from '../store/fatStore';
import { useIAMStore } from '../store/iamStore';
import { useContractorsStore } from '../store/contractorsStore';
export type { User };

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Register the logout function to be called on 401 responses
    setupLogoutHandler(logout);

    const token = localStorage.getItem('token');
    if (token) {
      verifyToken(token);
    } else {
      setLoading(false);
    }
  }, []);

  const verifyToken = async (token: string) => {
    try {
      const response = await api.get('/auth/verify');
      if (response.data) {
        setIsAuthenticated(true);
        await Promise.all([
          fetchUser(),
          useITPStore.getState().fetchITPs(),
          useNCRStore.getState().fetchNCRs(),
          useNOIStore.getState().fetchNOIs(),
          useOBSStore.getState().fetchOBSs(),
          useITRStore.getState().fetchITRs(),
          usePQPStore.getState().fetchPQPs(),
          useChecklistStore.getState().fetchRecords(),
          useFollowUpStore.getState().fetchFollowUps(),
          useAuditStore.getState().fetchAudits(),
          useFATStore.getState().fetchFATs(),
          useIAMStore.getState().fetchData(),
          useContractorsStore.getState().fetchContractors()
        ]);
      }
    } catch (error) {
      localStorage.removeItem('token');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
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
    await Promise.all([
      fetchUser(),
      useITPStore.getState().fetchITPs(),
      useNCRStore.getState().fetchNCRs(),
      useNOIStore.getState().fetchNOIs(),
      useOBSStore.getState().fetchOBSs(),
      useITRStore.getState().fetchITRs(),
      usePQPStore.getState().fetchPQPs(),
      useChecklistStore.getState().fetchRecords(),
      useFollowUpStore.getState().fetchFollowUps(),
      useAuditStore.getState().fetchAudits(),
      useFATStore.getState().fetchFATs(),
      useIAMStore.getState().fetchData(),
      useContractorsStore.getState().fetchContractors()
    ]);
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
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
