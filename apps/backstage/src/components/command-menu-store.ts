let open = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function getCommandMenuOpen(): boolean {
  return open;
}

export function setCommandMenuOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  emit();
}

export function toggleCommandMenu(): void {
  setCommandMenuOpen(!open);
}

export function openCommandMenu(): void {
  setCommandMenuOpen(true);
}

export function subscribeCommandMenu(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
