/** Ids flow into composite doc ids (`a__b__role`) and Firestore paths; `/` and `__`
 *  would traverse paths or collide ids, so reject them. */
export function isCleanId(value: unknown): value is string {
  return (
    typeof value === "string" && value.length > 0 && !value.includes("/") && !value.includes("__")
  );
}
