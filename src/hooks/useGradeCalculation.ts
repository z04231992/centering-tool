import { useMemo } from "react";
import { useMeasurementStore } from "@/stores/measurement-store";
import { outerInnerToMeasurement, marginsToRatio } from "@/lib/grading/ratio-utils";
import { calculateAllGrades } from "@/lib/grading/calculator";
import type { CenteringRatio, GradeResult } from "@/lib/grading/types";

interface GradeCalculationResult {
  frontRatio: CenteringRatio | null;
  backRatio: CenteringRatio | null;
  grades: GradeResult[];
  hasFront: boolean;
  hasBack: boolean;
}

export function useGradeCalculation(): GradeCalculationResult {
  const { front, back } = useMeasurementStore();

  return useMemo(() => {
    const hasFront = !!front.imageSrc;
    const hasBack = !!back.imageSrc;

    if (!hasFront) {
      return { frontRatio: null, backRatio: null, grades: [], hasFront, hasBack };
    }

    const frontMeasurement = outerInnerToMeasurement(front.outer, front.inner);
    const frontRatio = marginsToRatio(frontMeasurement);

    let backRatio: CenteringRatio | null = null;
    if (hasBack) {
      const backMeasurement = outerInnerToMeasurement(back.outer, back.inner);
      backRatio = marginsToRatio(backMeasurement);
    }

    const grades = calculateAllGrades(frontRatio, backRatio);

    return { frontRatio, backRatio, grades, hasFront, hasBack };
  }, [front, back]);
}
