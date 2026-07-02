import { cn } from "../lib/cn";
import { initials } from "../lib/initials";

interface AvatarProps {
  src: string | null | undefined;
  name: string;
  size?: number;
  className?: string;
}

export function Avatar({ src, name, size = 40, className }: AvatarProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }
  return (
    <span
      style={{ width: size, height: size }}
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-jci-blue-25 font-semibold text-jci-navy",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
