"use client";

import { useCallback, useRef, type CSSProperties, type ReactNode } from "react";

type ColumnTooltipLabelProps = {
  center?: boolean;
  description: string;
  label: ReactNode;
};

export function ColumnTooltipLabel({
  center = false,
  description,
  label,
}: ColumnTooltipLabelProps) {
  const bubbleRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);

  // Compute fixed position from the trigger's viewport rect on hover.
  // position:fixed removes the bubble from any ancestor's scrollWidth calculation.
  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !bubbleRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    bubbleRef.current.style.top = `${rect.bottom + 8}px`;
    bubbleRef.current.style.left = center
      ? `${rect.left + rect.width / 2}px`
      : `${rect.left}px`;
  }, [center]);

  const arrowPositionClass = center ? "left-1/2" : "left-3";

  return (
    <span className="inline-flex" onMouseEnter={updatePosition}>
      <span ref={triggerRef} className="group inline-flex items-center">
        <span>{label}</span>
        <span
          ref={bubbleRef}
          className="tt-tooltip-bubble fixed z-50 w-max max-w-[16rem] rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-medium normal-case leading-relaxed tracking-normal text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.16)] backdrop-blur dark:border-white/15 dark:bg-slate-950/95 dark:text-slate-200"
          role="tooltip"
          style={{ "--tt-tooltip-x": center ? "-50%" : "0%" } as CSSProperties}
        >
          {description}
          <span
            className={`tt-tooltip-arrow absolute ${arrowPositionClass} top-0 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border-l border-t border-slate-200/90 bg-white/95 dark:border-white/15 dark:bg-slate-950/95`}
          />
        </span>
      </span>
    </span>
  );
}
