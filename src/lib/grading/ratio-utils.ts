import type { CenteringMeasurement, CenteringRatio } from "./types";
import type { GuidePositions } from "@/stores/measurement-store";

export function marginsToRatio(measurement: CenteringMeasurement): CenteringRatio {
  const totalH = measurement.leftMargin + measurement.rightMargin;
  const totalV = measurement.topMargin + measurement.bottomMargin;

  const leftPct = totalH > 0 ? (measurement.leftMargin / totalH) * 100 : 50;
  const rightPct = totalH > 0 ? (measurement.rightMargin / totalH) * 100 : 50;
  const topPct = totalV > 0 ? (measurement.topMargin / totalV) * 100 : 50;
  const bottomPct = totalV > 0 ? (measurement.bottomMargin / totalV) * 100 : 50;

  return {
    horizontal: {
      larger: Math.round(Math.max(leftPct, rightPct)),
      smaller: Math.round(Math.min(leftPct, rightPct)),
      leftPercent: Math.round(leftPct),
      rightPercent: Math.round(rightPct),
    },
    vertical: {
      larger: Math.round(Math.max(topPct, bottomPct)),
      smaller: Math.round(Math.min(topPct, bottomPct)),
      topPercent: Math.round(topPct),
      bottomPercent: Math.round(bottomPct),
    },
  };
}

export function formatRatio(larger: number, smaller: number): string {
  return `${larger}/${smaller}`;
}

/**
 * Centering is measured from the gap between outer (card edge) and inner (border/artwork edge).
 * Left margin = inner.left - outer.left
 * Right margin = outer.right - inner.right
 * Top margin = inner.top - outer.top
 * Bottom margin = outer.bottom - inner.bottom
 */
export function outerInnerToMeasurement(
  outer: GuidePositions,
  inner: GuidePositions,
): CenteringMeasurement {
  return {
    leftMargin: Math.max(0, inner.left - outer.left),
    rightMargin: Math.max(0, outer.right - inner.right),
    topMargin: Math.max(0, inner.top - outer.top),
    bottomMargin: Math.max(0, outer.bottom - inner.bottom),
  };
}
