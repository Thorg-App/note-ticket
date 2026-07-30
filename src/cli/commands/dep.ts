import { LINE_SEPARATOR } from "../../core/text.js";
import { TicketRelation } from "../../core/ticket-relations.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { UsageError } from "../cli-error.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";
import { DepCycleCommand } from "./dep-cycle.js";
import { DepTreeCommand } from "./dep-tree.js";

const SUBCOMMAND_TREE = "tree";
const SUBCOMMAND_CYCLE = "cycle";

/** bash `cmd_dep`'s usage block, printed verbatim — it names the literal `ticket`. */
const USAGE = [
    "Usage: ticket dep <id> <dependency-id>",
    "       ticket dep tree <id>  - show dependency tree",
    "       ticket dep cycle      - find dependency cycles",
];

/** Reported on stdout, with exit 0, when the dependency is already recorded. */
const ALREADY_EXISTS = "Dependency already exists";

/**
 * `dep`: record that one ticket depends on another, plus the read-only `tree` and `cycle`
 * subcommands.
 *
 * Bash imposes no self-dependency and no cycle check here, and neither does this: `dep cycle`
 * exists precisely to report the cycles that were allowed to form.
 *
 * WHY-NOT refusing `dep a a` even though `link a a` IS refused (whitelist #17): a `deps` edge
 * is DIRECTED and part of a graph the tool already reasons about, so `a -> a` is a real,
 * reportable graph error — `dep cycle` names it and `ready`/`blocked` act on it, which is
 * strictly more useful to the user than a refusal at write time. A `links` entry carries no
 * graph semantics at all, so `a <-> a` is inert data nobody and nothing can act on. The
 * asymmetry is therefore deliberate, not an oversight. Filed for human sign-off on ticket
 * nid_r3mp6uylht7t77iwxtuqvhxv2_e.
 */
export class DepCommand {
    static run(store: TicketStore, args: readonly string[]): number {
        const subcommand = args[0];
        const rest = args.slice(1);
        if (subcommand === SUBCOMMAND_TREE) {
            return DepTreeCommand.run(store, rest);
        }
        if (subcommand === SUBCOMMAND_CYCLE) {
            return DepCycleCommand.run(store);
        }
        if (args.length < 2) {
            throw new UsageError(USAGE);
        }
        return DepCommand.add(store, args[0] as string, args[1] as string);
    }

    /**
     * Both ids are resolved before anything is written, so an unresolvable one mutates
     * nothing, and the dependency is stored as the dependency's FULL id whatever the user
     * typed.
     */
    private static add(store: TicketStore, subjectSearch: string, dependencySearch: string): number {
        const tickets = store.loadAll();
        const subject = TicketLookup.byId(tickets, subjectSearch);
        const dependency = TicketLookup.byId(tickets, dependencySearch);
        const updated = TicketRelation.DEPENDENCY.withAdded(subject, dependency.id);
        if (updated === undefined) {
            // Not an error in bash: an already-recorded dependency is the desired state.
            process.stdout.write(`${ALREADY_EXISTS}${LINE_SEPARATOR}`);
            return ExitCode.SUCCESS;
        }
        store.save(updated);
        process.stdout.write(
            `Added dependency: ${subject.id} -> ${dependency.id}${LINE_SEPARATOR}`,
        );
        return ExitCode.SUCCESS;
    }
}
