import { cn } from "../lib/cn";
import { brand, logos } from "virtual:luminova-brand";

type LogoVariant = "default" | "inverted" | "on-blue";
type LogoSize = "sm" | "md" | "lg";

const SRC: Record<LogoVariant, string> = {
  default: logos.main,
  inverted: logos.onDark,
  "on-blue": logos.onPrimary,
};

export function LogoLockup({
  variant = "default",
  size = "md",
  loading = "eager",
}: {
  variant?: LogoVariant;
  size?: LogoSize;
  loading?: "eager" | "lazy";
}) {
  return (
    <img
      src={SRC[variant]}
      alt={brand.name}
      width={logos.width}
      height={logos.height}
      loading={loading}
      className={cn(
        "block w-auto",
        size === "lg" ? "h-[92px]" : size === "sm" ? "h-[34px]" : "h-11",
      )}
    />
  );
}
