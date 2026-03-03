import { create } from 'zustand';

interface DashboardFilterState {
  selectedVendor: string;
  setSelectedVendor: (vendor: string) => void;
}

export const useDashboardFilterStore = create<DashboardFilterState>((set) => ({
  selectedVendor: 'all',
  setSelectedVendor: (vendor) => set({ selectedVendor: vendor }),
}));
