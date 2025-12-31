import type { CourseTemplate, RoundState } from "./types";

export const ROUND_VERSION = 1;
export const TEMPLATES_VERSION = 1;

export type PersistedRound = {
  version: number;
  data: RoundState;
};

export type PersistedTemplates = {
  version: number;
  templates: CourseTemplate[];
};

export function migrateRound(raw: any): RoundState | null {
  if (!raw || typeof raw !== "object") return null;
  if (raw.version !== ROUND_VERSION) return null;
  if (!raw.data) return null;
  return raw.data as RoundState;
}

export function migrateTemplates(raw: any): CourseTemplate[] {
  if (!raw || typeof raw !== "object") return [];
  if (raw.version !== TEMPLATES_VERSION) return [];
  if (!Array.isArray(raw.templates)) return [];
  return raw.templates as CourseTemplate[];
}
