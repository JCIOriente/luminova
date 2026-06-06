import { QRCodeSVG } from "qrcode.react";

export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
}

/** Renders a QR code SVG for an arbitrary string. Generic — no domain knowledge. */
export function QrCode({ value, size = 192, className }: QrCodeProps) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      level="M"
      marginSize={2}
      className={className}
      role="img"
      aria-label="Código QR"
    />
  );
}
