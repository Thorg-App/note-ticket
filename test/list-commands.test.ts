/**
 * The listing commands (`ls`, `ready`, `blocked`) and the CLI-layer pieces they share.
 * Every expected string here was captured from bash `./ticket`; see also `make parity`.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BlockedCommand } from "../src/cli/commands/blocked.js";
import { LsCommand } from "../src/cli/commands/ls.js";
import { ReadyCommand } from "../src/cli/commands/ready.js";
import { CliError } from "../src/cli/cli-error.js";
import { ListOptions } from "../src/cli/list-options.js";
import { TicketRow } from "../src/cli/ticket-row.js";
import { Ticket } from "../src/core/ticket.js";

interface TicketSpec {
    readonly id: string;
    readonly title?: string;
    readonly status?: string;
    readonly deps?: readonly string[];
    readonly priority?: string;
    readonly assignee?: string;
    readonly tags?: readonly string[];
}

function ticketOf(spec: TicketSpec): Ticket {
    const lines = ["---", `id: ${spec.id}`, `title: "${spec.title ?? spec.id}"`, `status: ${spec.status ?? "open"}`];
    lines.push(`deps: [${(spec.deps ?? []).join(", ")}]`);
    if (spec.priority !== undefined) {
        lines.push(`priority: ${spec.priority}`);
    }
    if (spec.assignee !== undefined) {
        lines.push(`assignee: ${spec.assignee}`);
    }
    if (spec.tags !== undefined) {
        lines.push(`tags: [${spec.tags.join(", ")}]`);
    }
    lines.push("---", "");
    return Ticket.parse(`/t/${spec.id}.md`, lines.join("\n"));
}

function ticketsOf(specs: readonly TicketSpec[]): readonly Ticket[] {
    return specs.map(ticketOf);
}

const NO_OPTIONS = ListOptions.parse([]);

describe("ListOptions", () => {
    it("reads --status=", () => {
        assert.equal(ListOptions.parse(["--status=open"]).filter.matches(ticketOf({ id: "a" })), true);
    });

    it("rejects a --status= that does not match", () => {
        assert.equal(ListOptions.parse(["--status=closed"]).filter.matches(ticketOf({ id: "a" })), false);
    });

    it("reads -a as a separate argument", () => {
        const options = ListOptions.parse(["-a", "bob"]);
        assert.equal(options.filter.matches(ticketOf({ id: "a", assignee: "bob" })), true);
    });

    it("reads --assignee=", () => {
        const options = ListOptions.parse(["--assignee=bob"]);
        assert.equal(options.filter.matches(ticketOf({ id: "a", assignee: "ann" })), false);
    });

    it("matches one of several tags with -T", () => {
        const options = ListOptions.parse(["-T", "ui"]);
        assert.equal(options.filter.matches(ticketOf({ id: "a", tags: ["backend", "ui"] })), true);
    });

    it("does not match a tag that is only a substring", () => {
        const options = ListOptions.parse(["--tag=ui"]);
        assert.equal(options.filter.matches(ticketOf({ id: "a", tags: ["uix"] })), false);
    });

    it("keeps the raw --limit= text for `closed`", () => {
        assert.equal(ListOptions.parse(["--limit=5"]).limitText, "5");
    });

    it("ignores unrecognised arguments, as bash does", () => {
        assert.equal(ListOptions.parse(["--nope", "junk"]).filter.matches(ticketOf({ id: "a" })), true);
    });

    it("takes the argument after -a verbatim, even when it looks like a flag", () => {
        const options = ListOptions.parse(["-a", "-T"]);
        assert.equal(options.filter.matches(ticketOf({ id: "a", assignee: "-T" })), true);
    });

    it("rejects -a without a value", () => {
        assert.throws(() => ListOptions.parse(["-a"]), (error: unknown) => error instanceof CliError);
    });

    it("names the flag when it has no value", () => {
        assert.throws(() => ListOptions.parse(["ready", "-T"]), { message: "option '-T' requires a value" });
    });

    it("combines filters conjunctively", () => {
        const options = ListOptions.parse(["--status=open", "-a", "bob", "-T", "ui"]);
        assert.equal(options.filter.matches(ticketOf({ id: "a", assignee: "bob", tags: ["ui"] })), true);
    });

    it("requires every combined filter to match", () => {
        const options = ListOptions.parse(["--status=open", "-a", "bob", "-T", "ui"]);
        assert.equal(options.filter.matches(ticketOf({ id: "a", assignee: "bob", tags: ["db"] })), false);
    });
});

describe("TicketRow", () => {
    it("pads the id column to 8", () => {
        assert.equal(TicketRow.withStatus(ticketOf({ id: "aa1", title: "Alpha" })), "aa1      [open] - Alpha");
    });

    it("never truncates a long id", () => {
        const row = TicketRow.withStatus(ticketOf({ id: "verylongidentifier9", title: "Long" }));
        assert.equal(row, "verylongidentifier9 [open] - Long");
    });

    it("keeps the trailing space of an empty title", () => {
        assert.equal(TicketRow.withStatus(Ticket.parse("/t/a.md", "---\nid: dd4\nstatus: open\n---\n")), "dd4      [open] - ");
    });

    it("renders deps as a bracketed, comma-space list", () => {
        const row = TicketRow.withDeps(ticketOf({ id: "aa1", title: "Alpha", deps: ["bb2", "zz9"] }));
        assert.equal(row, "aa1      [open] - Alpha <- [bb2, zz9]");
    });

    it("omits the dep marker entirely when there are none", () => {
        assert.equal(TicketRow.withDeps(ticketOf({ id: "aa1", title: "Alpha" })), "aa1      [open] - Alpha");
    });

    it("defaults a missing priority to 2", () => {
        assert.equal(TicketRow.withPriority(ticketOf({ id: "aa1", title: "Alpha" })), "aa1      [P2][open] - Alpha");
    });

    it("emits one trailing newline per row", () => {
        assert.equal(TicketRow.text(["one", "two"]), "one\ntwo\n");
    });

    it("emits nothing at all for no rows", () => {
        assert.equal(TicketRow.text([]), "");
    });
});

describe("LsCommand", () => {
    const TICKETS = ticketsOf([
        { id: "aa1", title: "Alpha", deps: ["bb2", "zz9"], assignee: "bob", tags: ["ui"] },
        { id: "bb2", title: "Beta", status: "closed" },
        { id: "cc3", title: "Gamma", status: "in_progress", deps: ["bb2"], assignee: "bob" },
    ]);

    it("lists every ticket in enumeration order, closed included", () => {
        assert.equal(
            LsCommand.render(TICKETS, NO_OPTIONS),
            "aa1      [open] - Alpha <- [bb2, zz9]\nbb2      [closed] - Beta\ncc3      [in_progress] - Gamma <- [bb2]\n",
        );
    });

    it("applies --status", () => {
        assert.equal(LsCommand.render(TICKETS, ListOptions.parse(["--status=closed"])), "bb2      [closed] - Beta\n");
    });

    it("does not sort or de-duplicate: one row per file", () => {
        const duplicated = ticketsOf([{ id: "zz9", title: "Z" }, { id: "aa1", title: "A" }, { id: "zz9", title: "Z again" }]);
        assert.equal(
            LsCommand.render(duplicated, NO_OPTIONS),
            "zz9      [open] - Z\naa1      [open] - A\nzz9      [open] - Z again\n",
        );
    });
});

describe("ReadyCommand", () => {
    const TICKETS = ticketsOf([
        { id: "aa1", title: "Alpha", deps: ["bb2", "zz9"], priority: "1" },
        { id: "bb2", title: "Beta", status: "closed", priority: "3" },
        { id: "cc3", title: "Gamma", status: "in_progress", deps: ["bb2"], assignee: "bob", tags: ["ui"] },
        { id: "dd4", title: "Delta", priority: "10" },
    ]);

    it("lists only tickets whose deps are all closed, priority then id", () => {
        assert.equal(
            ReadyCommand.render(TICKETS, NO_OPTIONS),
            "cc3      [P2][in_progress] - Gamma\ndd4      [P10][open] - Delta\n",
        );
    });

    it("filters the result without disturbing dep lookups", () => {
        assert.equal(
            ReadyCommand.render(TICKETS, ListOptions.parse(["-T", "ui"])),
            "cc3      [P2][in_progress] - Gamma\n",
        );
    });

    it("ignores --status, as bash does", () => {
        assert.equal(ReadyCommand.render(TICKETS, ListOptions.parse(["--status=closed"])), ReadyCommand.render(TICKETS, NO_OPTIONS));
    });
});

describe("BlockedCommand", () => {
    const TICKETS = ticketsOf([
        { id: "aa1", title: "Alpha", deps: ["bb2", "zz9"], priority: "1", assignee: "bob" },
        { id: "bb2", title: "Beta", status: "closed" },
        { id: "cc3", title: "Gamma", status: "in_progress", deps: ["bb2"] },
        { id: "dd4", title: "Delta", status: "closed", deps: ["zz9"] },
    ]);

    it("lists only the unresolved blockers of each active ticket", () => {
        assert.equal(BlockedCommand.render(TICKETS, NO_OPTIONS), "aa1      [P1][open] - Alpha <- [zz9]\n");
    });

    it("filters by assignee", () => {
        assert.equal(BlockedCommand.render(TICKETS, ListOptions.parse(["-a", "ann"])), "");
    });
});
