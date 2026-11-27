// Project: Inkwell
// Location: backend/services/preferences.service.ts
// Purpose: Saves and reads a person's reader settings (theme, text size, font
// and so on) so they follow the person to every device.

import { prisma } from "../config/prisma";
import type { AuthUser } from "../utils/selects";
import {
  resolveReaderPrefs,
  type UpdateReaderPrefsInput,
} from "../validators/preferences.validator";

export async function getReaderPrefs(user: AuthUser) {
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { readerPrefs: true },
  });
  return { prefs: resolveReaderPrefs(row?.readerPrefs ?? null) };
}

export async function updateReaderPrefs(
  user: AuthUser,
  input: UpdateReaderPrefsInput
) {
  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { readerPrefs: true },
  });

  const merged = { ...resolveReaderPrefs(row?.readerPrefs ?? null), ...input };
  await prisma.user.update({
    where: { id: user.id },
    data: { readerPrefs: merged },
  });

  return { prefs: merged };
}

// Location: backend/services/preferences.service.ts
// End of file: preferences.service.ts