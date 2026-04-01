import type { CenteringRatio, GradeResult, GradingCompany } from "./types";
import { GRADING_COMPANIES } from "./standards";

function ratioPassesThreshold(ratio: CenteringRatio, maxLargerSide: number): boolean {
  return ratio.horizontal.larger <= maxLargerSide && ratio.vertical.larger <= maxLargerSide;
}

export function calculateGradeForCompany(
  company: GradingCompany,
  frontRatio: CenteringRatio,
  backRatio: CenteringRatio | null
): GradeResult {
  let frontLimitingGrade = null;
  let backLimitingGrade = null;

  for (const level of company.grades) {
    if (ratioPassesThreshold(frontRatio, level.front.maxLargerSide)) {
      if (!frontLimitingGrade) frontLimitingGrade = level;
    }
  }

  if (backRatio) {
    for (const level of company.grades) {
      if (ratioPassesThreshold(backRatio, level.back.maxLargerSide)) {
        if (!backLimitingGrade) backLimitingGrade = level;
      }
    }
  }

  let bestGrade = frontLimitingGrade;
  if (backRatio && backLimitingGrade && frontLimitingGrade) {
    bestGrade =
      backLimitingGrade.numericGrade < frontLimitingGrade.numericGrade
        ? backLimitingGrade
        : frontLimitingGrade;
  } else if (backRatio && !backLimitingGrade) {
    bestGrade = null;
  }

  return { company, bestGrade, frontLimitingGrade, backLimitingGrade };
}

export function calculateAllGrades(
  frontRatio: CenteringRatio,
  backRatio: CenteringRatio | null
): GradeResult[] {
  return GRADING_COMPANIES.map((company) =>
    calculateGradeForCompany(company, frontRatio, backRatio)
  );
}
