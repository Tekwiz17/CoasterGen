import { GitHubLogo } from "./components/BrandIcons";
import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowUpRight, ArrowRight, Layers3, Scissors } from "lucide-react";
const CoasterGen = lazy(() => import("./App"));
const SpitGen = lazy(() => import("./SpitGen"));
export function MakerMark() {
  return (
    <svg viewBox="0 0 40 40" width="33" height="33" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="#08785b" />
      <path
        d="M10 28V12l10 9 10-9v16M10 12l10 16 10-16"
        stroke="#d5f9da"
        fill="none"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function MakerHeader({ tool }: { tool?: string }) {
  return (
    <header className="maker-header">
      <a className="maker-brand" href="#/">
        <MakerMark />
        MakerGen
      </a>
      {tool && (
        <>
          <span className="maker-divider">/</span>
          <strong>{tool}</strong>
        </>
      )}
      <nav>
        <a href="#/">All tools</a>
        <a
          href="https://github.com/Tekwiz17/CoasterGen"
          target="_blank"
          rel="noreferrer"
        >
          <GitHubLogo />
          <span>Source</span>
        </a>
      </nav>
    </header>
  );
}
export default function MakerGen() {
  const [route, setRoute] = useState(location.hash);
  useEffect(() => {
    const update = () => {
      setRoute(location.hash);
      window.scrollTo(0, 0);
    };
    addEventListener("hashchange", update);
    return () => removeEventListener("hashchange", update);
  }, []);
  useEffect(() => {
    document.title = route.includes("coastergen")
      ? "CoasterGen · MakerGen"
      : route.includes("splitgen") || route.includes("spitgen")
        ? "SplitGen · MakerGen"
        : "MakerGen — Small tools. More making.";
  }, [route]);
  return (
    <Suspense
      fallback={<div className="maker-loading">Opening your workshop…</div>}
    >
      {route === "#/coastergen" ? (
        <CoasterGen />
      ) : route === "#/splitgen" || route === "#/spitgen" ? (
        <SpitGen />
      ) : (
        <>
          <MakerHeader />
          <main className="maker-home">
            <section className="maker-intro">
              <span className="maker-eyebrow">
                YOUR BROWSER. YOUR WORKBENCH.
              </span>
              <h1>
                A little prep.
                <br />
                <em>A lot more making.</em>
              </h1>
              <p>
                Turn an idea into something you can hold. Simple tools for
                custom prints, clean parts, and the next thing on your
                workbench.
              </p>
              <div className="maker-local">
                <i />
                Free to use · No account · Files stay on your device
              </div>
            </section>
            <section aria-label="MakerGen tools" className="maker-tools">
              <a className="maker-tool" href="#/coastergen">
                <div className="tool-art coaster-art" aria-hidden="true">
                  <div className="home-coaster">
                    <span />
                    <i />
                    <b />
                  </div>
                  <span className="tool-tag">IMAGE → COASTER</span>
                </div>
                <div className="tool-copy">
                  <span className="tool-icon">
                    <Layers3 size={21} />
                  </span>
                  <h2>CoasterGen</h2>
                  <p>
                    Your artwork, made useful. Turn images into multicolor
                    coasters with custom shapes and optional magnet pockets.
                  </p>
                  <span className="tool-open">
                    Make a coaster <ArrowRight size={18} />
                  </span>
                </div>
              </a>
              <a className="maker-tool" href="#/splitgen">
                <div className="tool-art split-art" aria-hidden="true">
                  <div className="home-parts">
                    <i />
                    <i />
                    <i />
                  </div>
                  <span className="tool-tag">ONE MODEL → SEPARATE PARTS</span>
                </div>
                <div className="tool-copy">
                  <span className="tool-icon">
                    <Scissors size={21} />
                  </span>
                  <h2>SplitGen</h2>
                  <p>
                    One model, easier assembly. Separate a 3MF by color and
                    group, then add pins and sockets for the fit you need.
                  </p>
                  <span className="tool-open">
                    Split a model <ArrowRight size={18} />
                  </span>
                </div>
              </a>
            </section>
            <footer className="maker-home-footer">
              <span>Made for the part after “what if?”</span>
              <a
                href="https://github.com/Tekwiz17/CoasterGen"
                target="_blank"
                rel="noreferrer"
              >
                Open source <ArrowUpRight size={14} />
              </a>
            </footer>
          </main>
        </>
      )}
    </Suspense>
  );
}
