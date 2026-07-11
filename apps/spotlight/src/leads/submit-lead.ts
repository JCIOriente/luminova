import { addDoc, collection, serverTimestamp } from "firebase/firestore/lite";
import { getFirestoreLite } from "@luminova/firebase/lite";
import { leadSchema, type LeadInput } from "@luminova/types";

/**
 * Persist a contact-form submission as a `leads` doc. This is the ONE write the
 * public site performs — the lite SDK write path mirrors the read in
 * site-config-firestore.ts. The server-owned fields (status/source/createdAt/
 * deletedAt) are pinned here to exactly what firestore.rules `leadCreateValid()`
 * requires; the 8-key shape must stay in sync with that rule.
 */
export async function submitLead(input: LeadInput): Promise<void> {
  const data = leadSchema.parse(input);
  const db = getFirestoreLite();
  await addDoc(collection(db, "leads"), {
    name: data.name,
    email: data.email,
    intent: data.intent,
    message: data.message,
    status: "Nuevo",
    source: "web",
    createdAt: serverTimestamp(),
    deletedAt: null,
  });
}
