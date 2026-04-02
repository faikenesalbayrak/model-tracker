import * as React from "react";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  asChild?: boolean;
};

const baseClass =
  "inline-flex items-center justify-center rounded-[var(--radius-item)] border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2";

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className = "", type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${baseClass} ${className}`.trim()}
      {...props}
    />
  );
});
