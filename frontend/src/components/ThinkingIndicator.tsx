import { useEffect, useState } from "react";
import { BrailleBreathe } from "@zane-chen/agents-are-thinking";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

type ThinkingIndicatorProps = {
  className?: string;
  /** Screen reader label. Pass null when nearby text already conveys the waiting state. */
  label?: string | null;
};

export function ThinkingIndicator({
  className,
  label = "AI가 응답을 정리하는 중",
}: ThinkingIndicatorProps) {
  const [frame, setFrame] = useState("");
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const effect = new BrailleBreathe();

    if (reducedMotion) {
      setFrame(effect.step());
      effect.free();
      return;
    }

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
  }, [reducedMotion]);

  return (
    <span
      className={className ? `ks-thinking-indicator ${className}` : "ks-thinking-indicator"}
      aria-label={label ?? undefined}
      aria-hidden={label === null ? true : undefined}
    >
      {frame}
    </span>
  );
}
