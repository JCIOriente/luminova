import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="container">
        <h1 className="t-display">JCI Oriente</h1>
        <p className="t-subtitle" style={{ marginTop: 16 }}>
          Página de inicio — en construcción.
        </p>
      </div>
    </section>
  );
}
