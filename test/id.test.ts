import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { IdResolver, TicketId } from "../src/core/id.js";

const ALPHA = "nid_aaaaaaaaaaaaaaaaaaaaaaaaa_e";
const BETA = "nid_bbbbbbbbbbbbbbbbbbbbbbbbb_e";
/** Contains ALPHA's random part as a substring, so a partial can hit both. */
const ALPHA_SUPERSET = "nid_aaaaaaaaaaaaaaaaaaaaaaaaa_ex";

const resolver = new IdResolver([
    { id: ALPHA, path: "/t/a.md" },
    { id: BETA, path: "/t/b.md" },
]);

describe("TicketId.generate", () => {
    it("matches the nid_<25 chars of [a-z0-9]>_e shape", () => {
        assert.match(TicketId.generate(), /^nid_[a-z0-9]{25}_e$/);
    });

    it("uses the whole alphabet, not a biased subset", () => {
        const chars = new Set(Array.from({ length: 200 }, () => TicketId.generate()).join("").split(""));
        assert.equal("abcdefghijklmnopqrstuvwxyz0123456789".split("").every((c) => chars.has(c)), true);
    });

    it("does not repeat", () => {
        const ids = new Set(Array.from({ length: 200 }, () => TicketId.generate()));
        assert.equal(ids.size, 200);
    });
});

describe("IdResolver", () => {
    it("resolves a full id", () => {
        assert.deepEqual(resolver.resolve(ALPHA), { kind: "resolved", candidate: { id: ALPHA, path: "/t/a.md" } });
    });

    it("resolves a unique partial id", () => {
        const resolution = resolver.resolve("aaaaa");
        assert.equal(resolution.kind === "resolved" && resolution.candidate.id, ALPHA);
    });

    it("trims surrounding whitespace", () => {
        const resolution = resolver.resolve(`  ${ALPHA}\n`);
        assert.equal(resolution.kind === "resolved" && resolution.candidate.id, ALPHA);
    });

    it("reports an unknown id as not found", () => {
        assert.deepEqual(resolver.resolve("nid_zzz"), { kind: "not-found", search: "nid_zzz" });
    });

    it("reports a partial matching several tickets as ambiguous", () => {
        assert.equal(resolver.resolve("nid_").kind, "ambiguous");
    });

    it("lists every ambiguous candidate", () => {
        const resolution = resolver.resolve("nid_");
        assert.deepEqual(resolution.kind === "ambiguous" && resolution.candidates.map((c) => c.id), [ALPHA, BETA]);
    });

    // Exact beats partial: the search string IS one ticket's id, so the fact that it is
    // also a substring of another id must not make it ambiguous.
    it("prefers an exact match over a substring match", () => {
        const withSuperset = new IdResolver([
            { id: ALPHA, path: "/t/a.md" },
            { id: ALPHA_SUPERSET, path: "/t/a2.md" },
        ]);
        const resolution = withSuperset.resolve(ALPHA);
        assert.equal(resolution.kind === "resolved" && resolution.candidate.id, ALPHA);
    });

    it("reports duplicate exact ids as ambiguous", () => {
        const duplicated = new IdResolver([
            { id: ALPHA, path: "/t/a.md" },
            { id: ALPHA, path: "/t/copy.md" },
        ]);
        assert.equal(duplicated.resolve(ALPHA).kind, "ambiguous");
    });

    /**
     * DIVERGENCE (deliberate, ticket nid_5g3eta9cf7yi6iukmscxma6wc_e): awk
     * `index(s, "")` is 1, so bash resolves `""` to the sole ticket in a one-ticket repo
     * and reports "ambiguous" otherwise. Here an empty search never resolves, in a repo
     * of any size, so `tk close "$UNSET_VAR"` cannot mutate an arbitrary ticket.
     */
    it("does not match everything on an empty search", () => {
        assert.equal(resolver.resolve("").kind, "not-found");
    });

    it("does not resolve an empty search even when only one ticket exists", () => {
        assert.equal(new IdResolver([{ id: ALPHA, path: "/t/a.md" }]).resolve("").kind, "not-found");
    });

    it("does not resolve a whitespace-only search", () => {
        assert.equal(resolver.resolve("   ").kind, "not-found");
    });

    it("reports not found when there are no tickets", () => {
        assert.equal(new IdResolver([]).resolve(ALPHA).kind, "not-found");
    });
});
