import { cn } from "../lib/cn";
import logoColor from "../assets/logo-color.png";
import logoOnDark from "../assets/logo-on-dark.png";
import logoOnBlue from "../assets/logo-on-blue.png";
import logoBlack from "../assets/logo-black.png";

type LogoVariant = "default" | "inverted" | "on-blue" | "mono";
type LogoSize = "sm" | "md" | "lg";

const SRC: Record<LogoVariant, string> = {
  default: logoColor,
  inverted: logoOnDark,
  "on-blue": logoOnBlue,
  mono: logoBlack,
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
      alt="JCI Oriente"
      width={600}
      height={600}
      loading={loading}
      className={cn(
        "block w-auto",
        size === "lg" ? "h-[92px]" : size === "sm" ? "h-[34px]" : "h-11",
      )}
    />
  );
}
