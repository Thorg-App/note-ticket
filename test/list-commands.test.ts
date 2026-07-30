/**
 * The listing commands (`ls`, `ready`, `blocked`, `closed`) and the CLI-layer pieces they share.
 * Every expected string here was captured from bash `./ticket`; see also `make parity`.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { BlockedCommand } from "../src/cli/commands/blocked.js";
import { ClosedCommand } from "../src/cli/commands/closed.js";
import { LsCommand } from "../src/cli/commands/ls.js";
import { ReadyCommand } from "../src/cli/commands/ready.js";
import { CliError } from "../src/cli/cli-error.js";
import { ExitCode } from "../src/cli/exit-codes.js";
import { ListOptions } from "../src/cli/list-options.js";
import { RowLimit } from "../src/cli/row-limit.js";
import { TicketRow } from "../src/cli/ticket-row.js";
import { Ticket } from "../src/core/ticket.js";
import { TicketStore } from "../src/core/ticket-store.js";

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

describe("CliError", () => {
    it("prefixes the message with `Error: `", () => {
        assert.equal(new CliError("nope").stderrText, "Error: nope\n");
    });

    it("leaves detail lines un-prefixed, as bash's TICKETS_DIR hint is", () => {
        const error = new CliError("not inside a git repository", ["Run inside a git repo"]);
        assert.equal(error.stderrText, "Error: not inside a git repository\nRun inside a git repo\n");
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

/**
 * bash `cmd_ready`/`cmd_blocked` pack their sort key as `prio|id|status|title` and split it
 * back apart, so bash truncates such a title (and `blocked` prints a title fragment where
 * the blockers belong). Reachable via `tk create "a | b"`. These tests pin the corrected
 * behavior so a later porter cannot "restore parity" by re-introducing the bash bug.
 */
describe("a title containing the sort-key separator '|'", () => {
    const PIPED_TITLE = "Ship the thing | phase 2";
    const TICKETS = ticketsOf([
        { id: "aa1", title: PIPED_TITLE, deps: ["zz9"], priority: "1" },
        { id: "cc3", title: PIPED_TITLE, priority: "2" },
    ]);

    it("renders whole in a `ready` row", () => {
        assert.equal(ReadyCommand.render(TICKETS, NO_OPTIONS), `cc3      [P2][open] - ${PIPED_TITLE}\n`);
    });

    it("renders whole in a `blocked` row, blockers still last", () => {
        assert.equal(BlockedCommand.render(TICKETS, NO_OPTIONS), `aa1      [P1][open] - ${PIPED_TITLE} <- [zz9]\n`);
    });

    it("renders whole in an `ls` row", () => {
        assert.equal(LsCommand.render([TICKETS[1] as Ticket], NO_OPTIONS), `cc3      [open] - ${PIPED_TITLE}\n`);
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

describe("RowLimit", () => {
    it("defaults to bash's 20 rows when --limit= is absent", () => {
        const rows = Array.from({ length: 25 }, (_unused, index) => `row${index}`);
        assert.equal(RowLimit.parse(undefined).applyTo(rows).length, 20);
    });

    it("keeps the first N rows", () => {
        assert.deepEqual(RowLimit.parse("2").applyTo(["a", "b", "c"]), ["a", "b"]);
    });

    it("keeps nothing for --limit=0", () => {
        assert.deepEqual(RowLimit.parse("0").applyTo(["a", "b"]), []);
    });

    it("accepts a zero-padded count, as head did", () => {
        assert.deepEqual(RowLimit.parse("03").applyTo(["a", "b", "c", "d"]), ["a", "b", "c"]);
    });

    // DIVERGENCE: bash forwarded the text to `head -n`, so these were accepted with head's
    // own meanings (`-1` = all but the last, `2k` = 2048). Here they are usage errors.
    it("rejects an empty --limit=, as bash's head did", () => {
        assert.throws(() => RowLimit.parse(""), (error: unknown) => error instanceof CliError);
    });

    it("rejects a non-numeric limit naming the flag", () => {
        assert.throws(() => RowLimit.parse("abc"), { message: "--limit must be a whole number of rows, got 'abc'" });
    });

    it("rejects a negative limit rather than meaning 'all but the last'", () => {
        assert.throws(() => RowLimit.parse("-1"), (error: unknown) => error instanceof CliError);
    });

    it("rejects head's size suffixes", () => {
        assert.throws(() => RowLimit.parse("2k"), (error: unknown) => error instanceof CliError);
    });
});

/**
 * `ClosedCommand.renderTickets` is handed tickets ALREADY in newest-first order (the store
 * does the mtime sort), so these cases are about selection, row format and `--limit`.
 */
describe("ClosedCommand", () => {
    // Production parses the limit in `render`, before the store is touched, and passes it
    // down; every case here just wants the one its own options carry.
    const renderClosed = (recentFirst: readonly Ticket[], options: ListOptions): string =>
        ClosedCommand.renderTickets(recentFirst, options, options.rowLimit);

    const RECENT_FIRST = ticketsOf([
        { id: "cc3", title: "Gamma", status: "closed", assignee: "ann", tags: ["ui"] },
        { id: "aa1", title: "Alpha", status: "done", assignee: "bob" },
        { id: "bb2", title: "Beta", status: "open", assignee: "bob" },
        { id: "dd4", title: "Delta", status: "closed", deps: ["cc3"], assignee: "bob" },
    ]);

    it("prints closed tickets in the order given, with no priority and no deps", () => {
        assert.equal(
            renderClosed(RECENT_FIRST, NO_OPTIONS),
            "cc3      [closed] - Gamma\naa1      [done] - Alpha\ndd4      [closed] - Delta\n",
        );
    });

    it("counts the legacy `done` status as closed", () => {
        assert.match(renderClosed(RECENT_FIRST, NO_OPTIONS), /aa1 {6}\[done\] - Alpha/);
    });

    it("excludes open and in-progress tickets", () => {
        assert.doesNotMatch(renderClosed(RECENT_FIRST, NO_OPTIONS), /bb2/);
    });

    it("applies --limit to the surviving rows, not to the tickets scanned", () => {
        assert.equal(
            renderClosed(RECENT_FIRST, ListOptions.parse(["--limit=2"])),
            "cc3      [closed] - Gamma\naa1      [done] - Alpha\n",
        );
    });

    it("filters by assignee", () => {
        assert.equal(
            renderClosed(RECENT_FIRST, ListOptions.parse(["-a", "ann"])),
            "cc3      [closed] - Gamma\n",
        );
    });

    it("filters by tag", () => {
        assert.equal(
            renderClosed(RECENT_FIRST, ListOptions.parse(["--tag=ui"])),
            "cc3      [closed] - Gamma\n",
        );
    });

    it("ignores --status, as bash does", () => {
        assert.equal(
            renderClosed(RECENT_FIRST, ListOptions.parse(["--status=open"])),
            renderClosed(RECENT_FIRST, NO_OPTIONS),
        );
    });

    it("prints one row per file, without de-duplicating ids", () => {
        const twice = ticketsOf([
            { id: "aa1", title: "First copy", status: "closed" },
            { id: "aa1", title: "Second copy", status: "closed" },
        ]);
        assert.equal(
            renderClosed(twice, NO_OPTIONS),
            "aa1      [closed] - First copy\naa1      [closed] - Second copy\n",
        );
    });

    it("keeps a title containing a pipe whole (no sort key is packed here)", () => {
        const piped = ticketsOf([{ id: "aa1", title: "Ship it | phase 2", status: "closed" }]);
        assert.equal(renderClosed(piped, NO_OPTIONS), "aa1      [closed] - Ship it | phase 2\n");
    });
});

/**
 * `ClosedCommand.render` — the half that talks to the store. Its own logic is the
 * mtime-ordered read and the ORDER of that read relative to argv validation; the row
 * content is `renderTickets`, above.
 */
describe("ClosedCommand.render", () => {
    const tickets = mkdtempSync(join(tmpdir(), "closed-render-test-"));

    before(() => {
        // Newest last in write order, so a path-ordered or write-ordered read fails here.
        for (const [name, id, seconds] of [
            ["aaa.md", "third", 1700000100],
            ["mmm.md", "first", 1700000300],
            ["zzz.md", "second", 1700000200],
        ] as const) {
            writeFileSync(join(tickets, name), `---\nid: ${id}\ntitle: "T ${id}"\nstatus: closed\n---\n`);
            utimesSync(join(tickets, name), seconds, seconds);
        }
    });

    after(() => rmSync(tickets, { recursive: true, force: true }));

    it("lists the most recently modified file first", () => {
        assert.equal(
            ClosedCommand.render(new TicketStore(tickets), NO_OPTIONS),
            "first    [closed] - T first\nsecond   [closed] - T second\nthird    [closed] - T third\n",
        );
    });

    /**
     * The argv is validated BEFORE the store is read: this store cannot be enumerated at
     * all (a file with no `id`), so a `--limit` error can only surface first if nothing was
     * read yet. Reordering the two lines in `render` makes this fail with the store's error.
     */
    it("rejects an unusable --limit= before reading any ticket file", () => {
        const broken = mkdtempSync(join(tmpdir(), "closed-render-broken-"));
        try {
            writeFileSync(join(broken, "no-id.md"), '---\ntitle: "no id here"\n---\n');
            assert.throws(
                () => ClosedCommand.render(new TicketStore(broken), ListOptions.parse(["--limit=abc"])),
                { message: "--limit must be a whole number of rows, got 'abc'" },
            );
        } finally {
            rmSync(broken, { recursive: true, force: true });
        }
    });
});

/**
 * The exit codes are a user-facing contract: bash's pipelines reported 128+signal, and a
 * missing binary is the shell's 127.
 */
describe("ExitCode", () => {
    it("reports a SIGPIPE death as 141, as a shell does", () => {
        assert.equal(ExitCode.forSignal("SIGPIPE"), 141);
        assert.equal(ExitCode.BROKEN_PIPE, 141);
    });

    it("reports a SIGTERM death as 143", () => {
        assert.equal(ExitCode.forSignal("SIGTERM"), 143);
    });
});
