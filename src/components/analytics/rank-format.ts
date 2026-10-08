/**
 * Client-safe rank display helpers. (Client components may not import
 * src/server/**, so the tiny ordinal helper is mirrored here; ranks
 * themselves are always computed server-side by computeRanks.)
 */

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/** Plain explanation of what rank 1 means for this indicator. */
export function rankDirectionText(higherIsBetter: boolean | null): string {
  if (higherIsBetter === true) return "Rank 1 is the highest value (higher is better).";
  if (higherIsBetter === false) return "Rank 1 is the lowest value (lower is better).";
  return "Neither direction is better for this indicator; rank 1 is simply the highest value.";
}
