import React, { createContext, useContext, useState, ReactNode } from 'react';

interface DashboardFilterContextType {
  selectedVendor: string;
  setSelectedVendor: (vendor: string) => void;
}

const DashboardFilterContext = createContext<DashboardFilterContextType | undefined>(undefined);

export const DashboardFilterProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [selectedVendor, setSelectedVendor] = useState<string>('all');

  return (
    <DashboardFilterContext.Provider value={{ selectedVendor, setSelectedVendor }}>
      {children}
    </DashboardFilterContext.Provider>
  );
};

export const useDashboardFilter = () => {
  const context = useContext(DashboardFilterContext);
  if (context === undefined) {
    throw new Error('useDashboardFilter must be used within a DashboardFilterProvider');
  }
  return context;
};
