import assert from "node:assert/strict";
import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import { FixedClock } from "../src/core/clock.js";
import { TicketStore } from "../src/core/ticket-store.js";
import { CliError, UsageError } from "../src/cli/cli-error.js";
import { CommandEnvironment } from "../src/cli/command-environment.js";
import { EditCommand, Editor } from "../src/cli/commands/edit.js";
import type { Terminal } from "../src/cli/terminal.js";

const TICKET_ID = "edit-0001";
const NOW = "2026-07-30T12:00:00Z";

/** Exit codes of the stand-in "editors" below, which are real binaries on every POSIX box. */
const EDITOR_THAT_SUCCEEDS = "/bin/true";
const EDITOR_THAT_FAILS = "/bin/false";
const EDITOR_THAT_IS_MISSING = "/nonexistent/editor-that-is-not-installed";
/**
 * A stand-in "editor" that ACTS on the path it is given: it updates the file's mtime, says
 * nothing on success, and fails on any other argument list. That makes "the child was handed
 * exactly the resolved ticket path" observable through the REAL `spawnSync`.
 *
 * WHY-NOT a recorder script writing `"$0" "$@"` to a file: `os.tmpdir()` is `/dev/shm` here and
 * mounted `noexec`, so a generated executable cannot be spawned from a unit test.
 */
const EDITOR_THAT_TOUCHES_ITS_ARGUMENT = "/bin/touch";
/** A real binary followed by a flag: bash looked this whole string up as ONE filename. */
const EDITOR_WITH_A_FLAG = "/bin/true --flag";
/** Any past time; the editor above must move the file's mtime away from it. */
const MTIME_BEFORE_EDITING = new Date("2001-02-03T04:05:06Z");

function terminalWith(stdin: boolean, stdout: boolean): Terminal {
    return {
        isStdinTerminal: () => stdin,
        isStdoutTerminal: () => stdout,
        readStdin: () => assert.fail("edit reads no stdin"),
    };
}

/**
 * A real tickets directory with one ticket.
 *
 * WHY real files: `edit` prints the ABSOLUTE path of the file it resolved, and hands that path
 * to a child process — neither is observable with in-memory tickets.
 */
class EditRun {
    readonly ticketPath: string;
    private readonly root: string;
    private readonly ticketsDir: string;

    constructor() {
        this.root = mkdtempSync(join(tmpdir(), "ticket-edit-test-"));
        this.ticketsDir = join(this.root, "_tickets");
        new TicketStore(this.ticketsDir).ensureDir();
        this.ticketPath = join(this.ticketsDir, "editable.md");
        writeFileSync(this.ticketPath, `---\nid: ${TICKET_ID}\ntitle: "Editable"\n---\n\nBody.\n`);
    }

    /** @returns the exit code and everything written to stdout. */
    run(args: readonly string[], terminal: Terminal): { stdout: string; exitCode: number } {
        const environment = new CommandEnvironment(
            "tk",
            new FixedClock(NOW),
            () => assert.fail("edit generates no id"),
            () => assert.fail("edit reads no git config"),
            terminal,
        );
        const written: string[] = [];
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string) => {
            written.push(chunk);
            return true;
        }) as typeof process.stdout.write;
        try {
            const exitCode = EditCommand.run(new TicketStore(this.ticketsDir), args, environment);
            return { stdout: written.join(""), exitCode };
        } finally {
            process.stdout.write = originalWrite;
        }
    }

    /** Backdates the ticket file so that any later write to it is visible. */
    backdate(): void {
        utimesSync(this.ticketPath, MTIME_BEFORE_EDITING, MTIME_BEFORE_EDITING);
    }

    wasTouched(): boolean {
        return statSync(this.ticketPath).mtimeMs !== MTIME_BEFORE_EDITING.getTime();
    }

    remove(): void {
        rmSync(this.root, { recursive: true, force: true });
    }
}

/** Runs `body` with `$EDITOR` set to `editor`, restoring the environment afterwards. */
function withEditor(editor: string | undefined, body: () => void): void {
    const original = process.env["EDITOR"];
    if (editor === undefined) {
        delete process.env["EDITOR"];
    } else {
        process.env["EDITOR"] = editor;
    }
    try {
        body();
    } finally {
        if (original === undefined) {
            delete process.env["EDITOR"];
        } else {
            process.env["EDITOR"] = original;
        }
    }
}

function editing(body: (run: EditRun) => void): void {
    const run = new EditRun();
    try {
        body(run);
    } finally {
        run.remove();
    }
}

describe("Editor.configured", () => {
    it("falls back to vi when EDITOR is unset", () => {
        assert.equal(Editor.configured({}), "vi");
    });

    it("falls back to vi when EDITOR is EMPTY, as `${EDITOR:-vi}` does", () => {
        assert.equal(Editor.configured({ EDITOR: "" }), "vi");
    });

    it("keeps a multi-word EDITOR as ONE command name, unsplit like bash's \"$EDITOR\"", () => {
        assert.equal(Editor.configured({ EDITOR: "code -w" }), "code -w");
    });
});

describe("EditCommand without a terminal", () => {
    it("prints the absolute path of the ticket file", () => {
        editing((run) => {
            assert.equal(
                run.run([TICKET_ID], terminalWith(false, false)).stdout,
                `Edit ticket file: ${run.ticketPath}\n`,
            );
        });
    });

    it("succeeds", () => {
        editing((run) => {
            assert.equal(run.run([TICKET_ID], terminalWith(false, false)).exitCode, 0);
        });
    });

    it("prints the path when only STDOUT is a terminal — bash required both", () => {
        editing((run) => {
            assert.ok(run.run([TICKET_ID], terminalWith(false, true)).stdout.startsWith("Edit ticket file: "));
        });
    });

    it("prints the path when only STDIN is a terminal", () => {
        editing((run) => {
            assert.ok(run.run([TICKET_ID], terminalWith(true, false)).stdout.startsWith("Edit ticket file: "));
        });
    });

    it("resolves a partial id", () => {
        editing((run) => {
            assert.ok(run.run(["0001"], terminalWith(false, false)).stdout.endsWith("editable.md\n"));
        });
    });

    it("rejects an empty argument list with bash's usage line", () => {
        editing((run) => {
            assert.throws(() => run.run([], terminalWith(false, false)), (error: unknown) => {
                assert.ok(error instanceof UsageError);
                assert.deepEqual(error.usageLines, ["Usage: ticket edit <id>"]);
                return true;
            });
        });
    });
});

/**
 * The arm no BDD scenario can reach: with a terminal on both streams the editor really is
 * launched, and ITS exit code becomes the command's.
 */
describe("EditCommand with a terminal on both streams", () => {
    it("adopts the editor's success", () => {
        editing((run) => {
            withEditor(EDITOR_THAT_SUCCEEDS, () => {
                assert.equal(run.run([TICKET_ID], terminalWith(true, true)).exitCode, 0);
            });
        });
    });

    it("adopts the editor's failure code", () => {
        editing((run) => {
            withEditor(EDITOR_THAT_FAILS, () => {
                assert.equal(run.run([TICKET_ID], terminalWith(true, true)).exitCode, 1);
            });
        });
    });

    it("prints no path of its own when it launches an editor", () => {
        editing((run) => {
            withEditor(EDITOR_THAT_SUCCEEDS, () => {
                assert.equal(run.run([TICKET_ID], terminalWith(true, true)).stdout, "");
            });
        });
    });

    it("hands the editor the resolved ticket path as its argument", () => {
        editing((run) => {
            run.backdate();
            withEditor(EDITOR_THAT_TOUCHES_ITS_ARGUMENT, () => {
                run.run([TICKET_ID], terminalWith(true, true));
            });
            assert.equal(run.wasTouched(), true);
        });
    });

    it("looks a multi-word EDITOR up as ONE filename, as bash's quoted \"$EDITOR\" did", () => {
        editing((run) => {
            withEditor(EDITOR_WITH_A_FLAG, () => {
                assert.throws(() => run.run([TICKET_ID], terminalWith(true, true)), (error: unknown) => {
                    assert.ok(error instanceof CliError);
                    assert.equal(error.exitCode, 127);
                    return true;
                });
            });
        });
    });

    it("exits 127 naming the editor when it is not on PATH, as the shell did", () => {
        editing((run) => {
            withEditor(EDITOR_THAT_IS_MISSING, () => {
                assert.throws(() => run.run([TICKET_ID], terminalWith(true, true)), (error: unknown) => {
                    assert.ok(error instanceof CliError);
                    assert.equal(error.message, `${EDITOR_THAT_IS_MISSING}: command not found`);
                    assert.equal(error.exitCode, 127);
                    return true;
                });
            });
        });
    });
});
