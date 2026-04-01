import { useEffect } from "react";
import { ExternalLink } from "lucide-react";

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

        {/* Speech bubble + CTA */}
        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            {/* Pixel-art speech bubble */}
            <div
              className="relative bg-white text-black px-3 py-1.5 text-xs font-medium"
              style={{
                imageRendering: "pixelated",
                borderRadius: 0,
                border: "3px solid #000",
                boxShadow: "3px 3px 0 #000",
              }}
            >
              <span>Need help getting product?</span>
              {/* Pixel tail pointing left toward Pikachu */}
              <div
                className="absolute"
                style={{
                  left: "12px",
                  bottom: "-9px",
                  width: 0,
                  height: 0,
                  borderLeft: "6px solid transparent",
                  borderRight: "6px solid transparent",
                  borderTop: "9px solid #000",
                }}
              />
              <div
                className="absolute"
                style={{
                  left: "13px",
                  bottom: "-5px",
                  width: 0,
                  height: 0,
                  borderLeft: "5px solid transparent",
                  borderRight: "5px solid transparent",
                  borderTop: "6px solid #fff",
                }}
              />
            </div>
          </div>
          <a
            href="https://www.helpmecheckout.com/join?ref=HMC-BETRAYAL-2690"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
          >
            Join Help Me Checkout!
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </header>
  );
}
