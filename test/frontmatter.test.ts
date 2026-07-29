import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Frontmatter, FrontmatterValue, TicketDocument } from "../src/core/frontmatter.js";

const TICKET_TEXT = [
    "---",
    "id: nid_aaaaaaaaaaaaaaaaaaaaaaaaa_e",
    'title: "He said \\"hi\\" and C:\\\\path"',
    "status: open",
    "deps: []",
    "tags: [x, y]",
    "created_iso: 2026-07-29T22:00:00Z",
    "---",
    "",
    "body line",
    "",
].join("\n");

describe("FrontmatterValue", () => {
    it("strips only the surrounding double quotes", () => {
        assert.equal(FrontmatterValue.unquote('"My Title"'), "My Title");
    });

    it("leaves inner escapes exactly as stored on disk", () => {
        assert.equal(FrontmatterValue.unquote('"He said \\"hi\\""'), 'He said \\"hi\\"');
    });

    it("leaves an unquoted value untouched", () => {
        assert.equal(FrontmatterValue.unquote("open"), "open");
    });

    it("does not treat a lone double quote as a quoted value", () => {
        assert.equal(FrontmatterValue.unquote('"'), '"');
    });

    it("parses an inline array", () => {
        assert.deepEqual(FrontmatterValue.parseArray("[a, b]"), ["a", "b"]);
    });

    it("parses an inline array without spaces", () => {
        assert.deepEqual(FrontmatterValue.parseArray("[a,b]"), ["a", "b"]);
    });

    it("parses an empty array", () => {
        assert.deepEqual(FrontmatterValue.parseArray("[]"), []);
    });

    it("treats a whitespace-only array as empty", () => {
        assert.deepEqual(FrontmatterValue.parseArray("[ ]"), []);
    });

    it("drops empty items rather than emitting a hole", () => {
        assert.deepEqual(FrontmatterValue.parseArray("[a, , b]"), ["a", "b"]);
    });

    it("serializes an array in the on-disk inline form", () => {
        assert.equal(FrontmatterValue.serializeArray(["a", "b"]), "[a, b]");
    });

    it("classifies a bracketed value as an array", () => {
        assert.equal(FrontmatterValue.isArray("[a]"), true);
    });

    it("does not classify a quoted value as an array", () => {
        assert.equal(FrontmatterValue.isArray('"[a]"'), false);
    });
});

describe("Frontmatter", () => {
    const frontmatter = TicketDocument.parse(TICKET_TEXT).frontmatter;

    it("reads a scalar field", () => {
        assert.equal(frontmatter.getString("status"), "open");
    });

    it("reads an array field", () => {
        assert.deepEqual(frontmatter.getArray("tags"), ["x", "y"]);
    });

    it("returns an empty array for an absent array field", () => {
        assert.deepEqual(frontmatter.getArray("links"), []);
    });

    it("keeps a value that contains a colon-space intact", () => {
        const parsed = TicketDocument.parse(['---', 'colonval: "a: b"', "---", ""].join("\n"));
        assert.equal(parsed.frontmatter.getString("colonval"), "a: b");
    });

    it("keeps a timestamp value with inner colons intact", () => {
        assert.equal(frontmatter.getString("created_iso"), "2026-07-29T22:00:00Z");
    });

    it("exposes fields in file order", () => {
        assert.deepEqual(
            frontmatter.entries().map((entry) => entry.key),
            ["id", "title", "status", "deps", "tags", "created_iso"],
        );
    });

    it("ignores lines that do not start with an ASCII letter", () => {
        const parsed = TicketDocument.parse(["---", "id: x", "  indented: y", "- item", "---", ""].join("\n"));
        assert.deepEqual(
            parsed.frontmatter.entries().map((entry) => entry.key),
            ["id"],
        );
    });

    it("replaces an existing field in place, preserving key order", () => {
        const updated = frontmatter.withField("status", "closed");
        assert.deepEqual(
            updated.entries().map((entry) => entry.key),
            ["id", "title", "status", "deps", "tags", "created_iso"],
        );
    });

    it("writes the new value of a replaced field", () => {
        assert.equal(frontmatter.withField("status", "closed").getString("status"), "closed");
    });

    // Parity: bash `update_yaml_field` inserts after the opening `---`.
    it("inserts a brand new field as the FIRST entry", () => {
        const updated = frontmatter.withField("closed_iso", "2026-01-01T00:00:00Z");
        assert.equal(updated.entries()[0]?.key, "closed_iso");
    });

    it("removes a field", () => {
        assert.equal(frontmatter.withoutField("tags").has("tags"), false);
    });

    it("removing an absent field is a no-op", () => {
        assert.deepEqual(frontmatter.withoutField("nope").toLines(), frontmatter.toLines());
    });

    it("builds the query record with values interpreted per field shape", () => {
        assert.deepEqual(frontmatter.toJsonRecord(), {
            id: "nid_aaaaaaaaaaaaaaaaaaaaaaaaa_e",
            title: 'He said \\"hi\\" and C:\\\\path',
            status: "open",
            deps: [],
            tags: ["x", "y"],
            created_iso: "2026-07-29T22:00:00Z",
        });
    });

    it("JSON-encodes a title the way bash escaped it", () => {
        assert.equal(
            JSON.stringify(frontmatter.toJsonRecord()["title"]),
            '"He said \\\\\\"hi\\\\\\" and C:\\\\\\\\path"',
        );
    });

    it("builds a block from entries", () => {
        const built = Frontmatter.fromEntries([{ key: "id", rawValue: "x" }]);
        assert.deepEqual(built.toLines(), ["id: x"]);
    });
});

describe("TicketDocument", () => {
    it("round-trips unchanged text byte for byte", () => {
        assert.equal(TicketDocument.parse(TICKET_TEXT).text(), TICKET_TEXT);
    });

    it("exposes the body after the closing marker", () => {
        assert.equal(TicketDocument.parse(TICKET_TEXT).body(), "\nbody line\n");
    });

    it("keeps the body when the frontmatter changes", () => {
        const parsed = TicketDocument.parse(TICKET_TEXT);
        const updated = parsed.withFrontmatter(parsed.frontmatter.withField("status", "closed"));
        assert.equal(updated.body(), parsed.body());
    });

    it("does not treat a later --- in the body as frontmatter", () => {
        const text = ["---", "id: x", "---", "", "body", "---", "not: frontmatter", ""].join("\n");
        assert.deepEqual(
            TicketDocument.parse(text).frontmatter.entries().map((entry) => entry.key),
            ["id"],
        );
    });

    it("treats an unterminated block as running to EOF, like the bash reader", () => {
        const text = ["---", "id: x", "status: open"].join("\n");
        assert.equal(TicketDocument.parse(text).frontmatter.getString("status"), "open");
    });

    it("yields no fields for a file without frontmatter", () => {
        assert.deepEqual(TicketDocument.parse("just a note\n").frontmatter.entries(), []);
    });

    it("returns a file without frontmatter unchanged", () => {
        assert.equal(TicketDocument.parse("just a note\n").text(), "just a note\n");
    });

    it("appends to the body", () => {
        const appended = TicketDocument.parse(TICKET_TEXT).withBodyAppended("\n## Notes\n");
        assert.equal(appended.body(), "\nbody line\n\n## Notes\n");
    });
});
