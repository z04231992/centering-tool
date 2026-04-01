import { useEffect } from "react";

export function Header() {
  // Always force dark mode for the forest green theme
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <header
      className="border-b border-border sticky top-0 z-50"
      style={{
        backgroundColor: "rgba(17, 30, 25, 0.92)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/pikachu-logo.png" alt="Logo" className="w-8 h-8" style={{ imageRendering: "pixelated" }} />
          <span className="font-semibold text-lg text-foreground">Card Centering Calculator</span>
        </div>
      </div>
    </header>
  );
}
