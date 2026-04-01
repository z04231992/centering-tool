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

        {/* Pixel speech bubble CTA */}
        <a
          href="https://www.helpmecheckout.com/join?ref=HMC-BETRAYAL-2690"
          target="_blank"
          rel="noopener noreferrer"
          className="hidden sm:block relative group"
          style={{ imageRendering: "pixelated" }}
        >
          {/* Pixel bubble built with layered divs */}
          <div className="relative">
            {/* Outer border (black pixel outline) */}
            <div style={{
              background: "#000",
              padding: "3px",
              clipPath: `polygon(
                3px 0%, calc(100% - 3px) 0%,
                calc(100% - 3px) 3px, 100% 3px,
                100% calc(100% - 3px), calc(100% - 3px) calc(100% - 3px),
                calc(100% - 3px) 100%, 3px 100%,
                3px calc(100% - 3px), 0% calc(100% - 3px),
                0% 3px, 3px 3px
              )`,
            }}>
              {/* Inner fill */}
              <div
                className="group-hover:brightness-110 transition-all"
                style={{
                  background: "linear-gradient(180deg, #1a3a2a 0%, #0d1b16 100%)",
                  padding: "8px 14px",
                  clipPath: `polygon(
                    3px 0%, calc(100% - 3px) 0%,
                    calc(100% - 3px) 3px, 100% 3px,
                    100% calc(100% - 3px), calc(100% - 3px) calc(100% - 3px),
                    calc(100% - 3px) 100%, 3px 100%,
                    3px calc(100% - 3px), 0% calc(100% - 3px),
                    0% 3px, 3px 3px
                  )`,
                }}
              >
                <p className="text-[10px] text-muted-foreground leading-tight">Need help getting product?</p>
                <p className="text-xs font-bold text-primary mt-0.5 group-hover:text-primary/80 transition-colors">
                  Join Help Me Checkout! →
                </p>
              </div>
            </div>
            {/* Pixel staircase tail */}
            <div className="absolute" style={{ left: "16px", bottom: "-9px" }}>
              <div style={{ width: "12px", height: "3px", background: "#000", marginLeft: "0px" }} />
              <div style={{ width: "9px", height: "3px", background: "#000", marginLeft: "3px" }}>
                <div style={{ width: "6px", height: "3px", background: "#1a3a2a", marginLeft: "0px" }} />
              </div>
              <div style={{ width: "6px", height: "3px", background: "#000", marginLeft: "6px" }}>
                <div style={{ width: "3px", height: "3px", background: "#0d1b16", marginLeft: "0px" }} />
              </div>
            </div>
          </div>
        </a>
      </div>
    </header>
  );
}
