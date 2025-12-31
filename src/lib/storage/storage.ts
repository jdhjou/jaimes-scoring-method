import type { CourseTemplate, RoundState } from "@/lib/domain/types";

export interface StorageAdapter {
  loadRound(): RoundState | null;
  saveRound(round: RoundState): void;
  clearRound(): void;

  loadTemplates(): CourseTemplate[];
  saveTemplate(template: CourseTemplate): void;
  deleteTemplate(templateId: string): void;
}
