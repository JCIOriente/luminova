import type { z } from "zod";

/** Structural subset of QueryDocumentSnapshot/DocumentSnapshot — keeps the
 *  parsers unit-testable without Firestore fakes. */
interface SnapshotLike {
  id: string;
  ref: { parent: { id: string } };
  data(): unknown;
}

interface QuerySnapshotLike {
  docs: SnapshotLike[];
}

/** A doc failed its read-schema. Thrown on single-doc reads so the failure
 *  surfaces as the query error state instead of a raw-cast crash mid-render. */
export class DocParseError extends Error {
  constructor(
    readonly collection: string,
    readonly docId: string,
    readonly issues: z.core.$ZodIssue[],
  ) {
    super(`Malformed ${collection} doc ${docId}`);
    this.name = "DocParseError";
  }
}

/** Parse a singleton doc (no id field on the entity, e.g. siteConfig/current). */
export function parseDocData<T>(schema: z.ZodType<T>, snap: SnapshotLike): T {
  const result = schema.safeParse(snap.data());
  if (!result.success) {
    throw new DocParseError(snap.ref.parent.id, snap.id, result.error.issues);
  }
  return result.data;
}

/** Parse one doc and inject its id. Throws DocParseError on schema mismatch. */
export function parseDoc<T extends object>(
  schema: z.ZodType<T>,
  snap: SnapshotLike,
): { id: string } & T {
  return { id: snap.id, ...parseDocData(schema, snap) };
}

/** Parse a query result. A malformed doc is logged and skipped — one bad doc
 *  must not blank a whole admin table — while staying observable in the log. */
export function parseDocs<T extends object>(
  schema: z.ZodType<T>,
  snapshot: QuerySnapshotLike,
): ({ id: string } & T)[] {
  const rows: ({ id: string } & T)[] = [];
  for (const doc of snapshot.docs) {
    const result = schema.safeParse(doc.data());
    if (result.success) {
      rows.push({ id: doc.id, ...result.data });
    } else {
      console.error(
        `[backstage] Malformed ${doc.ref.parent.id} doc skipped: ${doc.id}`,
        result.error.issues,
      );
    }
  }
  return rows;
}
