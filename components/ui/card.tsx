import * as React from "react";

type DivProps = React.HTMLAttributes<HTMLDivElement>;

export const Card = React.forwardRef<HTMLDivElement, DivProps>(function Card(
  { className = "", ...props },
  ref,
) {
  return <div ref={ref} className={`rounded-[var(--radius-card)] border ${className}`.trim()} {...props} />;
});

export const CardHeader = React.forwardRef<HTMLDivElement, DivProps>(function CardHeader(
  { className = "", ...props },
  ref,
) {
  return <div ref={ref} className={`p-4 ${className}`.trim()} {...props} />;
});

export const CardContent = React.forwardRef<HTMLDivElement, DivProps>(function CardContent(
  { className = "", ...props },
  ref,
) {
  return <div ref={ref} className={`px-4 pb-4 ${className}`.trim()} {...props} />;
});

export const CardFooter = React.forwardRef<HTMLDivElement, DivProps>(function CardFooter(
  { className = "", ...props },
  ref,
) {
  return <div ref={ref} className={`px-4 pb-4 pt-1 ${className}`.trim()} {...props} />;
});
