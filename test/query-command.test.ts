/**
 * `query`'s JSONL and its argument handling. Every expected string was captured from bash
 * `./ticket query` unless marked as a divergence; see also `make parity`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { QueryCommand } from "../src/cli/commands/query.js";
import { Ticket } from "../src/core/ticket.js";

const PATH = "/t/a.md";

function ticketOf(text: string): Ticket {
    return Ticket.parse(PATH, text);
}

describe("QueryCommand.jsonl", () => {
    it("emits one line per ticket, newline-terminated", () => {
        const tickets = [ticketOf("---\nid: a1\n---\n"), ticketOf("---\nid: a2\n---\n")];
        assert.equal(
            QueryCommand.jsonl(tickets),
            `{"id":"a1","full_path":"${PATH}"}\n{"id":"a2","full_path":"${PATH}"}\n`,
        );
    });

    it("emits nothing at all for no tickets", () => {
        assert.equal(QueryCommand.jsonl([]), "");
    });

    it("keeps frontmatter key order and appends full_path last", () => {
        const ticket = ticketOf('---\nstatus: open\nid: a1\ntitle: "T"\n---\n');
        assert.deepEqual(Object.keys(JSON.parse(QueryCommand.jsonl([ticket]))), [
            "status",
            "id",
            "title",
            "full_path",
        ]);
    });

    it("strips the surrounding double quotes of a value", () => {
        const ticket = ticketOf('---\nid: a1\ntitle: "My Title"\n---\n');
        assert.equal(JSON.parse(QueryCommand.jsonl([ticket]))["title"], "My Title");
    });

    it("emits an inline array as a JSON array", () => {
        const ticket = ticketOf("---\nid: a1\ndeps: [x, y]\n---\n");
        assert.deepEqual(JSON.parse(QueryCommand.jsonl([ticket]))["deps"], ["x", "y"]);
    });

    it("emits an empty inline array as an empty JSON array", () => {
        const ticket = ticketOf("---\nid: a1\ndeps: []\n---\n");
        assert.deepEqual(JSON.parse(QueryCommand.jsonl([ticket]))["deps"], []);
    });

    it("escapes a quote inside a value the way bash does", () => {
        const ticket = ticketOf('---\nid: a1\ntitle: "say \\"hi\\""\n---\n');
        assert.equal(QueryCommand.jsonl([ticket]).split("\n")[0], `{"id":"a1","title":"say \\\\\\"hi\\\\\\"","full_path":"${PATH}"}`);
    });

    it("doubles a backslash inside a value the way bash does", () => {
        const ticket = ticketOf('---\nid: a1\ntitle: "C:\\path"\n---\n');
        assert.equal(QueryCommand.jsonl([ticket]).split("\n")[0], `{"id":"a1","title":"C:\\\\path","full_path":"${PATH}"}`);
    });

    // DIVERGENCE (deliberate): bash's json_escape handles `\` and `"` only, so a raw tab —
    // reachable via `tk create $'a\tb'` — made its JSONL unparseable and broke bash's own
    // `query <filter>`. See scripts/parity/README.md.
    it("escapes a control character, unlike bash", () => {
        const ticket = ticketOf('---\nid: a1\ntitle: "tab\there"\n---\n');
        const line = QueryCommand.jsonl([ticket]).split("\n")[0] as string;
        assert.equal(line.includes("\t"), false);
        assert.equal(JSON.parse(line)["title"], "tab\there");
    });
});

describe("QueryCommand.filterFrom", () => {
    it("has no filter when there are no arguments", () => {
        assert.equal(QueryCommand.filterFrom([]), "");
    });

    it("has no filter for an explicitly empty argument", () => {
        assert.equal(QueryCommand.filterFrom([""]), "");
    });

    it("takes the single argument as the filter", () => {
        assert.equal(QueryCommand.filterFrom([".id"]), ".id");
    });

    // bash's arg loop assigns `filter="$1"` for EVERY argument, flags included.
    it("lets the last argument win, treating nothing as a flag", () => {
        assert.equal(QueryCommand.filterFrom(["--pretty", ".id"]), ".id");
        assert.equal(QueryCommand.filterFrom([".id", "--pretty"]), "--pretty");
    });
});
