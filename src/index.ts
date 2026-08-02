/**
 * Public entry point of the npm package: the `TicketManager` facade plus the core types a
 * consumer needs to use it. `src/cli/` is deliberately NOT exported — the CLI is reachable
 * as the `tk` bin, not as an API.
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
    VALID_TICKET_STATUSES,
    type TicketStatus,
} from "./core/ticket.js";
export type { CreateOptions } from "./core/new-ticket.js";
export { TicketStore, TicketsDirectory, type TicketsDirResolution } from "./core/ticket-store.js";
export { TicketId, IdResolver, type IdCandidate, type IdResolution } from "./core/id.js";
export { TicketRelation, type RelationAddition } from "./core/ticket-relations.js";
export { DepGraph } from "./core/dep-graph.js";
export { type Clock, SystemClock, FixedClock } from "./core/clock.js";
export {
    CorruptTicketFileError,
    MissingFrontmatterBlockError,
    MissingTicketIdError,
} from "./core/ticket-file-error.js";
export { FileSystemError } from "./core/file-system-error.js";
