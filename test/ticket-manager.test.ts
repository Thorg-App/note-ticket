import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { FixedClock } from "../src/core/clock.js";
import { CustomTicketStatusParser } from "../src/core/custom-ticket-status.js";
import { FileTicketManager } from "../src/lib/file-ticket-manager.js";
import { AmbiguousTicketIdError, TicketNotFoundError } from "../src/lib/ticket-manager-error.js";

const NOW = "2026-08-02T12:00:00Z";
const ID_A = "nid_aaaaaaaaaaaaaaaaaaaaaaaaa_e";
const ID_B = "nid_bbbbbbbbbbbbbbbbbbbbbbbbb_e";

let root: string;

function managerOf(nextId: string = ID_A): FileTicketManager {
    return FileTicketManager.forDirectory(join(root, "_tickets"), {
        clock: new FixedClock(NOW),
        newTicketId: () => nextId,
        defaultAssignee: () => "",
    });
}

interface TicketFileFields {
    readonly status?: string;
    readonly type?: string;
    readonly deps?: readonly string[];
    readonly statusUpdatedIso?: string;
}

/** A stamp long before `NOW`, so a test can tell a rewritten `status_updated_iso` from a kept one. */
const EARLIER = "2024-01-01T00:00:00Z";

function ticketFileOf(id: string, title: string, fields: TicketFileFields = {}): string {
    const lines = ["---", `id: ${id}`, `title: "${title}"`, `status: ${fields.status ?? "open"}`];
    if (fields.deps !== undefined) {
        lines.push(`deps: [${fields.deps.join(", ")}]`);
    }
    if (fields.type !== undefined) {
        lines.push(`type: ${fields.type}`);
    }
    if (fields.statusUpdatedIso !== undefined) {
        lines.push(`status_updated_iso: ${fields.statusUpdatedIso}`);
    }
    lines.push("---", "");
    return lines.join("\n");
}

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ticket-manager-test-"));
});

afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe("FileTicketManager.create", () => {
    it("writes the same bytes tk create writes, creating the directory", () => {
        const ticket = managerOf().create({ title: "My ticket", description: "Body text" });
        assert.equal(
            readFileSync(ticket.path, "utf8"),
            [
                "---",
                `id: ${ID_A}`,
                'title: "My ticket"',
                "status: open",
                "deps: []",
                "links: []",
                `created_iso: ${NOW}`,
                `status_updated_iso: ${NOW}`,
                "type: task",
                "priority: 2",
                "tags: []",
                "---",
                "",
                "Body text",
                "",
                "",
            ].join("\n"),
        );
    });

    it("stores a partial parent id as the full one", () => {
        const manager = managerOf(ID_B);
        mkdirSync(manager.ticketsDir, { recursive: true });
        writeFileSync(join(manager.ticketsDir, "existing.md"), ticketFileOf(ID_A, "Existing"));
        const child = manager.create({ title: "Child", parent: "aaa" });
        assert.equal(child.parent, ID_A);
    });

    it("creates no file when the parent does not resolve", () => {
        const manager = managerOf();
        assert.throws(() => manager.create({ title: "Child", parent: "nosuch" }), TicketNotFoundError);
        assert.deepEqual(manager.list(), []);
    });
});

describe("FileTicketManager.get", () => {
    beforeEach(() => {
        const manager = managerOf();
        manager.create({ title: "Aaa" });
        writeFileSync(join(manager.ticketsDir, "bbb.md"), ticketFileOf(ID_B, "Bbb"));
    });

    it("resolves a partial id", () => {
        assert.equal(managerOf().get("bbb").id, ID_B);
    });

    it("throws TicketNotFoundError for an unknown id", () => {
        assert.throws(() => managerOf().get("zzz"), TicketNotFoundError);
    });

    it("throws AmbiguousTicketIdError naming every match", () => {
        assert.throws(
            () => managerOf().get("nid_"),
            (error: unknown) =>
                error instanceof AmbiguousTicketIdError &&
                error.matchingIds.length === 2 &&
                error.matchingIds.includes(ID_A) &&
                error.matchingIds.includes(ID_B),
        );
    });
});

describe("FileTicketManager.setStatus", () => {
    it("persists the closed status with closed_iso", () => {
        const manager = managerOf();
        manager.create({ title: "Work" });
        manager.setStatus(ID_A, "closed");
        const reloaded = manager.get(ID_A);
        assert.equal(reloaded.frontmatter.getString("closed_iso"), NOW);
    });

    describe("GIVEN a ticket whose status_updated_iso predates the clock", () => {
        function managerWithStampedTicket(status: string): FileTicketManager {
            const manager = managerOf();
            mkdirSync(manager.ticketsDir, { recursive: true });
            writeFileSync(
                join(manager.ticketsDir, "work.md"),
                ticketFileOf(ID_A, "Work", { status, statusUpdatedIso: EARLIER }),
            );
            return manager;
        }

        it("WHEN its status changes THEN status_updated_iso is restamped from the clock", () => {
            const manager = managerWithStampedTicket("open");
            manager.setStatus(ID_A, "in_progress");
            assert.equal(manager.get(ID_A).frontmatter.getString("status_updated_iso"), NOW);
        });

        it("WHEN it is set to the status it already has THEN status_updated_iso is still restamped", () => {
            const manager = managerWithStampedTicket("in_progress");
            manager.setStatus(ID_A, "in_progress");
            assert.equal(manager.get(ID_A).frontmatter.getString("status_updated_iso"), NOW);
        });
    });
});

describe("FileTicketManager.setStatus with a custom status", () => {
    it("persists the custom status", () => {
        const manager = managerOf();
        manager.create({ title: "Work" });
        manager.setStatus(ID_A, CustomTicketStatusParser.of("p2"));
        assert.equal(manager.get(ID_A).status, "p2");
    });
});

describe("FileTicketManager.autoCloseEpics", () => {
    /** An epic over one task, with the task's status as given. */
    function epicOverTask(taskStatus: string): FileTicketManager {
        const manager = managerOf();
        mkdirSync(manager.ticketsDir, { recursive: true });
        writeFileSync(join(manager.ticketsDir, "task.md"), ticketFileOf(ID_A, "Task", { status: taskStatus }));
        writeFileSync(
            join(manager.ticketsDir, "epic.md"),
            ticketFileOf(ID_B, "Epic", { type: "epic", deps: [ID_A], statusUpdatedIso: EARLIER }),
        );
        return manager;
    }

    it("returns the epic it closed", () => {
        assert.deepEqual(
            epicOverTask("closed").autoCloseEpics().map((epic) => epic.id),
            [ID_B],
        );
    });

    it("persists the closed status to disk", () => {
        const manager = epicOverTask("closed");
        manager.autoCloseEpics();
        assert.equal(manager.get(ID_B).status, "closed");
    });

    it("stamps closed_iso from the clock", () => {
        const manager = epicOverTask("closed");
        manager.autoCloseEpics();
        assert.equal(manager.get(ID_B).frontmatter.getString("closed_iso"), NOW);
    });

    it("restamps status_updated_iso from the clock", () => {
        const manager = epicOverTask("closed");
        manager.autoCloseEpics();
        assert.equal(manager.get(ID_B).frontmatter.getString("status_updated_iso"), NOW);
    });

    it("leaves an epic with an open dependency alone", () => {
        const manager = epicOverTask("open");
        manager.autoCloseEpics();
        assert.equal(manager.get(ID_B).status, "open");
    });

    it("is idempotent: a second run closes nothing", () => {
        const manager = epicOverTask("closed");
        manager.autoCloseEpics();
        assert.deepEqual(manager.autoCloseEpics(), []);
    });
});

describe("FileTicketManager.addNote", () => {
    it("appends a timestamped note under a new Notes heading", () => {
        const manager = managerOf();
        const ticket = manager.create({ title: "Work" });
        manager.addNote(ID_A, "a note");
        assert.equal(
            readFileSync(ticket.path, "utf8").endsWith(`\n## Notes\n\n**${NOW}**\n\na note\n`),
            true,
        );
    });
});

describe("FileTicketManager.save", () => {
    it("persists a field edit made through Ticket.withField", () => {
        const manager = managerOf();
        const ticket = manager.create({ title: "Work" });
        manager.save(ticket.withField("assignee", "somebody"));
        assert.equal(manager.get(ID_A).assignee, "somebody");
    });
});

describe("FileTicketManager.list", () => {
    it("lists tickets in byte-wise path order", () => {
        const manager = managerOf();
        mkdirSync(manager.ticketsDir, { recursive: true });
        writeFileSync(join(manager.ticketsDir, "zz.md"), ticketFileOf(ID_A, "Zz"));
        writeFileSync(join(manager.ticketsDir, "aa.md"), ticketFileOf(ID_B, "Aa"));
        assert.deepEqual(
            manager.list().map((ticket) => ticket.id),
            [ID_B, ID_A],
        );
    });
});
