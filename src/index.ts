/**
 * Public entry point of the npm package: the `TicketManager` facade plus the core types a
 * consumer needs to use it. `src/cli/` is deliberately NOT exported — the CLI is reachable
 * as the `ticket` bin, not as an API.
 *
 * The rule for what belongs here: every type NAMED IN A PUBLIC SIGNATURE must be exported,
 * or a consumer can read the value but cannot declare a variable holding it. `docs/npm-library.md`
 * is the prose guide to this surface.
 */

export type { NewTicketInput, TicketManager } from "./lib/ticket-manager.js";
export { FileTicketManager, type FileTicketManagerOptions } from "./lib/file-ticket-manager.js";
export { AmbiguousTicketIdError, TicketNotFoundError } from "./lib/ticket-manager-error.js";

export {
    Ticket,
    TicketField,
    TICKET_STATUS_OPEN,
    TICKET_STATUS_IN_PROGRESS,
    TICKET_STATUS_CLOSED,
    TICKET_STATUS_DONE,
    TICKET_STATUS_PUNTED,
    VALID_TICKET_STATUSES,
    type TicketStatus,
} from "./core/ticket.js";
export type { CreateOptions } from "./core/new-ticket.js";
// The frontmatter layer `Ticket.frontmatter` / `Ticket.document` hand back: without these a
// consumer cannot name the type of what those accessors return.
export {
    Frontmatter,
    FrontmatterValue,
    TicketDocument,
    type FrontmatterEntry,
    type FrontmatterJsonValue,
} from "./core/frontmatter.js";
export { TicketStore, TicketsDirectory, type TicketsDirResolution } from "./core/ticket-store.js";
export { TicketId, IdResolver, type IdCandidate, type IdResolution } from "./core/id.js";
export { TicketRelation, type RelationAddition } from "./core/ticket-relations.js";
export { DepGraph, type BlockedTicket, type DepCycle, type TreeOptions, type TreeRow } from "./core/dep-graph.js";
export { type Clock, SystemClock, FixedClock } from "./core/clock.js";
export {
    CorruptTicketFileError,
    MissingFrontmatterBlockError,
    MissingTicketIdError,
} from "./core/ticket-file-error.js";
export { FileSystemError, type FileOperation } from "./core/file-system-error.js";
