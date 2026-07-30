import { IdResolver } from "../core/id.js";
import type { Ticket } from "../core/ticket.js";
import { CliError } from "./cli-error.js";

/** How one command words a failed id lookup on stderr. */
interface IdErrorWording {
    notFound(search: string): string;
    ambiguous(search: string): string;
}

/**
 * bash `ticket_path`'s wording, asserted by BDD scenarios for `show`, `dep`, `link`, ….
 */
const TICKET_PATH_WORDING: IdErrorWording = {
    notFound: (search) => `ticket '${search}' not found`,
    ambiguous: (search) => `ambiguous ID '${search}' matches multiple tickets`,
};

/**
 * bash `cmd_dep_tree`'s wording. It resolved the root with its own awk scan instead of
 * `ticket_path`, and phrased both failures differently — unquoted, and without the
 * "matches multiple tickets" tail. Preserved verbatim: the port changes the RESOLUTION
 * RULES here (see `TicketLookup.treeRootId`) and changing the wording on top of that would
 * be a second, unasked-for divergence.
 */
const DEP_TREE_WORDING: IdErrorWording = {
    notFound: (search) => `ticket ${search} not found`,
    ambiguous: (search) => `ambiguous ID ${search}`,
};

/**
 * Turns a user-supplied (possibly partial) id into a ticket — the ONE place the CLI
 * converts an `IdResolution` into a user-facing failure.
 */
export class TicketLookup {
    /** @throws CliError when the search matches no ticket, or more than one. */
    static byId(tickets: readonly Ticket[], search: string): Ticket {
        return TicketLookup.resolve(tickets, search, TICKET_PATH_WORDING);
    }

    /**
     * The root of a `dep tree`.
     *
     * DIVERGENCE (deliberate, human-approved — ticket nid_5g3eta9cf7yi6iukmscxma6wc_e):
     * bash matched the root by SUBSTRING only, so a full id that happens to be contained in
     * another ticket's id was reported "ambiguous" and the tree was unreachable; an empty
     * search matched everything (awk `index(s, "")` is 1) and untrimmed input matched
     * nothing. Routing through `IdResolver` gives `dep tree` the same rules every other
     * command already had: exact beats partial, input is trimmed, empty matches nothing.
     */
    static treeRootId(tickets: readonly Ticket[], search: string): string {
        return TicketLookup.resolve(tickets, search, DEP_TREE_WORDING).id;
    }

    private static resolve(tickets: readonly Ticket[], search: string, wording: IdErrorWording): Ticket {
        const byPath = new Map(tickets.map((ticket) => [ticket.path, ticket]));
        const candidates = tickets.map((ticket) => ({ id: ticket.id, path: ticket.path }));
        const resolution = new IdResolver(candidates).resolve(search);
        if (resolution.kind === "not-found") {
            throw new CliError(wording.notFound(resolution.search));
        }
        if (resolution.kind === "ambiguous") {
            throw new CliError(wording.ambiguous(resolution.search));
        }
        // The path is the key the candidates were built from, so the ticket is always there.
        return byPath.get(resolution.candidate.path) as Ticket;
    }
}
