import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/coverage/**",
      "**/routeTree.gen.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // App code must consume @luminova/ui for elements that have a shared
    // component. These elements always have an equivalent, so a raw tag is a
    // duplicate definition. (Raw <button> is intentionally allowed — Button is a
    // pill CTA, not a fit for icon/nav/tab buttons; those stay raw or get a
    // dedicated primitive. packages/ui itself is exempt: it owns the primitives.)
    files: ["apps/*/src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "**/*.test.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "JSXOpeningElement[name.name='input']",
          message: "Use <Input> from @luminova/ui instead of a raw <input>.",
        },
        {
          selector: "JSXOpeningElement[name.name='textarea']",
          message: "Use <Textarea> from @luminova/ui instead of a raw <textarea>.",
        },
        {
          selector: "JSXOpeningElement[name.name='select']",
          message: "Use <Select> from @luminova/ui instead of a raw <select>.",
        },
        {
          selector: "JSXOpeningElement[name.name='table']",
          message: "Use <Table> from @luminova/ui instead of a raw <table>.",
        },
      ],
    },
  },
);
