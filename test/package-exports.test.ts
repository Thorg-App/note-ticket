/**
 * The npm package's PUBLIC SURFACE, as `docs/npm-library.md` documents it.
 *
 * WHY this exists separately from the behavior tests: every other test imports the module it
 * exercises directly, so `src/index.ts` could drop an export — the only thing a consumer can
 * import — and stay green. The type-only names below are checked by `make typecheck`, which
 * includes `test/`: referencing one in a type position fails to compile if it stops being
 * exported.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import * as pkg from "../src/index.js";
import type {
    BlockedTicket,
    Clock,
    CreateOptions,
    DepCycle,
    FileOperation,
    FileTicketManagerOptions,
    FrontmatterEntry,
    FrontmatterJsonValue,
    IdCandidate,
    IdResolution,
    NewTicketInput,
    RelationAddition,
    TicketManager,
    TicketStatus,
    TicketsDirResolution,
    TreeOptions,
    TreeRow,
} from "../src/index.js";

/** Every value export a consumer is documented to reach for. */
const EXPORTED_VALUES = [
    "FileTicketManager",
    "TicketNotFoundError",
    "AmbiguousTicketIdError",
    "Ticket",
    "TicketField",
    "TICKET_STATUS_OPEN",
    "TICKET_STATUS_IN_PROGRESS",
    "TICKET_STATUS_CLOSED",
    "TICKET_STATUS_DONE",
    "VALID_TICKET_STATUSES",
    "Frontmatter",
    "FrontmatterValue",
    "TicketDocument",
    "TicketStore",
    "TicketsDirectory",
    "TicketId",
    "IdResolver",
    "TicketRelation",
    "DepGraph",
    "SystemClock",
    "FixedClock",
    "CorruptTicketFileError",
    "MissingFrontmatterBlockError",
    "MissingTicketIdError",
    "FileSystemError",
] as const;

describe("package entry point", () => {
    for (const name of EXPORTED_VALUES) {
        it(`exports ${name}`, () => {
            assert.ok(name in pkg, `src/index.ts no longer exports ${name}`);
        });
    }

    it("exports every type named in the public signatures", () => {
        // Compile-time only: naming each type here is the assertion. The runtime check is
        // just something for the test runner to count.
        const named: {
            blocked?: BlockedTicket;
            clock?: Clock;
            createOptions?: CreateOptions;
            cycle?: DepCycle;
            fileOperation?: FileOperation;
            managerOptions?: FileTicketManagerOptions;
            frontmatterEntry?: FrontmatterEntry;
            frontmatterJson?: FrontmatterJsonValue;
            idCandidate?: IdCandidate;
            idResolution?: IdResolution;
            newTicket?: NewTicketInput;
            relationAddition?: RelationAddition;
            manager?: TicketManager;
            status?: TicketStatus;
            ticketsDir?: TicketsDirResolution;
            treeOptions?: TreeOptions;
            treeRow?: TreeRow;
        } = {};
        assert.deepEqual(named, {});
    });
});
