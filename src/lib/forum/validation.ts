import { ForumError } from "./permissions";
export function field(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string") throw new ForumError(`${label} is required`);
  const cleaned = value.trim();
  if (cleaned.length < min || cleaned.length > max)
    throw new ForumError(`${label} must be ${min}–${max} characters`);
  return cleaned;
}
export function slug(value: unknown) {
  const clean = field(value, "Slug", 2, 64).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean))
    throw new ForumError(
      "Slug must contain lowercase letters, numbers and hyphens",
    );
  return clean;
}
export function identifier(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    throw new ForumError("Invalid identifier");
  return value;
}
export function pageNumber(value: string | undefined) {
  const n = Number(value ?? "1");
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 10000) : 1;
}
