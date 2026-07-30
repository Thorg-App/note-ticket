import { LINE_SEPARATOR } from "../../core/text.js";
import type { Ticket } from "../../core/ticket.js";
import { TicketRelation } from "../../core/ticket-relations.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { CliError, UsageError } from "../cli-error.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";

/** bash `cmd_link`'s usage line, which names the literal `ticket`, not the invoked name. */
const USAGE = "Usage: ticket link <id> <id> [id...]";

/** Printed on stdout, with exit 0, when every pairing was already recorded. */
const ALREADY_LINKED = "All links already exist";

/** What the symmetric closure produced: the tickets to save, and how many ids were new. */
export interface LinkClosureResult {
    /** Only the tickets that actually changed — an unchanged one is not rewritten. */
    readonly updated: readonly Ticket[];
    /** Total ids appended across all tickets; 0 means everything was already linked. */
    readonly addedCount: number;
}

/**
 * `link`'s core rule: every named ticket ends up carrying every OTHER named ticket's id.
 *
 * Pure, so the resulting file bytes and the reported count can be asserted directly.
 */
export class LinkClosure {
    /**
     * DIVERGENCE (deliberate, whitelist #18): ids are appended in the order the user named
     * them. bash appended them with awk's `for (id in need)`, i.e. in hash order — measured
     * as `[c, b]` for `link a b c`, but unspecified and free to change between awk builds.
     */
    static applied(tickets: readonly Ticket[]): LinkClosureResult {
        const ids = tickets.map((ticket) => ticket.id);
        const updated: Ticket[] = [];
        let addedCount = 0;
        tickets.forEach((ticket, index) => {
            const others = ids.filter((_id, position) => position !== index);
            const addition = TicketRelation.LINK.withAllAdded(ticket, others);
            if (addition.addedCount > 0) {
                updated.push(addition.ticket);
                addedCount += addition.addedCount;
            }
        });
        return { updated, addedCount };
    }
}

/** `link <id> <id> [id...]`: relate two or more tickets to each other, symmetrically. */
export class LinkCommand {
    static run(store: TicketStore, args: readonly string[]): number {
        if (args.length < 2) {
            throw new UsageError([USAGE]);
        }
        const tickets = LinkCommand.resolve(store, args);
        const closure = LinkClosure.applied(tickets);
        for (const ticket of closure.updated) {
            store.save(ticket);
        }
        process.stdout.write(LinkCommand.report(closure.addedCount, tickets.length));
        return ExitCode.SUCCESS;
    }

    /**
     * Every argument as a ticket, distinct, in the order named. ALL of them are resolved
     * before the first write, so one bad id leaves the whole set untouched.
     *
     * DIVERGENCE (deliberate, whitelist #17): arguments that name the SAME ticket collapse to
     * one entry, and a set that collapses to a single ticket is refused. bash treated a
     * repeated id as another ticket to link, so `ticket link a a` recorded `a` as related to
     * itself and reported `Added 1 link(s) between 2 tickets`.
     *
     * WHY this is refused while `dep a a` is still recorded: a `links` entry has no graph
     * semantics, so a ticket linked to itself is inert data no reader can act on; a `deps`
     * edge IS part of a graph, so a self-edge is a real error that `dep cycle` reports and
     * `ready`/`blocked` act on. See the WHY-NOT in `dep.ts` and ticket
     * nid_r3mp6uylht7t77iwxtuqvhxv2_e (tag `decide`) for the human sign-off.
     */
    private static resolve(store: TicketStore, args: readonly string[]): readonly Ticket[] {
        const all = store.loadAll();
        // The first argument is resolved on its own so that "the one ticket everything
        // collapsed to" is a value the types guarantee exists, with no unreachable branch.
        const first = TicketLookup.byId(all, args[0] as string);
        const distinct = new Map<string, Ticket>([[first.id, first]]);
        for (const search of args.slice(1)) {
            const ticket = TicketLookup.byId(all, search);
            if (!distinct.has(ticket.id)) {
                distinct.set(ticket.id, ticket);
            }
        }
        if (distinct.size < 2) {
            throw new CliError(`nothing to link: every id resolves to ticket ${first.id}`);
        }
        return [...distinct.values()];
    }

    private static report(addedCount: number, ticketCount: number): string {
        if (addedCount === 0) {
            return `${ALREADY_LINKED}${LINE_SEPARATOR}`;
        }
        return `Added ${addedCount} link(s) between ${ticketCount} tickets${LINE_SEPARATOR}`;
    }
}
