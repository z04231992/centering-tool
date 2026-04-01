export interface CenteringThreshold {
  maxLargerSide: number;
}

export interface GradeLevel {
  grade: string;
  numericGrade: number;
  front: CenteringThreshold;
  back: CenteringThreshold;
}

export interface GradingCompany {
  id: string;
  name: string;
  fullName: string;
  color: string;
  grades: GradeLevel[];
}

export interface CenteringMeasurement {
  leftMargin: number;
  rightMargin: number;
  topMargin: number;
  bottomMargin: number;
}

export interface CenteringRatio {
  horizontal: { larger: number; smaller: number; leftPercent: number; rightPercent: number };
  vertical: { larger: number; smaller: number; topPercent: number; bottomPercent: number };
}

export interface GradeResult {
  company: GradingCompany;
  bestGrade: GradeLevel | null;
  frontLimitingGrade: GradeLevel | null;
  backLimitingGrade: GradeLevel | null;
}
