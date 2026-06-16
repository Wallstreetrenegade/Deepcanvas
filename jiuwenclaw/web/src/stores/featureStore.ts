import { create } from 'zustand';

export type FeatureKey =
  | 'storage'
  | 'kanban'
  | 'creativeStudio'
  | 'socialStation'
  | 'crm'
  | 'email'
  | 'leadGen'
  | 'videoMeeting'
  | 'projectFlow'
  | 'appBuilder';

export const FEATURE_ORDER: FeatureKey[] = [
  'storage',
  'kanban',
  'creativeStudio',
  'socialStation',
  'appBuilder',
  'crm',
  'email',
  'leadGen',
  'videoMeeting',
  'projectFlow',
];

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  storage: 'Storage',
  kanban: 'Kanban',
  creativeStudio: 'Creative Studio',
  socialStation: 'Social Station',
  crm: 'CRM',
  email: 'Email',
  leadGen: 'Lead Gen',
  videoMeeting: 'Video Meeting',
  projectFlow: 'Project Flow',
  appBuilder: 'Build Studio',
};

interface FeatureState {
  activeFeature: FeatureKey | null;
  openFeature: (feature: FeatureKey) => void;
  closeFeature: () => void;
}

export const useFeatureStore = create<FeatureState>((set) => ({
  activeFeature: null,
  openFeature: (feature) => set({ activeFeature: feature }),
  closeFeature: () => set({ activeFeature: null }),
}));
