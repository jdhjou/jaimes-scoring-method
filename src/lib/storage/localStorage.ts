import type { StorageAdapter } from "./storage";
import type { CourseTemplate, RoundState } from "@/lib/domain/types";
import {
  migrateRound,
  migrateTemplates,
  ROUND_VERSION,
  TEMPLATES_VERSION,
  type PersistedRound,
  type PersistedTemplates,
} from "@/lib/domain/migrate";

const ROUND_KEY = "scoringMethod:round";
const TEMPLATES_KEY = "scoringMethod:templates";

function safeParse(s: string): any {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function createLocalStorageAdapter(): StorageAdapter {
  return {
    loadRound(): RoundState | null {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem(ROUND_KEY);
      if (!raw) return null;
      return migrateRound(safeParse(raw));
    },

    saveRound(round: RoundState): void {
      if (typeof window === "undefined") return;
      const payload: PersistedRound = { version: ROUND_VERSION, data: round };
      window.localStorage.setItem(ROUND_KEY, JSON.stringify(payload));
    },

    clearRound(): void {
      if (typeof window === "undefined") return;
      window.localStorage.removeItem(ROUND_KEY);
    },

    loadTemplates(): CourseTemplate[] {
      if (typeof window === "undefined") return [];
      const raw = window.localStorage.getItem(TEMPLATES_KEY);
      if (!raw) return [];
      return migrateTemplates(safeParse(raw));
    },

    saveTemplate(template: CourseTemplate): void {
      if (typeof window === "undefined") return;
      const templates = this.loadTemplates();
      const next = [template, ...templates];
      const payload: PersistedTemplates = { version: TEMPLATES_VERSION, templates: next };
      window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(payload));
    },

    deleteTemplate(templateId: string): void {
      if (typeof window === "undefined") return;
      const templates = this.loadTemplates().filter((t) => t.id !== templateId);
      const payload: PersistedTemplates = { version: TEMPLATES_VERSION, templates };
      window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(payload));
    },
  };
}
