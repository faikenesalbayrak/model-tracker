import type { CSSProperties, ReactNode } from "react";

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
  const bubblePositionClass = center ? "left-1/2" : "left-0";
  const arrowPositionClass = center ? "left-1/2" : "left-3";

  return (
    <span className="relative inline-flex">
      <span className="group inline-flex items-center">
        <span>{label}</span>
        <span
          className={`tt-tooltip-bubble absolute ${bubblePositionClass} top-full z-30 mt-2 w-max max-w-[16rem] rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-medium normal-case leading-relaxed tracking-normal text-slate-700 shadow-[0_12px_30px_rgba(15,23,42,0.16)] backdrop-blur dark:border-white/15 dark:bg-slate-950/95 dark:text-slate-200`}
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
