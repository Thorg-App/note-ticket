import { LINE_SEPARATOR } from "../../core/text.js";
import { TicketRelation } from "../../core/ticket-relations.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { UsageError } from "../cli-error.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";

/** bash `cmd_undep`'s usage line, which names the literal `ticket`, not the invoked name. */
const USAGE = "Usage: ticket undep <id> <dependency-id>";

/**
 * Printed on STDOUT although the command fails — bash `echo`s it without redirection and
 * returns 1. Several BDD scenarios assert exactly that combination.
 */
const NOT_FOUND = "Dependency not found";

/** `undep <id> <dependency-id>`: drop one dependency edge. */
export class UndepCommand {
    static run(store: TicketStore, args: readonly string[]): number {
        if (args.length < 2) {
            throw new UsageError([USAGE]);
        }
        const tickets = store.loadAll();
        const subject = TicketLookup.byId(tickets, args[0] as string);
        const dependency = TicketLookup.byId(tickets, args[1] as string);
        const updated = TicketRelation.DEPENDENCY.withRemoved(subject, dependency.id);
        if (updated === undefined) {
            process.stdout.write(`${NOT_FOUND}${LINE_SEPARATOR}`);
            return ExitCode.FAILURE;
        }
        store.save(updated);
        process.stdout.write(
            `Removed dependency: ${subject.id} -/-> ${dependency.id}${LINE_SEPARATOR}`,
        );
        return ExitCode.SUCCESS;
    }
}
