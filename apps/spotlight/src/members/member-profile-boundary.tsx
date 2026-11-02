import { Component, type ReactNode } from "react";
import { Button } from "@luminova/ui";

interface Props {
  onClose: () => void;
  children: ReactNode;
}

/** Catches a dialog chunk that will not load, typically a stale hash after a deploy. Spotlight
 *  has no route error component, so it would otherwise replace the whole page. Eager, so it
 *  must not reach for Dialog. React caches a failed lazy import, so only a reload can fix it. */
export class MemberProfileBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(err: unknown) {
    console.error("member profile failed to load", err);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="member-load-error">
        <p>No se pudo abrir el perfil.</p>
        <Button as="button" onClick={() => window.location.reload()}>
          Recargar
        </Button>
        <Button as="button" variant="secondary" onClick={this.props.onClose}>
          Cerrar
        </Button>
      </div>
    );
  }
}
