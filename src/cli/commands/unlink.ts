import { LINE_SEPARATOR } from "../../core/text.js";
import { TicketRelation } from "../../core/ticket-relations.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { UsageError } from "../cli-error.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";

/** bash `cmd_unlink`'s usage line, which names the literal `ticket`, not the invoked name. */
const USAGE = "Usage: ticket unlink <id> <target-id>";

/** Printed on STDOUT although the command fails with 1 — bash `echo`s it undirected. */
const NOT_FOUND = "Link not found";

/** `unlink <id> <target-id>`: drop a link from both sides. */
export class UnlinkCommand {
    /**
     * Only the SUBJECT's links decide whether the link exists, as in bash: a half link (the
     * target names the subject but not the other way round) reports `Link not found` and
     * changes nothing, while the reverse half is cleaned up silently.
     */
    static run(store: TicketStore, args: readonly string[]): number {
        if (args.length < 2) {
            throw new UsageError([USAGE]);
        }
        const tickets = store.loadAll();
        const subject = TicketLookup.byId(tickets, args[0] as string);
        const target = TicketLookup.byId(tickets, args[1] as string);
        const updatedSubject = TicketRelation.LINK.withRemoved(subject, target.id);
        if (updatedSubject === undefined) {
            process.stdout.write(`${NOT_FOUND}${LINE_SEPARATOR}`);
            return ExitCode.FAILURE;
        }
        store.save(updatedSubject);
        const updatedTarget = TicketRelation.LINK.withRemoved(target, subject.id);
        if (updatedTarget !== undefined) {
            store.save(updatedTarget);
        }
        process.stdout.write(`Removed link: ${subject.id} <-> ${target.id}${LINE_SEPARATOR}`);
        return ExitCode.SUCCESS;
    }
}
