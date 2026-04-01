import { GRADING_COMPANIES } from "@/lib/grading/standards";
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export function GradingHandbook() {
  const [expandedId, setExpandedId] = useState<string | null>("psa");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Grading Standards Reference</h2>
        <p className="text-muted-foreground">
          Complete centering thresholds for all major grading companies. Centering is displayed
          as the maximum allowed ratio for the larger side (e.g., 60/40 means the larger border
          can be at most 60% of the total).
        </p>
      </div>

      <div className="space-y-3">
        {GRADING_COMPANIES.map((company) => {
          const isExpanded = expandedId === company.id;
          return (
            <div key={company.id} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : company.id)}
                className="w-full flex items-center justify-between p-4 hover:bg-accent/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: company.color }}
                  />
                  <div className="text-left">
                    <span className="font-semibold">{company.name}</span>
                    <span className="text-sm text-muted-foreground ml-2">{company.fullName}</span>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>

              {isExpanded && (
                <div className="px-4 pb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-2 font-medium text-muted-foreground">Grade</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Numeric</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Front Max</th>
                        <th className="text-left py-2 font-medium text-muted-foreground">Back Max</th>
                      </tr>
                    </thead>
                    <tbody>
                      {company.grades.map((level) => (
                        <tr key={level.grade} className="border-b border-border/50 last:border-0">
                          <td className="py-2.5 font-medium">{level.grade}</td>
                          <td className="py-2.5" style={{ color: company.color }}>
                            {level.numericGrade}
                          </td>
                          <td className="py-2.5">
                            {level.front.maxLargerSide}/{100 - level.front.maxLargerSide}
                          </td>
                          <td className="py-2.5">
                            {level.back.maxLargerSide}/{100 - level.back.maxLargerSide}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="font-semibold mb-2">How to Read These Standards</h3>
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>A "60/40" threshold means the larger border can be at most 60% of the total border width on that axis.</li>
          <li>Perfect centering is 50/50 - equal borders on both sides.</li>
          <li>Front and back sides often have different thresholds. PSA, for example, allows up to 90/10 on the back for a Gem Mint 10.</li>
          <li>The overall centering grade is limited by whichever side (front or back) and axis (horizontal or vertical) is worst.</li>
          <li>Centering is only one factor in grading - edges, surface, and corners also affect the final grade.</li>
        </ul>
      </div>
    </div>
  );
}
