"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
    arrowLeft: number;
    placement: "top" | "bottom";
  } | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || typeof window === "undefined") return;

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const preferredWidth = 288;
    const width = Math.min(preferredWidth, window.innerWidth - viewportPadding * 2);
    const anchorX = center ? rect.left + rect.width / 2 : rect.left + 16;
    const unclampedLeft = center ? anchorX - width / 2 : rect.left;
    const left = clamp(unclampedLeft, viewportPadding, window.innerWidth - width - viewportPadding);
    const placeBelow = rect.top < 84;
    const top = placeBelow ? rect.bottom + 10 : rect.top - 10;
    const arrowLeft = clamp(anchorX - left, 14, width - 14);

    setPosition({
      top,
      left,
      width,
      arrowLeft,
      placement: placeBelow ? "bottom" : "top",
    });
  }, [center]);

  useEffect(() => {
    if (!open) return;

    const listener = () => updatePosition();
    window.addEventListener("resize", listener);
    window.addEventListener("scroll", listener, true);
    return () => {
      window.removeEventListener("resize", listener);
      window.removeEventListener("scroll", listener, true);
    };
  }, [open, updatePosition]);

  const bubble = useMemo(() => {
    if (typeof document === "undefined" || !open || !position) return null;
    const bubbleStyle = {
      left: `${position.left}px`,
      top: `${position.top}px`,
      width: `${position.width}px`,
      transform: position.placement === "top" ? "translateY(-100%)" : "translateY(0)",
    } as CSSProperties;
    const arrowStyle = {
      left: `${position.arrowLeft}px`,
    } as CSSProperties;

    return createPortal(
      <span
        className="pointer-events-none fixed z-[9999] rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-medium normal-case leading-relaxed tracking-normal text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.16)] backdrop-blur transition-opacity duration-150 dark:border-white/15 dark:bg-slate-950/95 dark:text-slate-200"
        role="tooltip"
        style={bubbleStyle}
      >
        {description}
        <span
          className={`absolute h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-white/95 dark:bg-slate-950/95 ${position.placement === "top"
            ? "bottom-0 translate-y-1/2 border-b border-r border-slate-200/90 dark:border-white/15"
            : "top-0 -translate-y-1/2 border-l border-t border-slate-200/90 dark:border-white/15"
            }`}
          style={arrowStyle}
        />
      </span>,
      document.body,
    );
  }, [description, open, position]);

  return (
    <span className="inline-flex">
      <span
        ref={triggerRef}
        className="inline-flex items-center"
        onBlur={() => setOpen(false)}
        onFocus={() => {
          updatePosition();
          setOpen(true);
        }}
        onMouseEnter={() => {
          updatePosition();
          setOpen(true);
        }}
        onMouseLeave={() => setOpen(false)}
      >
        <span>{label}</span>
      </span>
      {bubble}
    </span>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
