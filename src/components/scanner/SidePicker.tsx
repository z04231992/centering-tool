import { useMeasurementStore } from "@/stores/measurement-store";
import { cn } from "@/lib/utils";

export function SidePicker() {
  const { activeSide, setActiveSide, front, back } = useMeasurementStore();

  return (
    <div className="flex gap-1 p-1 bg-secondary rounded-lg w-fit">
      <button
        onClick={() => setActiveSide("front")}
        className={cn(
          "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
          activeSide === "front"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Front {front.imageSrc && "~"}
      </button>
      <button
        onClick={() => setActiveSide("back")}
        className={cn(
          "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
          activeSide === "back"
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground"
        )}
      >
        Back {back.imageSrc && "~"}
      </button>
    </div>
  );
}
