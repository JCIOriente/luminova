import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSelfProfileLane } from "./rules-locked-fields.mjs";

const lane = (commentLines) => `
    function selfProfileValid(changed) {
      let d = request.resource.data;
${commentLines}
      return changed.hasOnly(['name', 'profession', 'phone'])
        && (!changed.hasAny(['profession'])
          || (d.get('profession', '') is string && d.get('profession', '').size() <= 80))
        && (!changed.hasAny(['phone'])
          || (d.get('phone', '') == '' || d.get('phone', '').matches('^[23467][0-9]{7}$')));
    }
`;

test("reads the self lane's key set and bounds", () => {
  assert.deepEqual(parseSelfProfileLane(lane("")), {
    fields: ["name", "profession", "phone"],
    professionMax: 80,
    phonePattern: "^[23467][0-9]{7}$",
  });
});

test("ignores a comment line that mentions the phone pattern or profession bound", () => {
  const parsed = parseSelfProfileLane(
    lane(
      "      // phone matches('^x$') was the old pattern\n      // profession size() <= 10 once",
    ),
  );
  assert.equal(parsed.phonePattern, "^[23467][0-9]{7}$");
  assert.equal(parsed.professionMax, 80);
});
