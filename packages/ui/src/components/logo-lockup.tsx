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
}: {
  variant?: LogoVariant;
  size?: LogoSize;
}) {
  return (
    <img
      src={SRC[variant]}
      alt="JCI Oriente"
      className={cn("block w-auto", size === "lg" ? "h-24" : size === "sm" ? "h-9" : "h-11")}
    />
  );
}
