import { create } from 'zustand';

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  prompt: string;
  stage: string;
  isActive: boolean;
  isCustom: boolean;
  priority: number;
  version: number;
}

interface SkillsState {
  skills: SkillItem[];
  isLoading: boolean;
  error: string | null;
  fetchSkills: (stage?: string) => Promise<void>;
  getSkillPrompt: (skillId: string, fallback?: string) => string;
  getSkillsByStage: (stage: string) => SkillItem[];
  updateSkillPrompt: (skillId: string, prompt: string) => Promise<boolean>;
  resetSkillToSeed: (skillId: string) => Promise<boolean>;
}

export const useSkillsStore = create<SkillsState>((set, get) => ({
  skills: [],
  isLoading: false,
  error: null,

  fetchSkills: async (stage?: string) => {
    set({ isLoading: true, error: null });
    try {
      const url = stage ? `/api/v1/skills?stage=${encodeURIComponent(stage)}` : '/api/v1/skills';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const mapped: SkillItem[] = data.map((d: any) => ({
        id: d.id,
        name: d.name || d.title,
        description: d.description || '',
        prompt: d.prompt || d.content,
        stage: d.stage,
        isActive: d.is_active !== undefined ? d.is_active : d.enabled,
        isCustom: d.is_custom || false,
        priority: d.priority || 100,
        version: d.version || 1,
      }));
      set({ skills: mapped, isLoading: false });
    } catch (e: any) {
      set({ error: e.message, isLoading: false });
    }
  },

  getSkillPrompt: (skillId: string, fallback: string = ''): string => {
    const found = get().skills.find((s) => s.id === skillId && s.isActive);
    return found?.prompt?.trim() || fallback;
  },

  getSkillsByStage: (stage: string): SkillItem[] => {
    return get().skills.filter((s) => s.stage === stage && s.isActive);
  },

  updateSkillPrompt: async (skillId: string, prompt: string) => {
    try {
      const res = await fetch(`/api/v1/skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, is_active: true }),
      });
      if (!res.ok) return false;
      await get().fetchSkills();
      return true;
    } catch {
      return false;
    }
  },

  resetSkillToSeed: async (skillId: string) => {
    try {
      const res = await fetch(`/api/v1/system/skills/${skillId}/reset`, { method: 'POST' });
      if (!res.ok) return false;
      await get().fetchSkills();
      return true;
    } catch {
      return false;
    }
  },
}));
