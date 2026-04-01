import type { GradingCompany } from "./types";

export const GRADING_COMPANIES: GradingCompany[] = [
  {
    id: "psa",
    name: "PSA",
    fullName: "Professional Sports Authenticator",
    color: "#E31937",
    grades: [
      { grade: "Gem Mint 10", numericGrade: 10, front: { maxLargerSide: 55 }, back: { maxLargerSide: 75 } },
      { grade: "Mint 9", numericGrade: 9, front: { maxLargerSide: 60 }, back: { maxLargerSide: 80 } },
      { grade: "NM-MT 8", numericGrade: 8, front: { maxLargerSide: 65 }, back: { maxLargerSide: 85 } },
      { grade: "NM 7", numericGrade: 7, front: { maxLargerSide: 70 }, back: { maxLargerSide: 90 } },
    ],
  },
  {
    id: "bgs",
    name: "BGS",
    fullName: "Beckett Grading Services",
    color: "#0055A5",
    grades: [
      { grade: "Pristine 10", numericGrade: 10, front: { maxLargerSide: 50 }, back: { maxLargerSide: 50 } },
      { grade: "Gem Mint 9.5", numericGrade: 9.5, front: { maxLargerSide: 55 }, back: { maxLargerSide: 55 } },
      { grade: "Mint 9", numericGrade: 9, front: { maxLargerSide: 60 }, back: { maxLargerSide: 60 } },
      { grade: "NM-MT 8.5", numericGrade: 8.5, front: { maxLargerSide: 65 }, back: { maxLargerSide: 65 } },
      { grade: "NM-MT 8", numericGrade: 8, front: { maxLargerSide: 70 }, back: { maxLargerSide: 70 } },
    ],
  },
  {
    id: "cgc",
    name: "CGC",
    fullName: "Certified Guaranty Company",
    color: "#00A651",
    grades: [
      { grade: "Pristine 10", numericGrade: 10, front: { maxLargerSide: 55 }, back: { maxLargerSide: 75 } },
      { grade: "Gem Mint 9.5", numericGrade: 9.5, front: { maxLargerSide: 60 }, back: { maxLargerSide: 80 } },
      { grade: "Mint 9", numericGrade: 9, front: { maxLargerSide: 65 }, back: { maxLargerSide: 85 } },
    ],
  },
  {
    id: "sgc",
    name: "SGC",
    fullName: "Sportscard Guaranty Corporation",
    color: "#FFB81C",
    grades: [
      { grade: "Pristine 10", numericGrade: 10, front: { maxLargerSide: 55 }, back: { maxLargerSide: 55 } },
      { grade: "Gem Mint 9.5", numericGrade: 9.5, front: { maxLargerSide: 60 }, back: { maxLargerSide: 60 } },
      { grade: "Mint 9", numericGrade: 9, front: { maxLargerSide: 65 }, back: { maxLargerSide: 65 } },
    ],
  },
  {
    id: "tag",
    name: "TAG",
    fullName: "TAG Grading",
    color: "#7B2D8B",
    grades: [
      { grade: "Pristine 10", numericGrade: 10, front: { maxLargerSide: 55 }, back: { maxLargerSide: 70 } },
      { grade: "Gem Mint 9.5", numericGrade: 9.5, front: { maxLargerSide: 60 }, back: { maxLargerSide: 75 } },
    ],
  },
  {
    id: "ace",
    name: "ACE",
    fullName: "ACE Grading",
    color: "#1A1A2E",
    grades: [
      { grade: "Gem Mint 10", numericGrade: 10, front: { maxLargerSide: 55 }, back: { maxLargerSide: 65 } },
      { grade: "Mint 9", numericGrade: 9, front: { maxLargerSide: 60 }, back: { maxLargerSide: 70 } },
    ],
  },
];
