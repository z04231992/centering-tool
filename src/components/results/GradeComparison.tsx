import { useGradeCalculation } from "@/hooks/useGradeCalculation";
import { CenteringRatioDisplay } from "./CenteringRatioDisplay";
import { GradeCard } from "./GradeCard";
import { useSettingsStore } from "@/stores/settings-store";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const guideColors = [
  { color: "#ef4444", name: "Red" },
  { color: "#3b82f6", name: "Blue" },
  { color: "#22c55e", name: "Green" },
  { color: "#eab308", name: "Yellow" },
  { color: "#a855f7", name: "Purple" },
  { color: "#f97316", name: "Orange" },
  { color: "#ffffff", name: "White" },
  { color: "#34d399", name: "Emerald" },
];

export function GradeComparison() {
  const { frontRatio, backRatio, grades, hasFront, hasBack } = useGradeCalculation();
  const {
    preferredCompanies,
    outerGuideColor,
    innerGuideColor,
    setOuterGuideColor,
    setInnerGuideColor,
  } = useSettingsStore();

  return (
    <div className="space-y-4">
      {/* Help Me Checkout Promo */}
      <a
        href="https://www.helpmecheckout.com/join?ref=HMC-BETRAYAL-2690"
        target="_blank"
        rel="noopener noreferrer"
        className="block rounded-xl border border-primary/30 bg-primary/5 p-4 hover:bg-primary/10 transition-all group"
      >
        <p className="text-sm text-muted-foreground mb-2">Need help getting product?</p>
        <span className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full bg-primary text-primary-foreground group-hover:bg-primary/90 transition-all">
          Join Help Me Checkout!
          <ExternalLink className="w-3.5 h-3.5" />
        </span>
      </a>

      {!hasFront || !frontRatio ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Upload a card to see centering grades</p>
          <p className="text-sm mt-1">Results will appear here automatically</p>
        </div>
      ) : (
        <>
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
              {grades
                .filter((g) => preferredCompanies.includes(g.company.id))
                .map((result) => (
                  <GradeCard key={result.company.id} result={result} />
                ))}
            </div>
          </div>
        </>
      )}

      {/* Guide Color Settings */}
      <div className="border-t border-border pt-4 space-y-3">
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Outer Guide Color</h4>
          <div className="flex gap-1.5 flex-wrap">
            {guideColors.map(({ color, name }) => (
              <button
                key={color}
                onClick={() => setOuterGuideColor(color)}
                title={name}
                className={cn(
                  "w-7 h-7 rounded-md border-2 transition-all",
                  outerGuideColor === color
                    ? "border-primary scale-110 ring-2 ring-primary/30"
                    : "border-border hover:border-primary/50"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-2">Inner Guide Color</h4>
          <div className="flex gap-1.5 flex-wrap">
            {guideColors.map(({ color, name }) => (
              <button
                key={color}
                onClick={() => setInnerGuideColor(color)}
                title={name}
                className={cn(
                  "w-7 h-7 rounded-md border-2 transition-all",
                  innerGuideColor === color
                    ? "border-primary scale-110 ring-2 ring-primary/30"
                    : "border-border hover:border-primary/50"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
