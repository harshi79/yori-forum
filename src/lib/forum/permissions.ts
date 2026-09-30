export type Role = "user" | "moderator" | "admin";
export type Actor = { id: string; role: Role };
export class ForumError extends Error {}
export function assertAllowed(
  allowed: boolean,
  message = "Not permitted",
): asserts allowed {
  if (!allowed) throw new ForumError(message);
}
export function canModerate(actor: Actor) {
  return actor.role === "moderator" || actor.role === "admin";
}
export function canAdmin(actor: Actor) {
  return actor.role === "admin";
}
export function canEdit(
  actor: Actor,
  authorId: string | null,
  createdAt: Date,
  windowMinutes: number,
) {
  return (
    canModerate(actor) ||
    (actor.id === authorId &&
      Date.now() - createdAt.getTime() <= windowMinutes * 60000)
  );
}
export const EDIT_WINDOW_MINUTES = 30;
