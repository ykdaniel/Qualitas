import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import {
  getContractors,
  createContractor,
  updateContractor as updateContractorApi,
  deleteContractor as apiDeleteContractor,
  Contractor as ApiContractor,
  CreateContractorPayload
} from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';

// Keep the internal interface consistent with UI usage, or refactor UI to match API.
// Refactoring UI to match API (snake_case from backend) might be too much change.
// Let's map API response to internal CamelCase interface.

export interface Contractor {
  id: string; // Changed from number to string to match API (UUID)
  package: string;
  name: string;
  abbreviation: string; // Note: API might not have this field yet
  scope: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  status: 'active' | 'inactive'; // API Status is capitalized 'Active' | 'Inactive', need mapping
}

// Helper to map API data to internal format
// Now API and internal fields mostly match, just need to normalize status
const mapApiToInternal = (data: ApiContractor): Contractor => ({
  id: data.id,
  package: data.package || '',
  name: data.name,
  abbreviation: data.abbreviation || '',
  scope: data.scope || '',
  contactPerson: data.contactPerson || '',
  email: data.email,
  phone: data.phone,
  address: data.address,
  status: (data.status?.toLowerCase() === 'active' || data.status === 'active') ? 'active' : 'inactive',
});

// Helper to map internal data to API format
const mapInternalToApi = (data: Omit<Contractor, 'id'>): CreateContractorPayload => ({
  package: data.package,
  name: data.name,
  abbreviation: data.abbreviation,
  scope: data.scope,
  contactPerson: data.contactPerson,
  email: data.email,
  phone: data.phone,
  address: data.address,
  status: data.status === 'active' ? 'Active' : 'Inactive',
});

interface ContractorsContextType {
  contractors: Contractor[];
  error: string | null;
  addContractor: (contractor: Omit<Contractor, 'id'>) => Promise<void>;
  updateContractor: (id: string, contractor: Partial<Contractor>) => Promise<void>; // Changed id to string
  deleteContractor: (id: string) => Promise<void>; // Changed id to string
  getActiveContractors: () => Contractor[];
}

const ContractorsContext = createContext<ContractorsContextType | undefined>(undefined);

export const ContractorsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { handleError } = useErrorHandler();

  const fetchContractors = async () => {
    try {
      const data = await getContractors();
      setContractors(data.map(mapApiToInternal));
    } catch (err) {
      const msg = handleError(err, 'Failed to fetch contractors');
      setError(msg);
    }
  };

  useEffect(() => {
    fetchContractors();
  }, [handleError]);

  const addContractor = async (contractor: Omit<Contractor, 'id'>) => {
    try {
      const payload = mapInternalToApi(contractor);
      const newContractor = await createContractor(payload);
      setContractors(prev => [...prev, mapApiToInternal(newContractor)]);
    } catch (error) {
      handleError(error, 'Failed to add contractor');
      throw error;
    }
  };

  const updateContractor = async (id: string, updates: Partial<Contractor>) => {
    try {
      // Construct payload. Ideally we should merging updates with existing data if API requires full payload,
      // but our API updateContractor takes Partial<CreateContractorPayload>.
      // However, we need to convert the keys from camelCase to snake_case.
      const current = contractors.find(c => c.id === id);
      if (!current) return;

      const merged = { ...current, ...updates };
      const payload = mapInternalToApi(merged);

      // API updateContractor expects UpdateContractorPayload which mimics CreateContractorPayload
      // We cast payload to strict type if needed, but mapInternalToApi returns CreateContractorPayload
      // which matches the structure.

      const updated = await updateContractorApi(id, payload);
      // api.updateContractor returns Promise<Contractor> (ApiContractor)
      // We need to map it back to internal Contractor
      setContractors(prev => prev.map(c => (c.id === id ? mapApiToInternal(updated) : c)));
    } catch (error) {
      handleError(error, 'Failed to update contractor');
      throw error;
    }
  };

  const deleteContractor = async (id: string) => {
    try {
      await apiDeleteContractor(id);
      setContractors(prev => prev.filter(c => c.id !== id));
    } catch (error) {
      handleError(error, 'Failed to delete contractor');
      throw error;
    }
  };

  const getActiveContractors = () => contractors.filter(c => c.status === 'active');

  const value = useMemo(
    () => ({ contractors, error, addContractor, updateContractor, deleteContractor, getActiveContractors }),
    [contractors, error]
  );

  return (
    <ContractorsContext.Provider value={value}>
      {children}
    </ContractorsContext.Provider>
  );
};

export const useContractors = () => {
  const context = useContext(ContractorsContext);
  if (context === undefined) {
    throw new Error('useContractors must be used within a ContractorsProvider');
  }
  return context;
};
