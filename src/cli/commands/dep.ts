import type { TicketStore } from "../../core/ticket-store.js";
import { UsageError } from "../cli-error.js";
import { DepCycleCommand } from "./dep-cycle.js";
import { DepTreeCommand } from "./dep-tree.js";

const SUBCOMMAND_TREE = "tree";
const SUBCOMMAND_CYCLE = "cycle";

/** bash `cmd_dep`'s usage block, printed verbatim. */
const USAGE = [
    "Usage: ticket dep <id> <dependency-id>",
    "       ticket dep tree <id>  - show dependency tree",
    "       ticket dep cycle      - find dependency cycles",
];

/**
 * `dep`'s READ-ONLY subcommands, `tree` and `cycle`.
 *
 * WHY only those two: `dep` is one command name whose default form `dep <id> <dep-id>` is a
 * WRITE, still served by bash (ticket T5). The bash `cmd_dep` therefore delegates only its
 * `tree` and `cycle` branches here — see `TS_DEP_SUBCOMMANDS` in ./ticket — so the default
 * form never reaches this class. Reaching it anyway means the bundle was invoked directly,
 * and the honest answer is the usage bash would print.
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
        throw new UsageError(USAGE);
    }
}
