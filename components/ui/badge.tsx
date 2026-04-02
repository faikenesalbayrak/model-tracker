import * as React from "react";

type BadgeProps = React.HTMLAttributes<HTMLSpanElement>;

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { className = "", ...props },
  ref,
) {
  return (
    <span
      ref={ref}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`.trim()}
      {...props}
    />
  );
});
