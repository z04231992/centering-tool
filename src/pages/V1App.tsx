import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { CardCanvas } from "@/components/scanner/CardCanvas";
import { SidePicker } from "@/components/scanner/SidePicker";
import { GradeComparison } from "@/components/results/GradeComparison";
import { GradingHandbook } from "@/components/reference/GradingHandbook";
import { OffCenterVisualizer } from "@/components/visualizer/OffCenterVisualizer";
import { Crosshair, BookOpen, Eye } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "scanner" | "reference" | "visualizer";

const tabs: { id: Tab; label: string; icon: typeof Crosshair }[] = [
  { id: "scanner", label: "Scanner", icon: Crosshair },
  { id: "reference", label: "Reference", icon: BookOpen },
  { id: "visualizer", label: "Visualizer", icon: Eye },
];

export default function V1App() {
  const [activeTab, setActiveTab] = useState<Tab>("scanner");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Header />

      {/* Tab Navigation */}
      <div className="border-b border-border bg-card/50">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                  activeTab === id
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === "scanner" && (
          <div className="grid lg:grid-cols-[1fr_380px] gap-6">
            <div className="space-y-4">
              <SidePicker />
              <CardCanvas />
            </div>
            <aside className="lg:sticky lg:top-20 lg:self-start">
              <GradeComparison />
            </aside>
          </div>
        )}

        {activeTab === "reference" && <GradingHandbook />}
        {activeTab === "visualizer" && <OffCenterVisualizer />}
      </main>
    </div>
  );
}
