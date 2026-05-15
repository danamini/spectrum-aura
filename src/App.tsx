import { lazy, Suspense, useEffect, useState } from "react";

const Analyser = lazy(() =>
  import("@/components/analyser/Analyser").then((m) => ({ default: m.Analyser })),
);
const ControlPanel = lazy(() =>
  import("@/components/analyser/ControlPanel").then((m) => ({ default: m.ControlPanel })),
);
const Shortcuts = lazy(() =>
  import("@/components/analyser/Shortcuts").then((m) => ({ default: m.Shortcuts })),
);

export function App() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#05060a] text-white">
      {mounted && (
        <Suspense fallback={null}>
          <Analyser />
          <ControlPanel />
          <Shortcuts />
        </Suspense>
      )}
    </main>
  );
}
