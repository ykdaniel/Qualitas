/**
 * Generic Data Context Factory
 * Creates reusable CRUD context providers to eliminate code duplication
 *
 * Usage:
 *   const { Provider: ITPProvider, useContext: useITP } = createDataContext<ITPItem>({
 *     endpoint: '/itp/',
 *     entityName: 'ITP',
 *     normalizeItem: (item) => parseJsonFields(item, ['attachments'])
 *   });
 */

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import api from '../services/api';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { FilterParams } from '../types/api';

/**
 * Configuration for creating a data context
 */
export interface DataContextConfig<T> {
  /** API endpoint (e.g., '/itp/') */
  endpoint: string;
  /** Entity name for error messages (e.g., 'ITP') */
  entityName: string;
  /** Optional function to normalize API responses */
  normalizeItem?: (item: any) => T;
  /** Optional initial fetch on mount (default: true) */
  fetchOnMount?: boolean;
}

/**
 * Context value interface
 */
export interface DataContextValue<T> {
  /** List of items */
  list: T[];
  /** Loading state */
  loading: boolean;
  /** Error message */
  error: string | null;
  /** Refetch data with optional filters */
  refetch: (params?: FilterParams) => Promise<void>;
  /** Add new item */
  add: (item: Omit<T, 'id'>) => Promise<T>;
  /** Update existing item */
  update: (id: string, item: Partial<T>) => Promise<void>;
  /** Delete item */
  delete: (id: string) => Promise<void>;
  /** Get current list */
  getList: () => T[];
  /** Get items by vendor/contractor */
  getByVendor: (vendor: string) => T[];
  /** Find item by ID */
  findById: (id: string) => T | undefined;
}

/**
 * Creates a data context with CRUD operations
 *
 * @param config - Configuration object
 * @returns Provider component and useContext hook
 */
export function createDataContext<T extends { id: string; vendor?: string; contractor?: string }>(
  config: DataContextConfig<T>
) {
  const {
    endpoint,
    entityName,
    normalizeItem = (item: any) => item as T,
    fetchOnMount = true
  } = config;

  // Create context
  const Context = createContext<DataContextValue<T> | undefined>(undefined);

  // Provider component
  const Provider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [list, setList] = useState<T[]>([]);
    const [loading, setLoading] = useState(fetchOnMount);
    const [error, setError] = useState<string | null>(null);
    const { handleError } = useErrorHandler();

    /**
     * Fetch data from API
     */
    const refetch = useCallback(async (params?: FilterParams) => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(endpoint, { params });
        const data = Array.isArray(response.data) ? response.data : [];
        const normalized = data.map(normalizeItem);
        setList(normalized);
      } catch (err) {
        const errorMsg = handleError(err, `Failed to fetch ${entityName} list`);
        setError(errorMsg);
      } finally {
        setLoading(false);
      }
    }, [handleError]);

    /**
     * Add new item
     */
    const add = useCallback(async (item: Omit<T, 'id'>): Promise<T> => {
      try {
        const response = await api.post(endpoint, item);
        const newItem = normalizeItem(response.data);
        setList(prev => [...prev, newItem]);
        return newItem;
      } catch (error) {
        handleError(error, `Failed to add ${entityName}`);
        throw error;
      }
    }, [handleError]);

    /**
     * Update existing item
     */
    const update = useCallback(async (id: string, updates: Partial<T>): Promise<void> => {
      try {
        const currentItem = list.find(i => i.id === id);
        if (!currentItem) {
          throw new Error(`${entityName} not found`);
        }

        const mergedItem = { ...currentItem, ...updates };
        const response = await api.put(`${endpoint}${id}`, mergedItem);
        const updatedItem = normalizeItem(response.data);
        setList(prev => prev.map(i => (i.id === id ? updatedItem : i)));
      } catch (error) {
        handleError(error, `Failed to update ${entityName}`);
        throw error;
      }
    }, [list, handleError]);

    /**
     * Delete item
     */
    const deleteItem = useCallback(async (id: string): Promise<void> => {
      try {
        await api.delete(`${endpoint}${id}`);
        setList(prev => prev.filter(i => i.id !== id));
      } catch (error) {
        handleError(error, `Failed to delete ${entityName}`);
        throw error;
      }
    }, [handleError]);

    /**
     * Get current list
     */
    const getList = useCallback(() => {
      return list;
    }, [list]);

    /**
     * Get items by vendor/contractor
     */
    const getByVendor = useCallback((vendor: string) => {
      return list.filter(item =>
        item.vendor === vendor || (item as any).contractor === vendor
      );
    }, [list]);

    /**
     * Find item by ID
     */
    const findById = useCallback((id: string): T | undefined => {
      return list.find(item => item.id === id);
    }, [list]);

    // Fetch on mount
    useEffect(() => {
      if (fetchOnMount) {
        refetch();
      }
    }, [refetch, fetchOnMount]);

    const value: DataContextValue<T> = {
      list,
      loading,
      error,
      refetch,
      add,
      update,
      delete: deleteItem,
      getList,
      getByVendor,
      findById
    };

    return <Context.Provider value={value}>{children}</Context.Provider>;
  };

  /**
   * Hook to use the context
   */
  const useDataContext = (): DataContextValue<T> => {
    const context = useContext(Context);
    if (context === undefined) {
      throw new Error(`use${entityName}Context must be used within ${entityName}Provider`);
    }
    return context;
  };

  return {
    Provider,
    useContext: useDataContext,
    Context // Export context for advanced usage
  };
}
