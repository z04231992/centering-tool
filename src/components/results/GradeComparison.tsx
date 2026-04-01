import { useGradeCalculation } from "@/hooks/useGradeCalculation";
import { CenteringRatioDisplay } from "./CenteringRatioDisplay";
import { GradeCard } from "./GradeCard";
import { useSettingsStore } from "@/stores/settings-store";

export function GradeComparison() {
  const { frontRatio, backRatio, grades, hasFront, hasBack } = useGradeCalculation();
  const { preferredCompanies } = useSettingsStore();

  if (!hasFront || !frontRatio) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">Upload a card to see centering grades</p>
        <p className="text-sm mt-1">Results will appear here automatically</p>
      </div>
    );
  }

  const filteredGrades = grades.filter((g) =>
    preferredCompanies.includes(g.company.id)
  );

  return (
    <div className="space-y-4">
      <CenteringRatioDisplay label="Front Centering" ratio={frontRatio} />
      {hasBack && backRatio && (
        <CenteringRatioDisplay label="Back Centering" ratio={backRatio} />
      )}
      {!hasBack && (
        <p className="text-xs text-muted-foreground text-center">
          Switch to Back tab to add back side measurement for complete grading
        </p>
      )}

      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          Grade Comparison {!hasBack && "(Front Only)"}
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {filteredGrades.map((result) => (
            <GradeCard key={result.company.id} result={result} />
          ))}
        </div>
      </div>
    </div>
  );
}
