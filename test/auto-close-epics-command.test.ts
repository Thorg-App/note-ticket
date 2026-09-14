/**
 * The `auto-close-epics` CLI command: what it PRINTS and what it leaves on disk.
 * Which epics qualify is `EpicAutoClose`'s contract (test/epic-auto-close.test.ts).
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { FixedClock } from "../src/core/clock.js";
import { TicketStore } from "../src/core/ticket-store.js";
import { CommandEnvironment } from "../src/cli/command-environment.js";
import { AutoCloseEpicsCommand } from "../src/cli/commands/auto-close-epics.js";
import { ExitCode } from "../src/cli/exit-codes.js";

const NOW = "2026-09-14T10:00:00Z";
const EPIC_ID = "nid_epic_e";
const TASK_ID = "nid_task_e";

interface TicketFileFields {
    readonly status?: string;
    readonly type?: string;
    readonly deps?: readonly string[];
}

let root: string;
let store: TicketStore;

function writeTicket(name: string, id: string, fields: TicketFileFields): void {
    const lines = ["---", `id: ${id}`, `title: "${name}"`, `status: ${fields.status ?? "open"}`];
    if (fields.deps !== undefined) {
        lines.push(`deps: [${fields.deps.join(", ")}]`);
    }
    if (fields.type !== undefined) {
        lines.push(`type: ${fields.type}`);
    }
    lines.push("---", "", "");
    writeFileSync(join(store.ticketsDir, `${name}.md`), lines.join("\n"));
}

/** An epic over one task whose status is `taskStatus`. */
function epicOverTask(taskStatus: string): void {
    writeTicket("task", TASK_ID, { status: taskStatus });
    writeTicket("epic", EPIC_ID, { type: "epic", deps: [TASK_ID] });
}

/** @returns the exit code and everything the command wrote to stdout. */
function run(): { readonly stdout: string; readonly exitCode: number } {
    const written: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => {
        written.push(chunk);
        return true;
    }) as typeof process.stdout.write;
    try {
        const exitCode = AutoCloseEpicsCommand.run(store, new CommandEnvironment("tk", new FixedClock(NOW)));
        return { stdout: written.join(""), exitCode };
    } finally {
        process.stdout.write = originalWrite;
    }
}

function statusOf(id: string): string {
    return (store.loadAll().find((ticket) => ticket.id === id) as { status: string }).status;
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ticket-auto-close-test-"));
    store = new TicketStore(join(root, "_tickets"));
    store.ensureDir();
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("AutoCloseEpicsCommand", () => {
    it("reports the closed epic in `close`'s wording", () => {
        epicOverTask("closed");
        assert.equal(run().stdout, `Updated ${EPIC_ID} -> closed\n`);
    });

    it("writes the closed status to the epic's file", () => {
        epicOverTask("closed");
        run();
        assert.equal(statusOf(EPIC_ID), "closed");
    });

    it("succeeds", () => {
        epicOverTask("closed");
        assert.equal(run().exitCode, ExitCode.SUCCESS);
    });

    // A mutating command that prints nothing looks like it failed.
    it("says so when there is nothing to close", () => {
        epicOverTask("open");
        assert.equal(run().stdout, "No epics to auto-close\n");
    });

    it("succeeds when there is nothing to close", () => {
        epicOverTask("open");
        assert.equal(run().exitCode, ExitCode.SUCCESS);
    });

    it("says so in an empty tickets directory", () => {
        assert.equal(run().stdout, "No epics to auto-close\n");
    });

    it("leaves an epic with an open dependency open", () => {
        epicOverTask("open");
        run();
        assert.equal(statusOf(EPIC_ID), "open");
    });

    it("never touches the tickets the epic depends on", () => {
        epicOverTask("closed");
        run();
        assert.equal(statusOf(TASK_ID), "closed");
    });

    it("reports one line per epic when a run closes several", () => {
        writeTicket("task", TASK_ID, { status: "closed" });
        writeTicket("epic", EPIC_ID, { type: "epic", deps: [TASK_ID] });
        writeTicket("parent", "nid_parent_e", { type: "epic", deps: [EPIC_ID] });
        assert.equal(run().stdout, `Updated ${EPIC_ID} -> closed\nUpdated nid_parent_e -> closed\n`);
    });
});
