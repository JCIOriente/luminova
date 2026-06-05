import type { CSSProperties, ReactNode } from "react";

interface SectionHeaderProps {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  align?: "left" | "center";
  onDark?: boolean;
  children?: ReactNode;
}

export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = "left",
  onDark = false,
  children,
}: SectionHeaderProps) {
  const alignStyle: CSSProperties =
    align === "center" ? { textAlign: "center", marginLeft: "auto", marginRight: "auto" } : {};
  return (
    <div className="section-header" style={{ maxWidth: 760, ...alignStyle }}>
      {eyebrow && (
        <div className="eyebrow" style={onDark ? { color: "var(--jci-teal)" } : undefined}>
          {eyebrow}
        </div>
      )}
      {title && (
        <h2 className="t-title" style={{ marginTop: 16, marginBottom: 0 }}>
          {title}
        </h2>
      )}
      {subtitle && (
        <p className="t-subtitle" style={{ marginTop: 20, marginBottom: 0 }}>
          {subtitle}
        </p>
      )}
      {children}
    </div>
  );
}
