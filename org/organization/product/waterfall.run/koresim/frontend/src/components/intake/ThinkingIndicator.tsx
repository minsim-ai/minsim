import { useEffect, useRef, useState } from "react";
import { BrailleBreathe } from "@zane-chen/agents-are-thinking";

export function ThinkingIndicator() {
  const [frame, setFrame] = useState("");
  const effectRef = useRef<BrailleBreathe | null>(null);

  useEffect(() => {
    const effect = new BrailleBreathe();
    effectRef.current = effect;
    let last = 0;
    let raf = 0;

    const tick = (timestamp: number) => {
      if (timestamp - last >= 100) {
        setFrame(effect.step());
        last = timestamp;
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      effect.free();
    };
  }, []);

  return (
    <span className="ks-thinking-indicator" aria-label="AI가 응답을 정리하는 중">
      {frame}
    </span>
  );
}
