import type { StorageAdapter } from "./storage";
import type { CourseTemplate, RoundState } from "@/lib/domain/types";

export function createRemoteStorageAdapter(): StorageAdapter {
  return {
    loadRound() { return null; },
    saveRound(_round: RoundState) {},
    clearRound() {},

    loadTemplates(): CourseTemplate[] { return []; },
    saveTemplate(_t: CourseTemplate) {},
    deleteTemplate(_id: string) {},
  };
}
