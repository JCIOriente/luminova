const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
};

const TOKEN = /__[A-Z][A-Z0-9_]*__/g;

function escapeHtml(value: string): string {
  return value.replace(/[&"<>]/g, (char) => HTML_ESCAPES[char] ?? char);
}

/** Fills `__KEY__` placeholders and fails if any token is left unfilled. */
export function renderHtml(html: string, values: Readonly<Record<string, string>>): string {
  let rendered = html;
  for (const [key, value] of Object.entries(values)) {
    rendered = rendered.replaceAll(`__${key}__`, escapeHtml(value));
  }
  const leftovers = [...new Set(rendered.match(TOKEN))];
  if (leftovers.length > 0) {
    throw new Error(`index.html has unfilled brand placeholders: ${leftovers.join(", ")}`);
  }
  return rendered;
}
