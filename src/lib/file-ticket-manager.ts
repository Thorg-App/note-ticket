/**
 * The file-backed `TicketManager`: the same on-disk behavior as the CLI commands, reusing
 * the same core pieces (`NewTicketDocument`, `StatusUpdate`, `TicketNote`, `TicketStore`),
 * so a library consumer and `tk` produce byte-identical files.
 */

import { type Clock, SystemClock } from "../core/clock.js";
import { Git } from "../core/git.js";
import { type IdResolution, IdResolver, TicketId } from "../core/id.js";
import { CreateOptionsDefaults, NewTicketDocument, type NewTicketFacts } from "../core/new-ticket.js";
import { Slug } from "../core/slug.js";
import { StatusUpdate } from "../core/status-update.js";
import { Ticket, type TicketStatus } from "../core/ticket.js";
import { TicketNote } from "../core/ticket-note.js";
import { TicketsDirectory, TicketStore } from "../core/ticket-store.js";
import type { NewTicketInput, TicketManager } from "./ticket-manager.js";
import { AmbiguousTicketIdError, TicketNotFoundError } from "./ticket-manager-error.js";

/** The `assignee:` line is omitted entirely when `git config user.name` says nothing. */
const NO_ASSIGNEE = "";

/**
 * The non-deterministic collaborators, injectable so a test asserting written bytes can
 * hold them still. Every omitted one is the real thing.
 */
export interface FileTicketManagerOptions {
    readonly clock?: Clock;
    readonly newTicketId?: () => string;
    /** Source of the assignee used when `create`'s input has none. */
    readonly defaultAssignee?: () => string;
}

export class FileTicketManager implements TicketManager {
    private readonly store: TicketStore;
    private readonly clock: Clock;
    private readonly newTicketId: () => string;
    private readonly defaultAssignee: () => string;

    private constructor(store: TicketStore, options: FileTicketManagerOptions) {
        this.store = store;
        this.clock = options.clock ?? new SystemClock();
        this.newTicketId = options.newTicketId ?? (() => TicketId.generate());
        this.defaultAssignee = options.defaultAssignee ?? (() => Git.configuredUserName() ?? NO_ASSIGNEE);
    }

    /** A manager over an explicit tickets directory (need not exist yet — `create` makes it). */
    static forDirectory(ticketsDir: string, options: FileTicketManagerOptions = {}): FileTicketManager {
        return new FileTicketManager(new TicketStore(ticketsDir), options);
    }

    /**
     * A manager over the directory the CLI would use from `cwd`: `<git-repo-root>/_tickets`.
     *
     * @throws Error when `cwd` is not inside a git repository.
     */
    static forRepository(cwd: string = process.cwd(), options: FileTicketManagerOptions = {}): FileTicketManager {
        const resolution = TicketsDirectory.resolve(cwd);
        if (resolution.kind === "no-git-repo") {
            throw new Error(`'${cwd}' is not inside a git repository`);
        }
        return FileTicketManager.forDirectory(resolution.path, options);
    }

    get ticketsDir(): string {
        return this.store.ticketsDir;
    }

    list(): readonly Ticket[] {
        return this.store.loadAll();
    }

    get(id: string): Ticket {
        return FileTicketManager.resolved(this.list(), id);
    }

    create(input: NewTicketInput): Ticket {
        const options = CreateOptionsDefaults.resolved(input);
        // As the CLI orders it: resolve the parent BEFORE writing anything, so an
        // unresolvable parent creates no file.
        const facts: NewTicketFacts = {
            id: this.newTicketId(),
            now: this.clock.nowIso(),
            parentId: options.parent === "" ? "" : this.get(options.parent).id,
            assignee: options.assignee ?? this.defaultAssignee(),
        };
        this.store.ensureDir();
        const title = NewTicketDocument.titleOf(options);
        const filename = Slug.uniqueFilename(title, (candidate) => this.store.topLevelFileExists(candidate));
        const ticket = new Ticket(this.store.pathForNewTicket(filename), NewTicketDocument.of(options, facts));
        this.store.save(ticket);
        return ticket;
    }

    setStatus(id: string, status: TicketStatus): Ticket {
        const updated = StatusUpdate.applied(this.get(id), status, this.clock.nowIso());
        this.store.save(updated);
        return updated;
    }

    addNote(id: string, note: string): void {
        const ticket = this.get(id);
        this.store.appendTo(ticket, TicketNote.appendedTo(ticket.text(), note, this.clock.nowIso()));
    }

    save(ticket: Ticket): void {
        this.store.save(ticket);
    }

    /** The ONE place an `IdResolution` becomes this facade's thrown errors. */
    private static resolved(tickets: readonly Ticket[], search: string): Ticket {
        const byId = new Map(tickets.map((ticket) => [ticket.id, ticket]));
        const resolution: IdResolution = new IdResolver(
            tickets.map((ticket) => ({ id: ticket.id, path: ticket.path })),
        ).resolve(search);
        switch (resolution.kind) {
            case "resolved":
                // The candidate came from `tickets`, so the map lookup cannot miss.
                return byId.get(resolution.candidate.id) as Ticket;
            case "not-found":
                throw new TicketNotFoundError(resolution.search);
            case "ambiguous":
                throw new AmbiguousTicketIdError(
                    resolution.search,
                    resolution.candidates.map((candidate) => candidate.id),
                );
        }
    }
}
