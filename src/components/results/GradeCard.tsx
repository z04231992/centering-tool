import type { GradeResult } from "@/lib/grading/types";
import { cn } from "@/lib/utils";

interface Props {
  result: GradeResult;
}

export function GradeCard({ result }: Props) {
  const { company, bestGrade } = result;

  return (
    <div
      className={cn(
        "relative border rounded-xl p-4 transition-all",
        bestGrade ? "border-border bg-card" : "border-border/50 bg-card/50 opacity-60"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: company.color }}
          />
          <span className="font-semibold text-sm">{company.name}</span>
        </div>
      </div>

      {bestGrade ? (
        <div>
          <div
            className="text-3xl font-bold"
            style={{ color: company.color }}
          >
            {bestGrade.numericGrade}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{bestGrade.grade}</p>
          <div className="mt-2 text-xs text-muted-foreground">
            <span>Front: {bestGrade.front.maxLargerSide}/{100 - bestGrade.front.maxLargerSide}</span>
            <span className="mx-1">|</span>
            <span>Back: {bestGrade.back.maxLargerSide}/{100 - bestGrade.back.maxLargerSide}</span>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-2xl font-bold text-muted-foreground">--</div>
          <p className="text-xs text-muted-foreground mt-1">Below minimum threshold</p>
        </div>
      )}
    </div>
  );
}
