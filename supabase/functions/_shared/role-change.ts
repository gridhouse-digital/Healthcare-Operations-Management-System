// Rules shared by the role-change and deactivate functions.

export const ASSIGNABLE_ROLES = ["tenant_admin", "hr_admin"] as const;
export type AssignableRole = typeof ASSIGNABLE_ROLES[number];

/** platform_admin is deliberately absent: it can never be granted through the app. */
export function isAssignableRole(role: unknown): role is AssignableRole {
  return typeof role === "string" && (ASSIGNABLE_ROLES as readonly string[]).includes(role);
}

/**
 * Why this change must not happen, or null if it may. Covers the last platform
 * admin too, because no platform admin can be changed through these functions.
 */
export function blockedUserChange(input: {
  actorUserId: string;
  targetUserId: string;
  targetRole: string;
}): string | null {
  if (input.targetUserId === input.actorUserId) return "You cannot change your own account";
  if (input.targetRole === "platform_admin") return "Platform admin accounts cannot be changed here";
  return null;
}
