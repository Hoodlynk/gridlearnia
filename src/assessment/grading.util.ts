import { Prisma } from '@prisma/client';

export interface BandResult {
  label: string;
  remark: string | null;
  points: number | null;
}

type BandRow = {
  label: string;
  order: number;
  minScore: Prisma.Decimal | null;
  maxScore: Prisma.Decimal | null;
  points: Prisma.Decimal | null;
  remark: string | null;
};

/**
 * Map a percentage (0–100) to a grading band. A band matches when the
 * percentage falls within its [minScore, maxScore] window (either bound may be
 * open). Returns null when there's no scheme or nothing matches.
 */
export function bandForPercentage(
  bands: BandRow[],
  percentage: number,
): BandResult | null {
  for (const b of bands) {
    const min = b.minScore == null ? -Infinity : Number(b.minScore);
    const max = b.maxScore == null ? Infinity : Number(b.maxScore);
    if (percentage >= min && percentage <= max) {
      return {
        label: b.label,
        remark: b.remark,
        points: b.points == null ? null : Number(b.points),
      };
    }
  }
  return null;
}
