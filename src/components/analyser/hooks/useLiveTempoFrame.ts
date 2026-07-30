import { useEffect, useState } from "react";
import { getLiveTempoFrame, type LiveTempoState } from "@spectrum-aura/engine/live-tempo";

/** Subscribe to the per-frame tempo bus (60fps) for smooth grid animation. */
export function useLiveTempoFrame(): LiveTempoState {
  const [state, setState] = useState(getLiveTempoFrame);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setState(getLiveTempoFrame());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return state;
}
