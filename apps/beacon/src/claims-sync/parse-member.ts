import type { TermPositions } from "@luminova/types";
import { isValidPermissionCode, type PermissionCode } from "@luminova/types/permission";
import { truncateForLog, type LogSink } from "../firestore-util.js";

export interface SafeMember {
  uid?: string;
  positions: Record<string, TermPositions>;
  roleIds: string[];
  permissionOverrides: { grant: PermissionCode[]; revoke: PermissionCode[] };
}

/** Member fields the claims-sync needs — used to project member-collection scans. */
export const MEMBER_SYNC_FIELDS = ["uid", "positions", "roleIds", "permissionOverrides"] as const;

/** Who to blame and where to say it, for the drops below.
 *
 *  REQUIRED, not optional: an optional sink compiles fine at a future call site that forgets
 *  it, silently reinstating the exact silent-drop bug this parameter was added to close. Tests
 *  that only exercise pure parse behavior pass a no-op `silent()` context (see
 *  parse-member.test.ts) instead of getting a free pass to omit one. */
export interface MemberParseContext {
  /** The Firestore doc id (`members/{id}`), NOT `member.uid`. Both are handles on the same
   *  doc, but only the doc id survives what is being reported here: `uid` is itself one of the
   *  fields this parser can find absent or non-string, so a line keyed on it would be blank
   *  for exactly the docs an operator has to open. Every call site has the doc id
   *  unconditionally (`event.params.id` / `doc.id`); none has a trustworthy uid yet. Matches
   *  the `memberId` field the sibling fan-out lines in index.ts already use. */
  memberId: string;
  logError: LogSink;
}

/** Malformed entries named in one line, per collection. Same rationale as REJECTED_ID_SAMPLE
 *  in firestore-deps.ts, one axis over: `positions` is a map with no key-count cap in
 *  firestore.rules, so a console or migration write can produce arbitrarily many bad term
 *  entries. One line per entry would be arbitrarily many Cloud Logging entries per member
 *  write; serializing all of them into one would push that entry past the 256 KB limit and get
 *  it DROPPED. The count is the alertable signal, the sample is for diagnosis. */
const DROPPED_ENTRY_SAMPLE = 10;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function permissionCodes(v: unknown): PermissionCode[] {
  return Array.isArray(v) ? v.filter((x): x is PermissionCode => isValidPermissionCode(x)) : [];
}

/** `typeof`, but distinguishing the two shapes that matter most here and that `typeof` calls
 *  `"object"`: an array (a `positions` written as a list) and an explicit null. */
function shapeOf(v: unknown): string {
  return Array.isArray(v) ? "array" : v === null ? "null" : typeof v;
}

/** ABSENT, for every field below: `undefined` or an explicit `null`. Both are the ordinary
 *  shape of an ordinary member — and null specifically is admitted by the rules'
 *  unchanged()/touched() gap (see hasDirectGrants in provision-member-login.ts), so it reaches
 *  here on real docs. Neither is an anomaly, and logging them would fire on nearly every
 *  member write, burying the anomalies in the noise. Same reason the `rejectedCargoId !== null`
 *  guard in sync.ts exists. */
function isAbsent(v: unknown): boolean {
  return v === undefined || v === null;
}

/** Extract a structurally-safe member from raw Firestore data. Malformed term
 *  entries are dropped (not thrown) so a bad doc can't cause a retry storm.
 *  An absent comisionIds defaults to [] (the cargo grant is still honored);
 *  a present-but-malformed comisionIds drops the entry. roleIds defaults to []
 *  when absent/malformed; override codes are filtered to the known vocabulary.
 *
 *  DROPPED IS NOT SILENT (guardrail #4). Every drop below is a fail-closed decision taken on
 *  data no client could have written — firestore.rules type-checks none of these fields — and
 *  the consequences are load-bearing: dropping one malformed `comisionIds` discards the whole
 *  term entry, `cargoId` and `assignedBy` with it, which reads downstream as "holds no seat"
 *  and strips a sitting president's Admin role from their claims on their next member write.
 *  Nothing further down can report that, because by then the shape is gone. So each drop emits
 *  one bounded line here, keyed on the doc id, carrying ids/types/counts only — never the doc,
 *  never PII. `context` is required — see MemberParseContext for why. */
export function parseMember(raw: unknown, context: MemberParseContext): SafeMember {
  const data = (raw ?? {}) as {
    uid?: unknown;
    positions?: unknown;
    roleIds?: unknown;
    permissionOverrides?: unknown;
  };
  const report = (message: string, meta: Record<string, unknown>): void => {
    context.logError(message, { memberId: truncateForLog(context.memberId), ...meta });
  };

  const uid = typeof data.uid === "string" ? data.uid : undefined;
  if (uid === undefined && !isAbsent(data.uid)) {
    // Reported, not just dropped: both fan-outs skip a member with no uid via `if
    // (!member.uid) continue`, so a non-string uid removes that member from the sync
    // ENTIRELY — the one drop here that costs a member every grant at once.
    report(
      "claims-sync: member uid is present but not a string — the member reads as unprovisioned, so their claims are never synced",
      {
        uidType: shapeOf(data.uid),
      },
    );
  }

  const positions: Record<string, TermPositions> = {};
  const droppedTerms: { term: string; reason: string }[] = [];
  if (!isAbsent(data.positions)) {
    if (typeof data.positions !== "object" || Array.isArray(data.positions)) {
      report(
        "claims-sync: member positions is not a map — every term entry is dropped, so no cargo grants are minted",
        {
          positionsType: shapeOf(data.positions),
        },
      );
    } else {
      for (const [term, value] of Object.entries(data.positions as Record<string, unknown>)) {
        const v = value as { cargoId?: unknown; comisionIds?: unknown; assignedBy?: unknown };
        // `Array.isArray` folded in: `typeof [] === "object"`, so a term written as a list
        // used to fall through to the cargoId screen and be dropped there under a reason that
        // named the wrong field. Same drop, honest reason.
        if (!v || typeof v !== "object" || Array.isArray(v)) {
          droppedTerms.push({ term, reason: `term-entry-not-a-map:${shapeOf(value)}` });
          continue;
        }
        const cargoId =
          typeof v.cargoId === "string" ? v.cargoId : v.cargoId === null ? null : undefined;
        if (cargoId === undefined) {
          // `cargoId: null` is the ordinary no-seat shape and is KEPT, not dropped — it never
          // reaches here. An ABSENT cargoId does: the client mapper always writes the key
          // (member-mapper.ts), so a term entry without it is a console/migration artifact.
          droppedTerms.push({ term, reason: `cargo-id-not-a-string:${shapeOf(v.cargoId)}` });
          continue;
        }
        if (v.comisionIds !== undefined && !isStringArray(v.comisionIds)) {
          droppedTerms.push({
            term,
            reason: `comision-ids-not-a-string-array:${shapeOf(v.comisionIds)}`,
          });
          continue;
        }
        positions[term] = {
          cargoId,
          comisionIds: isStringArray(v.comisionIds) ? v.comisionIds : [],
          ...(typeof v.assignedBy === "string" ? { assignedBy: v.assignedBy } : {}),
        };
      }
    }
  }
  if (droppedTerms.length > 0) {
    report(
      "claims-sync: member position entries are malformed — each is dropped WHOLE, so its cargoId and assignedBy mint no grants",
      {
        droppedCount: droppedTerms.length,
        dropped: droppedTerms
          .slice(0, DROPPED_ENTRY_SAMPLE)
          .map((d) => ({ term: truncateForLog(d.term), reason: d.reason })),
      },
    );
  }

  const roleIds = isStringArray(data.roleIds) ? data.roleIds : [];
  if (!isAbsent(data.roleIds) && !isStringArray(data.roleIds)) {
    // The WHOLE array goes, valid entries included — which is also why the
    // "roleIds entries cannot be a doc id" screen in firestore-deps.ts can never see a
    // mixed-type array: it is replaced by [] here, upstream of it.
    report(
      "claims-sync: member roleIds is not an array of strings — the WHOLE array is dropped, so no custom role grants any perms",
      {
        roleIdsType: shapeOf(data.roleIds),
        entryCount: Array.isArray(data.roleIds) ? data.roleIds.length : null,
        nonStringCount: Array.isArray(data.roleIds)
          ? data.roleIds.filter((x) => typeof x !== "string").length
          : null,
      },
    );
  }

  const rawOverrides = (data.permissionOverrides ?? {}) as { grant?: unknown; revoke?: unknown };
  const permissionOverrides = {
    grant: permissionCodes(rawOverrides.grant),
    revoke: permissionCodes(rawOverrides.revoke),
  };
  const overrideProblems: { field: string; reason: string; valueType?: string; count?: number }[] =
    [];
  if (!isAbsent(data.permissionOverrides)) {
    if (typeof data.permissionOverrides !== "object" || Array.isArray(data.permissionOverrides)) {
      overrideProblems.push({
        field: "permissionOverrides",
        reason: "not-a-map",
        valueType: shapeOf(data.permissionOverrides),
      });
    } else {
      for (const field of ["grant", "revoke"] as const) {
        const value = rawOverrides[field];
        if (isAbsent(value)) continue;
        if (!Array.isArray(value)) {
          overrideProblems.push({ field, reason: "not-an-array", valueType: shapeOf(value) });
          continue;
        }
        const rejected = value.filter((x) => !isValidPermissionCode(x)).length;
        if (rejected > 0) overrideProblems.push({ field, reason: "unknown-code", count: rejected });
      }
    }
  }
  if (overrideProblems.length > 0) {
    // At most three rows (the map itself, then grant and revoke), so no sampling needed. Codes
    // are counted, never serialized: a rejected code is by definition outside the vocabulary,
    // so its VALUE is unbounded free text off a console edit.
    report(
      "claims-sync: member permissionOverrides entries are malformed — dropped, so those grants and revocations are not applied",
      {
        problems: overrideProblems,
      },
    );
  }

  return { uid, positions, roleIds, permissionOverrides };
}
