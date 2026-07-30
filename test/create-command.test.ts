import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { FixedClock } from "../src/core/clock.js";
import { Ticket } from "../src/core/ticket.js";
import { TicketStore } from "../src/core/ticket-store.js";
import { CliError, UsageError } from "../src/cli/cli-error.js";
import { CommandEnvironment } from "../src/cli/command-environment.js";
import {
    CreateCommand,
    CreateOptionsParser,
    type NewTicketFacts,
    NewTicketDocument,
} from "../src/cli/commands/create.js";

const NOW = "2026-07-30T10:03:41Z";
const ID = "nid_aaaaaaaaaaaaaaaaaaaaaaaaa_e";

/** Facts a plain `tk create` produces: generated id, one clock reading, no parent/assignee. */
const BARE_FACTS: NewTicketFacts = { id: ID, now: NOW, parentId: "", assignee: "" };

function documentText(args: readonly string[], facts: NewTicketFacts = BARE_FACTS): string {
    return NewTicketDocument.of(CreateOptionsParser.parse(args), facts).text();
}

describe("CreateOptionsParser", () => {
    it("defaults priority to 2 and type to task", () => {
        const options = CreateOptionsParser.parse([]);
        assert.equal(`${options.priority}/${options.type}`, "2/task");
    });

    it("leaves the assignee unset so the git-config default can apply", () => {
        assert.equal(CreateOptionsParser.parse([]).assignee, undefined);
    });

    it("treats an explicitly empty -a as a chosen empty assignee", () => {
        assert.equal(CreateOptionsParser.parse(["-a", ""]).assignee, "");
    });

    it("lets the LAST positional win, as bash's repeated title= assignment does", () => {
        assert.equal(CreateOptionsParser.parse(["aa", "bb"]).title, "bb");
    });

    it("accepts a value that looks like a flag", () => {
        assert.equal(CreateOptionsParser.parse(["-d", "--not-a-flag"]).description, "--not-a-flag");
    });

    it("rejects an unknown flag with bash's un-prefixed wording", () => {
        assert.throws(
            () => CreateOptionsParser.parse(["y", "--bogus"]),
            (error: unknown) =>
                error instanceof UsageError && error.stderrText === "Unknown option: --bogus\n",
        );
    });

    it("rejects a bare hyphen, which bash's -*) arm also catches", () => {
        assert.throws(() => CreateOptionsParser.parse(["-"]), UsageError);
    });

    it("rejects a value-taking flag that ends the argument list", () => {
        assert.throws(
            () => CreateOptionsParser.parse(["x", "--design"]),
            (error: unknown) =>
                error instanceof CliError &&
                error.stderrText === "Error: option '--design' requires a value\n",
        );
    });
});

describe("NewTicketDocument", () => {
    // Golden bytes captured from bash `./ticket create bb` (ids/timestamps substituted).
    it("writes bash's frontmatter order and a body of one blank line", () => {
        assert.equal(
            documentText(["bb"]),
            [
                "---",
                `id: ${ID}`,
                'title: "bb"',
                "status: open",
                "deps: []",
                "links: []",
                `created_iso: ${NOW}`,
                `status_updated_iso: ${NOW}`,
                "type: task",
                "priority: 2",
                "---",
                "",
                "",
            ].join("\n"),
        );
    });

    // Golden bytes captured from bash `./ticket create 'Full Ticket "quoted"' -d ... --tags 'a,b , c'`.
    it("writes every optional field and section in bash's order", () => {
        const args = [
            'Full Ticket "quoted"',
            "-d",
            "desc line",
            "--design",
            "the design",
            "--acceptance",
            "accept crit",
            "-t",
            "bug",
            "-p",
            "1",
            "--external-ref",
            "JIRA-9",
            "--tags",
            "a,b , c",
        ];
        const facts: NewTicketFacts = { id: ID, now: NOW, parentId: "nid_parent_e", assignee: "Jane Doe" };
        assert.equal(
            documentText(args, facts),
            [
                "---",
                `id: ${ID}`,
                'title: "Full Ticket \\"quoted\\""',
                "status: open",
                "deps: []",
                "links: []",
                `created_iso: ${NOW}`,
                `status_updated_iso: ${NOW}`,
                "type: bug",
                "priority: 1",
                "assignee: Jane Doe",
                "external-ref: JIRA-9",
                "parent: nid_parent_e",
                "tags: [a, b ,  c]",
                "---",
                "",
                "desc line",
                "",
                "## Design",
                "",
                "the design",
                "",
                "## Acceptance Criteria",
                "",
                "accept crit",
                "",
                "",
            ].join("\n"),
        );
    });

    it("omits the assignee line entirely when nothing is configured", () => {
        assert.equal(documentText(["bb"]).includes("assignee"), false);
    });

    it("falls back to Untitled for a missing title", () => {
        assert.equal(documentText([]).includes('title: "Untitled"'), true);
    });

    it("falls back to Untitled for an EMPTY title, as bash ${title:-Untitled} does", () => {
        assert.equal(documentText([""]).includes('title: "Untitled"'), true);
    });

    it("spaces tags after every comma without trimming, as bash ${tags//,/, } does", () => {
        assert.equal(documentText(["t", "--tags", "a,b , c"]).includes("tags: [a, b ,  c]"), true);
    });

    it("emits the JSON line `create` prints, with full_path last", () => {
        const ticket = new Ticket("/x/_tickets/bb.md", NewTicketDocument.of(CreateOptionsParser.parse(["bb"]), BARE_FACTS));
        assert.equal(
            ticket.toJsonText(),
            `{"id":"${ID}","title":"bb","status":"open","deps":[],"links":[],` +
                `"created_iso":"${NOW}","status_updated_iso":"${NOW}","type":"task","priority":"2",` +
                `"full_path":"/x/_tickets/bb.md"}`,
        );
    });
});

const CONFIGURED_ASSIGNEE = "Configured Person";
const PARENT_ID = "nid_bbbbbbbbbbbbbbbbbbbbbbbbb_e";
const PARENT_FILE = [
    "---",
    `id: ${PARENT_ID}`,
    'title: "Parent"',
    "status: open",
    "---",
    "",
].join("\n");

/**
 * The whole command, run against a real throwaway tickets directory.
 *
 * WHY not only the pure `NewTicketDocument` tests above: the WIRING is a separate thing to
 * get wrong. Deleting the git-config assignee default or the `--parent` resolution changes
 * no pure function, and the emitted line's trailing newline is invisible to the BDD steps
 * (they `.strip()` and parse JSON).
 */
class CreateRun {
    readonly ticketsDir: string;
    private readonly root: string;

    constructor() {
        this.root = mkdtempSync(join(tmpdir(), "ticket-create-test-"));
        this.ticketsDir = join(this.root, "_tickets");
        new TicketStore(this.ticketsDir).ensureDir();
    }

    writeTicket(filename: string, text: string): void {
        writeFileSync(join(this.ticketsDir, filename), text);
    }

    /** @returns everything the command wrote to stdout, byte for byte. */
    run(args: readonly string[]): string {
        const environment = new CommandEnvironment(
            "tk",
            new FixedClock(NOW),
            () => ID,
            () => CONFIGURED_ASSIGNEE,
        );
        const written: string[] = [];
        const originalWrite = process.stdout.write.bind(process.stdout);
        process.stdout.write = ((chunk: string) => {
            written.push(chunk);
            return true;
        }) as typeof process.stdout.write;
        try {
            CreateCommand.run(new TicketStore(this.ticketsDir), args, environment);
        } finally {
            process.stdout.write = originalWrite;
        }
        return written.join("");
    }

    fileText(filename: string): string {
        return readFileSync(join(this.ticketsDir, filename), "utf8");
    }

    remove(): void {
        rmSync(this.root, { recursive: true, force: true });
    }
}

describe("CreateCommand", () => {
    let created: CreateRun;

    beforeEach(() => {
        created = new CreateRun();
    });

    afterEach(() => {
        created.remove();
    });

    it("terminates the JSON line with a newline", () => {
        assert.equal(created.run(["Bee"]).endsWith("}\n"), true);
    });

    it("prints exactly one line", () => {
        assert.equal(created.run(["Bee"]).split("\n").length, 2);
    });

    // Bash: `assignee=$(git config user.name 2>/dev/null || true)` when -a is absent.
    it("falls back to the configured user name as the assignee", () => {
        created.run(["Bee"]);
        assert.equal(created.fileText("bee.md").includes(`assignee: ${CONFIGURED_ASSIGNEE}`), true);
    });

    it("lets an explicit -a override the configured user name", () => {
        created.run(["Bee", "-a", "Someone Else"]);
        assert.equal(created.fileText("bee.md").includes("assignee: Someone Else"), true);
    });

    // A PARTIAL `--parent` must be stored expanded, so the link does not depend on which
    // abbreviation happened to be unique on the day it was typed.
    it("stores a partial --parent as the FULL parent id", () => {
        created.writeTicket("parent.md", PARENT_FILE);
        created.run(["Kid", "--parent", "bbbbb"]);
        assert.equal(created.fileText("kid.md").includes(`parent: ${PARENT_ID}`), true);
    });

    it("writes nothing when --parent cannot be resolved", () => {
        created.writeTicket("parent.md", PARENT_FILE);
        assert.throws(() => created.run(["Kid", "--parent", "zzz"]), CliError);
        assert.throws(() => created.fileText("kid.md"));
    });
});
