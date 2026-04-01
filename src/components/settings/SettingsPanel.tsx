import { useSettingsStore } from "@/stores/settings-store";
import { GRADING_COMPANIES } from "@/lib/grading/standards";
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

export function SettingsPanel() {
  const {
    outerGuideColor,
    innerGuideColor,
    preferredCompanies,
    setOuterGuideColor,
    setInnerGuideColor,
    toggleCompany,
  } = useSettingsStore();

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-2">Settings</h2>
        <p className="text-muted-foreground">
          Customize the app to your preferences.
        </p>
      </div>

      {/* Outer Guide Color */}
      <div className="space-y-3">
        <h3 className="font-semibold">Outer Guide Line Color</h3>
        <p className="text-sm text-muted-foreground">Color of the card edge boundary lines.</p>
        <div className="flex gap-2 flex-wrap">
          {guideColors.map(({ color, name }) => (
            <button
              key={color}
              onClick={() => setOuterGuideColor(color)}
              title={name}
              className={cn(
                "w-10 h-10 rounded-lg border-2 transition-all",
                outerGuideColor === color ? "border-primary scale-110 ring-2 ring-primary/30" : "border-border hover:border-primary/50"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Inner Guide Color */}
      <div className="space-y-3">
        <h3 className="font-semibold">Inner Guide Line Color</h3>
        <p className="text-sm text-muted-foreground">Color of the inner border boundary lines.</p>
        <div className="flex gap-2 flex-wrap">
          {guideColors.map(({ color, name }) => (
            <button
              key={color}
              onClick={() => setInnerGuideColor(color)}
              title={name}
              className={cn(
                "w-10 h-10 rounded-lg border-2 transition-all",
                innerGuideColor === color ? "border-primary scale-110 ring-2 ring-primary/30" : "border-border hover:border-primary/50"
              )}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

      {/* Grading Companies */}
      <div className="space-y-3">
        <h3 className="font-semibold">Grading Companies to Display</h3>
        <p className="text-sm text-muted-foreground">Select which companies to show in the grade comparison.</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {GRADING_COMPANIES.map((company) => {
            const isSelected = preferredCompanies.includes(company.id);
            return (
              <button
                key={company.id}
                onClick={() => toggleCompany(company.id)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all text-sm",
                  isSelected
                    ? "border-primary bg-primary/10"
                    : "border-border opacity-50 hover:opacity-80"
                )}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: company.color }}
                />
                <span>{company.name}</span>
                <span className="text-muted-foreground text-xs ml-auto">{company.fullName}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
