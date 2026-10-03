---
paths:
  - "packages/types/src/**/*.ts"
---

# Doc schemas (parse-on-read)

- A field added to a model type (e.g. `Member`) must also be added to its `*-doc-schema.ts`. The `satisfies z.ZodType<Omit<T, "id">>` check does not catch a missing **optional** field, and parse-on-read silently strips it.
- zod: `.nullable()` ≠ `.optional()`; match how the field is actually written.
