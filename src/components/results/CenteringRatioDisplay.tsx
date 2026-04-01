import { formatRatio } from "@/lib/grading/ratio-utils";
import type { CenteringRatio } from "@/lib/grading/types";
import { ArrowLeftRight, ArrowUpDown } from "lucide-react";

interface Props {
  label: string;
  ratio: CenteringRatio;
}

export function CenteringRatioDisplay({ label, ratio }: Props) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-sm font-medium text-muted-foreground mb-3">{label}</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ArrowLeftRight className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">
              {formatRatio(ratio.horizontal.larger, ratio.horizontal.smaller)}
            </p>
            <p className="text-xs text-muted-foreground">
              L {ratio.horizontal.leftPercent} / R {ratio.horizontal.rightPercent}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <ArrowUpDown className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-2xl font-bold tracking-tight">
              {formatRatio(ratio.vertical.larger, ratio.vertical.smaller)}
            </p>
            <p className="text-xs text-muted-foreground">
              T {ratio.vertical.topPercent} / B {ratio.vertical.bottomPercent}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
