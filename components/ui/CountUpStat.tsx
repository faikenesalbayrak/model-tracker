"use client";

import { useEffect, useRef, useState } from "react";

interface CountUpStatProps {
  value: number;
  duration?: number;
}

export function CountUpStat({ value, duration = 1400 }: CountUpStatProps) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);

  useEffect(() => {
    let resetFrame = 0;

    if (started.current) {
      // Reset when value changes
      started.current = false;
      resetFrame = requestAnimationFrame(() => {
        setDisplay(0);
      });
    }

    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        observer.disconnect();

        const startTime = performance.now();
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

        const tick = (now: number) => {
          const progress = Math.min((now - startTime) / duration, 1);
          setDisplay(Math.floor(easeOut(progress) * value));
          if (progress < 1) requestAnimationFrame(tick);
        };

        requestAnimationFrame(tick);
      },
      { threshold: 0.3 },
    );

    observer.observe(el);
    return () => {
      observer.disconnect();
      if (resetFrame) {
        cancelAnimationFrame(resetFrame);
      }
    };
  }, [value, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {display}
    </span>
  );
}
