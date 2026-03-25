import type { CSSProperties } from "react";

interface DotPatternProps {
  width?: number;
  height?: number;
  cr?: number;
  className?: string;
  style?: CSSProperties;
}

export function DotPattern({
  width = 20,
  height = 20,
  cr = 1,
  className,
  style,
}: DotPatternProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 h-full w-full overflow-hidden ${className ?? ""}`}
      style={{
        backgroundImage: `radial-gradient(circle at ${cr}px ${cr}px, currentColor ${cr}px, transparent 0)`,
        backgroundSize: `${width}px ${height}px`,
        ...style,
      }}
    />
  );
}
