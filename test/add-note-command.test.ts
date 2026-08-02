import assert from "node:assert/strict";
import { lstatSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";

import { FixedClock } from "../src/core/clock.js";
import { TicketNote } from "../src/core/ticket-note.js";
import { TicketStore } from "../src/core/ticket-store.js";
import { CliError, UsageError } from "../src/cli/cli-error.js";
import { AddNoteCommand, NoteText } from "../src/cli/commands/add-note.js";
import { CommandEnvironment } from "../src/cli/command-environment.js";
import type { Terminal } from "../src/cli/terminal.js";

const NOW = "2026-07-30T12:00:00Z";
const TICKET_ID = "note-0001";

/** Neither a terminal nor anything on stdin: how every BDD runner (and CI) invokes the CLI. */
const REDIRECTED_EMPTY_STDIN: Terminal = {
    isStdinTerminal: () => false,
    isStdoutTerminal: () => false,
    readStdin: () => "",
};

/** An interactive shell: bash's `[ -t 0 ]` arm, which no BDD scenario can reach. */
const INTERACTIVE: Terminal = {
    isStdinTerminal: () => true,
    isStdoutTerminal: () => true,
    readStdin: () => assert.fail("stdin must not be read when it is a terminal"),
};

function pipedStdin(text: string): Terminal {
    return { ...REDIRECTED_EMPTY_STDIN, readStdin: () => text };
}

function ticketText(body: string): string {
    return ["---", `id: ${TICKET_ID}`, 'title: "Note me"', "status: open", "---", "", body].join("\n");
}

describe("NoteText", () => {
    it("joins the remaining arguments with single spaces", () => {
        assert.equal(NoteText.from(["two", "words"], INTERACTIVE), "two words");
    });

    it("keeps an explicitly empty argument as an empty note", () => {
        assert.equal(NoteText.from([""], INTERACTIVE), "");
    });

    it("reads stdin when there are no arguments and stdin is not a terminal", () => {
        assert.equal(NoteText.from([], pipedStdin("from a pipe")), "from a pipe");
    });

    it("strips the trailing newlines a command substitution would strip", () => {
        assert.equal(NoteText.from([], pipedStdin("a\nb\n\n\n")), "a\nb");
    });

    it("keeps leading and inner whitespace of piped text", () => {
        assert.equal(NoteText.from([], pipedStdin("  padded  \n")), "  padded  ");
    });

    it("treats a readable-but-empty stdin as an empty note, not a missing one", () => {
        assert.equal(NoteText.from([], REDIRECTED_EMPTY_STDIN), "");
    });

    it("refuses to read a terminal, reporting that no note was provided", () => {
        assert.throws(() => NoteText.from([], INTERACTIVE), (error: unknown) => {
            assert.ok(error instanceof CliError);
            assert.equal(error.message, "no note provided");
            assert.equal(error.exitCode, 1);
            return true;
        });
    });
});

describe("TicketNote", () => {
    it("appends the heading, a bold timestamp and the note", () => {
        assert.equal(
            TicketNote.appendedTo(ticketText("Body.\n"), "My note", NOW),
            `\n## Notes\n\n**${NOW}**\n\nMy note\n`,
        );
    });

    it("appends a multi-line note verbatim", () => {
        assert.equal(
            TicketNote.appendedTo(ticketText("Body.\n"), "one\ntwo", NOW),
            `\n## Notes\n\n**${NOW}**\n\none\ntwo\n`,
        );
    });

    it("omits the heading when the file already has one", () => {
        const withNotes = ticketText("Body.\n\n## Notes\n\n**2020-01-01T00:00:00Z**\n\nOld\n");
        assert.equal(TicketNote.appendedTo(withNotes, "New", NOW), `\n**${NOW}**\n\nNew\n`);
    });

    it("counts a heading in the BODY that merely starts with it, as bash's grep did", () => {
        assert.ok(!TicketNote.appendedTo(ticketText("## Notesish\n"), "x", NOW).includes("## Notes\n"));
    });

    it("counts a heading inside the frontmatter block, as bash's whole-file grep did", () => {
        const inBlock = `---\nid: ${TICKET_ID}\n## Notes\n---\n\nBody.\n`;
        assert.equal(TicketNote.appendedTo(inBlock, "x", NOW), `\n**${NOW}**\n\nx\n`);
    });

    it("does not mistake a heading that is not at the start of a line", () => {
        assert.ok(TicketNote.appendedTo(ticketText("see ## Notes\n"), "x", NOW).includes("## Notes\n"));
    });
});

/** The wiring: a real tickets directory, so the saved bytes and the report are asserted. */
class AddNoteRun {
    readonly ticketsDir: string;
    private readonly root: string;

    constructor(
        private readonly terminal: Terminal,
        private readonly initialText: string = ticketText("Body.\n"),
    ) {
        this.root = mkdtempSync(join(tmpdir(), "ticket-add-note-test-"));
        this.ticketsDir = join(this.root, "_tickets");
        new TicketStore(this.ticketsDir).ensureDir();
        writeFileSync(join(this.ticketsDir, "note.md"), this.initialText);
    }

    /** The file text the ticket started with, for a byte-exact "nothing else changed" assert. */
    original(): string {
        return this.initialText;
    }

    run(args: readonly string[]): { readonly stdout: string; readonly exitCode: number } {
        const environment = new CommandEnvironment(
            "tk",
            new FixedClock(NOW),
            () => assert.fail("add-note generates no id"),
            () => assert.fail("add-note reads no git config"),
            this.terminal,
        );
        const written: string[] = [];
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string) => {
            written.push(chunk);
            return true;
        }) as typeof process.stdout.write;
        try {
            const exitCode = AddNoteCommand.run(new TicketStore(this.ticketsDir), args, environment);
            return { stdout: written.join(""), exitCode };
        } finally {
            process.stdout.write = originalWrite;
        }
    }

    fileText(): string {
        return readFileSync(join(this.ticketsDir, "note.md"), "utf8");
    }

    remove(): void {
        rmSync(this.root, { recursive: true, force: true });
    }
}

describe("AddNoteCommand", () => {
    let added: AddNoteRun;

    beforeEach(() => {
        added = new AddNoteRun(REDIRECTED_EMPTY_STDIN);
    });

    afterEach(() => {
        added.remove();
    });

    it("reports the FULL id even when a partial one was given", () => {
        assert.equal(added.run(["0001", "hi"]).stdout, `Note added to ${TICKET_ID}\n`);
    });

    it("writes the note to the file", () => {
        added.run([TICKET_ID, "written down"]);
        assert.ok(added.fileText().endsWith(`\n## Notes\n\n**${NOW}**\n\nwritten down\n`));
    });

    it("succeeds", () => {
        assert.equal(added.run([TICKET_ID, "hi"]).exitCode, 0);
    });

    it("rejects an empty argument list with bash's usage line", () => {
        assert.throws(() => added.run([]), (error: unknown) => {
            assert.ok(error instanceof UsageError);
            assert.deepEqual(error.usageLines, ["Usage: ticket add-note <id> [note text]"]);
            return true;
        });
    });

    it("resolves the id before deciding there is no note", () => {
        const interactive = new AddNoteRun(INTERACTIVE);
        try {
            assert.throws(() => interactive.run(["nosuchticket"]), /ticket 'nosuchticket' not found/);
        } finally {
            interactive.remove();
        }
    });

    it("changes nothing before the note it appended", () => {
        added.run([TICKET_ID, "x"]);
        assert.equal(
            added.fileText(),
            `${added.original()}\n## Notes\n\n**${NOW}**\n\nx\n`,
        );
    });
});

/**
 * File shapes where appending BYTES and rewriting a parsed document part ways. bash used
 * `printf … >> "$file"`, so nothing outside the appended bytes may move.
 */
describe("AddNoteCommand on an oddly shaped file", () => {
    const shapes: readonly { readonly name: string; readonly text: string }[] = [
        { name: "a file that does not end in a newline", text: ticketText("Body.") },
        { name: "text before the opening marker", text: `lead\n${ticketText("Body.\n")}` },
        { name: "an unterminated frontmatter block", text: `---\nid: ${TICKET_ID}\n` },
    ];
    // WHY-NOT a file with NO frontmatter block: it has no `id`, so it never resolves —
    // `TicketStore.load` rejects it by name (divergence #2), which is pinned in its own tests.

    for (const shape of shapes) {
        it(`appends to ${shape.name} and changes nothing else`, () => {
            const run = new AddNoteRun(REDIRECTED_EMPTY_STDIN, shape.text);
            try {
                run.run([TICKET_ID, "x"]);
                assert.equal(run.fileText(), `${shape.text}\n## Notes\n\n**${NOW}**\n\nx\n`);
            } finally {
                run.remove();
            }
        });
    }
});

/**
 * A symlinked ticket file is a supported shape (README: symlinks are followed). bash appended
 * THROUGH the link; a write-then-rename would replace the link with a regular file and detach
 * every other name for the ticket.
 *
 * The link's TARGET lives outside `_tickets/`, so the id is enumerated exactly once.
 */
describe("AddNoteCommand on a symlinked ticket", () => {
    const run = new AddNoteRun(REDIRECTED_EMPTY_STDIN);
    const link = join(run.ticketsDir, "link.md");
    const target = join(run.ticketsDir, "..", "outside.md");

    before(() => {
        rmSync(join(run.ticketsDir, "note.md"));
        writeFileSync(target, ticketText("Body.\n"));
        symlinkSync(target, link);
        run.run([TICKET_ID, "through the link"]);
    });

    after(() => run.remove());

    it("keeps the link a link", () => {
        assert.equal(lstatSync(link).isSymbolicLink(), true);
    });

    it("writes the note into the file the link points at", () => {
        assert.ok(readFileSync(target, "utf8").endsWith("through the link\n"));
    });
});
