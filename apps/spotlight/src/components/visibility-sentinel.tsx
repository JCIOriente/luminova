// Stands in for a below-fold section while its data loads (or when there is nothing to
// show). It must stay in the DOM and keep a height so the on-visible observer can fire;
// the section replaces it only once there is something to render, leaving no empty gap.
export function VisibilitySentinel({ ref }: { ref: (node: Element | null) => void }) {
  return <div ref={ref} aria-hidden style={{ height: 1 }} />;
}
