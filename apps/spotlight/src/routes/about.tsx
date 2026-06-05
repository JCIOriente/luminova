import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/about")({
  component: About,
});

function About() {
  return (
    <section className="section" style={{ paddingTop: 140 }}>
      <div className="container">
        <h1 className="t-title">Quiénes Somos</h1>
        <p className="t-subtitle" style={{ marginTop: 16 }}>
          En construcción.
        </p>
      </div>
    </section>
  );
}
