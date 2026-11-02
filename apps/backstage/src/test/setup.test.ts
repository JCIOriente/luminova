import { setTimeout as delay } from "node:timers/promises";
import { expect, it } from "vitest";
import { collection, getDocs } from "firebase/firestore/lite";
import { getDb } from "@luminova/firebase/db";

it("an unmocked Firestore read never settles", async () => {
  const outcome = await Promise.race([
    getDocs(collection(getDb(), "roles")).then(
      () => "settled",
      () => "settled",
    ),
    delay(1500).then(() => "pending"),
  ]);

  expect(outcome).toBe("pending");
});
