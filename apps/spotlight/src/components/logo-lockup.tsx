type LogoVariant = "default" | "inverted" | "on-blue" | "mono";
type LogoSize = "sm" | "md" | "lg";

const SRC: Record<LogoVariant, string> = {
  inverted: "/assets/logo-on-dark.png",
  "on-blue": "/assets/logo-on-blue.png",
  mono: "/assets/logo-black.png",
  default: "/assets/logo-color.png",
};

export function LogoLockup({
  variant = "default",
  size = "md",
}: {
  variant?: LogoVariant;
  size?: LogoSize;
}) {
  const cls = size === "lg" ? "lockup-img lg" : size === "sm" ? "lockup-img sm" : "lockup-img";
  return <img src={SRC[variant]} alt="JCI Oriente" className={cls} />;
}
