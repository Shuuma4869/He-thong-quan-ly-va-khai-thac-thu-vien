import { createContext, useContext } from 'react';
import { defaults, type Appearance } from './appearance';

export type AppearanceContextValue = {
  values: Appearance; saved: Appearance; loading: boolean; saving: boolean; error: string | null;
  preview: (values: Appearance) => void; save: (values: Appearance) => Promise<void>;
  reset: () => Promise<void>; discard: () => void;
};
const fallback: AppearanceContextValue = { values: defaults, saved: defaults, loading: false, saving: false,
  error: null, preview: () => {}, save: async () => {}, reset: async () => {}, discard: () => {} };
export const AppearanceContext = createContext<AppearanceContextValue>(fallback);
export function useAppearance() { return useContext(AppearanceContext); }
