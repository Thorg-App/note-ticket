/**
 * The public library facade another package takes a dependency on.
 *
 * Interface only — the file-backed implementation lives in `file-ticket-manager.ts`, so a
 * consumer (or a test double) can depend on this contract without pulling in any I/O.
 */

import type { CreateOptions } from "../core/new-ticket.js";
import type { Ticket, TicketStatus } from "../core/ticket.js";

/**
 * What a new ticket is created from. Every omitted field takes the same default the
 * `tk create` CLI uses (title `Untitled`, priority `2`, type `task`, assignee from
 * `git config user.name`, everything else empty/omitted).
 *
 * Values are written RAW, exactly as the CLI writes its flags: `tags` is a comma-separated
 * string, and `priority`/`type` are not validated.
 */
export type NewTicketInput = Partial<CreateOptions>;

/**
 * Manages the tickets of one tickets directory (`<git-repo-root>/_tickets` by default).
 *
 * Ids: every `id` parameter accepts a partial id with the CLI's resolution rules — an
 * exact match wins, otherwise the id must contain the text as a substring, and more than
 * one match at the winning tier is an error. Methods taking an id throw
 * `TicketNotFoundError` / `AmbiguousTicketIdError` (see `ticket-manager-error.ts`).
 *
 * Corrupt files: any method that reads tickets throws core's `CorruptTicketFileError`
 * when a `.md` file under the tickets directory has no frontmatter block or no `id`.
 * OS-level failures (permissions, read-only checkout) surface as core's `FileSystemError`.
 *
 * Concurrency: writes are atomic per file (write-then-rename), but there is no cross-file
 * locking — last write wins, exactly as with the CLI.
 */
export interface TicketManager {
    /** Absolute-or-as-given path of the tickets directory this manager operates on. */
    readonly ticketsDir: string;

    /** Every ticket, in byte-wise path order (the order `tk ls`/`tk query` list them). */
    list(): readonly Ticket[];

    /** The ticket `id` resolves to. */
    get(id: string): Ticket;

    /**
     * Create a new ticket file at the top level of the tickets directory (creating the
     * directory itself if needed) and return it. `input.parent` may be a partial id and is
     * stored as the full one.
     */
    create(input: NewTicketInput): Ticket;

    /**
     * Move a ticket to `status`, restamping `status_updated_iso` (and `closed_iso`, which
     * exists exactly while the ticket is closed). Returns the updated ticket.
     */
    setStatus(id: string, status: TicketStatus): Ticket;

    /**
     * Append a timestamped note under the ticket's `## Notes` heading (added only if the
     * file has none). Only appends bytes — the frontmatter is untouched and a symlinked
     * ticket file stays a symlink.
     */
    addNote(id: string, note: string): void;

    /**
     * Persist a ticket you modified through its immutable `withField`/`withoutField`/
     * `withArrayField` accessors — the escape hatch for field-level edits (deps, links,
     * tags, …) this interface has no dedicated method for.
     */
    save(ticket: Ticket): void;
}
