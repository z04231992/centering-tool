import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function Header() {
  const [bannerDismissed, setBannerDismissed] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <>
      {!bannerDismissed && (
        <div className="bg-primary/20 border-b border-primary/30">
          <div className="max-w-7xl mx-auto px-4 h-9 flex items-center justify-center gap-2 text-xs relative">
            <span className="text-muted-foreground">Struggling to buy product?</span>
            <a
              href="https://www.helpmecheckout.com/login"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-white hover:underline"
            >
              Try Help Me Checkout →
            </a>
            <button
              onClick={() => setBannerDismissed(true)}
              className="absolute right-4 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      <header
        className="border-b border-border sticky top-0 z-50"
        style={{
          backgroundColor: "rgba(17, 30, 25, 0.92)",
          backdropFilter: "blur(16px)",
        }}
      >
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <a
            href="/"
            onClick={(e) => { e.preventDefault(); window.location.reload(); }}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity cursor-pointer"
          >
            <img src="/pikachu-logo.png" alt="Logo" className="w-8 h-8" style={{ imageRendering: "pixelated" }} />
            <span className="font-semibold text-lg text-foreground">Centering Tool</span>
          </a>
        </div>
      </header>
    </>
  );
}
