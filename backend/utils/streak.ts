// Project: Inkwell
// Location: backend/utils/streak.ts
// Purpose: Works out a reader's reading streak from the days they read. Days
// are text like "2026-11-26" in UTC time. The current streak counts the run of
// back-to-back days ending today or yesterday (so a reader still has today to
// keep it alive). The longest streak is the best run ever.

const DAY_MS = 86_400_000;

export type StreakInfo = {
  current: number;
  longest: number;
  lastReadDay: string | null;
  readToday: boolean;
};

export function toDayString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayToMs(day: string): number {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function gapInDays(earlier: string, later: string): number {
  return Math.round((dayToMs(later) - dayToMs(earlier)) / DAY_MS);
}

export function computeStreaks(days: string[], today: string): StreakInfo {
  const sorted = [...new Set(days)].sort();
  if (sorted.length === 0) {
    return { current: 0, longest: 0, lastReadDay: null, readToday: false };
  }

  let longest = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    run = gapInDays(sorted[index - 1], sorted[index]) === 1 ? run + 1 : 1;
    if (run > longest) longest = run;
  }

  const last = sorted[sorted.length - 1];
  const daysSinceLast = gapInDays(last, today);

  let current = 0;
  if (daysSinceLast === 0 || daysSinceLast === 1) {
    current = 1;
    for (let index = sorted.length - 1; index > 0; index -= 1) {
      if (gapInDays(sorted[index - 1], sorted[index]) === 1) current += 1;
      else break;
    }
  }

  return { current, longest, lastReadDay: last, readToday: last === today };
}

// Location: backend/utils/streak.ts
// End of file: streak.ts