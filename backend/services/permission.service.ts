// Location: backend/services/permission.service.ts
// Purpose: Works out what an admin is allowed to do. The rule: start with the
// default abilities of the admin's rank, then apply that person's personal
// switches (overrides). A switch set to "allowed: false" blocks an ability, and
// "allowed: true" grants one. The Super Admin always has every ability.

import type { AdminRank } from "@prisma/client";
import { prisma } from "../config/prisma";
import {
  PERMISSION_LIST,
  RANK_DEFAULTS,
  type Permission,
} from "../config/permissions";

type OverrideRow = { permission: string; allowed: boolean };

function isPermission(value: string): value is Permission {
  return (PERMISSION_LIST as readonly string[]).includes(value);
}

// Works out the final list of abilities from a rank and a list of switches.
export function computeEffectivePermissions(
  rank: AdminRank | null,
  overrides: OverrideRow[]
): Permission[] {
  if (!rank) return [];
  if (rank === "SUPER_ADMIN") return [...PERMISSION_LIST];

  const granted = new Set<Permission>(RANK_DEFAULTS[rank]);
  for (const override of overrides) {
    if (!isPermission(override.permission)) continue;
    if (override.allowed) {
      granted.add(override.permission);
    } else {
      granted.delete(override.permission);
    }
  }
  return PERMISSION_LIST.filter((permission) => granted.has(permission));
}

export async function getEffectivePermissions(
  userId: string,
  rank: AdminRank | null
): Promise<Permission[]> {
  if (!rank) return [];
  if (rank === "SUPER_ADMIN") return [...PERMISSION_LIST];

  const overrides = await prisma.adminPermissionOverride.findMany({
    where: { userId },
    select: { permission: true, allowed: true },
  });
  return computeEffectivePermissions(rank, overrides);
}

export async function userHasPermission(
  userId: string,
  rank: AdminRank | null,
  permission: Permission
): Promise<boolean> {
  if (!rank) return false;
  if (rank === "SUPER_ADMIN") return true;

  const override = await prisma.adminPermissionOverride.findUnique({
    where: { userId_permission: { userId, permission } },
  });
  if (override) return override.allowed;

  return RANK_DEFAULTS[rank].includes(permission);
}

// Location: backend/services/permission.service.ts
// End of file: permission.service.ts