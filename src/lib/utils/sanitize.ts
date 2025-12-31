export function sanitizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ").slice(0, 60);
}
