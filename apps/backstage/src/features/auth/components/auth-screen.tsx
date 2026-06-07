import type { ReactNode } from "react";

interface AuthScreenProps {
  brand: ReactNode;
  children: ReactNode;
}

/** Split-screen auth shell: brand panel + animated form column. */
export function AuthScreen({ brand, children }: AuthScreenProps) {
  return (
    <div className="grid min-h-dvh grid-cols-1 bg-surface lg:grid-cols-[1.04fr_1fr]">
      {brand}
      <div className="flex animate-rise items-center justify-center overflow-y-auto bg-surface-2 px-6 py-12 motion-reduce:animate-none sm:px-10">
        {children}
      </div>
    </div>
  );
}
