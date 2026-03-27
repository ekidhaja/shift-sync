import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

type CardSectionProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-zinc-200 bg-white shadow-sm ${className}`}
      {...props}
    />
  );
}

export function CardHeader({ className = "", ...props }: CardSectionProps) {
  return (
    <div className={`border-b border-zinc-100 px-6 py-4 ${className}`} {...props} />
  );
}

export function CardContent({ className = "", ...props }: CardSectionProps) {
  return <div className={`px-6 py-4 ${className}`} {...props} />;
}
