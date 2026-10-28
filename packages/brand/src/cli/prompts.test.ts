import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { terminalConfirm } from "./prompts.ts";

/** A stdin stand-in that already holds `reply`. */
function input(reply: string, isTTY: boolean): NodeJS.ReadStream {
  const stream = Object.assign(new PassThrough(), { isTTY });
  stream.end(reply);
  // A PassThrough with isTTY is all readline reads of a ReadStream.
  return stream as unknown as NodeJS.ReadStream;
}

const asked = (reply: string) => {
  const output = new PassThrough();
  let printed = "";
  output.on("data", (chunk: Buffer) => (printed += chunk.toString()));
  const confirm = terminalConfirm(input(reply, true), output);
  if (!confirm) throw new Error("expected a terminal");
  return confirm("Replace them?").then((answer) => ({ answer, printed }));
};

describe("terminalConfirm", () => {
  it("asks with the default shown, and only y or yes means yes", async () => {
    expect(await asked("y\n")).toEqual({ answer: true, printed: "Replace them? (y/N) " });
    expect((await asked("Yes\n")).answer).toBe(true);
    expect((await asked("\n")).answer).toBe(false);
    expect((await asked("n\n")).answer).toBe(false);
    expect((await asked("maybe\n")).answer).toBe(false);
  });

  it("is absent without a terminal, so a script is never asked", () => {
    expect(terminalConfirm(input("y\n", false), new PassThrough())).toBeUndefined();
  });
});
