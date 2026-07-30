import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_PRIORITY, Ticket } from "../src/core/ticket.js";

const PATH = "/t/sample.md";

const TEXT = [
    "---",
    "id: nid_sample_e",
    'title: "Sample"',
    "status: in_progress",
    "deps: [nid_a_e, nid_b_e]",
    "links: []",
    "tags: [ui, backend]",
    "type: bug",
    "priority: 0",
    "assignee: Some One",
    "parent: nid_parent_e",
    "---",
    "",
    "The body.",
    "",
].join("\n");

const ticket = Ticket.parse(PATH, TEXT);

describe("Ticket accessors", () => {
    it("reads the id", () => {
        assert.equal(ticket.id, "nid_sample_e");
    });

    it("reads the title without quotes", () => {
        assert.equal(ticket.title, "Sample");
    });

    it("reads the status", () => {
        assert.equal(ticket.status, "in_progress");
    });

    it("reads deps", () => {
        assert.deepEqual(ticket.deps, ["nid_a_e", "nid_b_e"]);
    });

    it("reads an empty links array", () => {
        assert.deepEqual(ticket.links, []);
    });

    it("reads tags", () => {
        assert.deepEqual(ticket.tags, ["ui", "backend"]);
    });

    it("reads the priority", () => {
        assert.equal(ticket.priority, "0");
    });

    it("reads the assignee, spaces included", () => {
        assert.equal(ticket.assignee, "Some One");
    });

    it("reads the parent", () => {
        assert.equal(ticket.parent, "nid_parent_e");
    });

    it("reads the body", () => {
        assert.equal(ticket.body, "\nThe body.\n");
    });

    it("answers hasTag", () => {
        assert.equal(ticket.hasTag("ui"), true);
    });

    it("answers hasTag negatively for a tag prefix", () => {
        assert.equal(ticket.hasTag("u"), false);
    });

    it("is not closed while in progress", () => {
        assert.equal(ticket.isClosed, false);
    });

    it("is closed when the status says so", () => {
        assert.equal(ticket.withField("status", "closed").isClosed, true);
    });

    it("is not finished while in progress", () => {
        assert.equal(ticket.isFinished, false);
    });

    it("is finished when closed", () => {
        assert.equal(ticket.withField("status", "closed").isFinished, true);
    });

    // The `closed` listing takes `done` too; dependency resolution deliberately does NOT.
    it("is finished on the legacy `done` status", () => {
        assert.equal(ticket.withField("status", "done").isFinished, true);
    });

    it("is NOT closed on the legacy `done` status", () => {
        assert.equal(ticket.withField("status", "done").isClosed, false);
    });

    it("defaults a missing priority", () => {
        const bare = Ticket.parse(PATH, '---\nid: x\ntitle: "x"\n---\n');
        assert.equal(bare.priority, DEFAULT_PRIORITY);
    });

    it("defaults an empty priority", () => {
        const bare = Ticket.parse(PATH, '---\nid: x\npriority: \n---\n');
        assert.equal(bare.priority, DEFAULT_PRIORITY);
    });

});

describe("Ticket.toJsonRecord", () => {
    it("keeps frontmatter key order and appends full_path last", () => {
        assert.deepEqual(Object.keys(ticket.toJsonRecord()), [
            "id",
            "title",
            "status",
            "deps",
            "links",
            "tags",
            "type",
            "priority",
            "assignee",
            "parent",
            "full_path",
        ]);
    });

    it("reports the path it was loaded from", () => {
        assert.equal(ticket.toJsonRecord()["full_path"], PATH);
    });
});

describe("Ticket mutation", () => {
    it("leaves the original untouched", () => {
        ticket.withField("status", "closed");
        assert.equal(ticket.status, "in_progress");
    });

    it("keeps the rest of the file when a field changes", () => {
        assert.equal(ticket.withField("status", "closed").body, ticket.body);
    });

    it("writes an array field in the inline on-disk form", () => {
        const updated = ticket.withArrayField("deps", ["nid_c_e"]);
        assert.equal(updated.frontmatter.get("deps"), "[nid_c_e]");
    });

    it("writes an emptied array as []", () => {
        assert.equal(ticket.withArrayField("deps", []).frontmatter.get("deps"), "[]");
    });

    it("removes a field", () => {
        assert.equal(ticket.withoutField("parent").parent, "");
    });

    it("keeps the path", () => {
        assert.equal(ticket.withField("status", "closed").path, PATH);
    });

    it("serializes back to the original text when unchanged", () => {
        assert.equal(ticket.text(), TEXT);
    });
});
