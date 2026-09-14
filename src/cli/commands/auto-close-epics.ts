import { EpicAutoClose } from "../../core/epic-auto-close.js";
import { LINE_SEPARATOR } from "../../core/text.js";
import { TICKET_STATUS_CLOSED } from "../../core/ticket.js";
import type { TicketStore } from "../../core/ticket-store.js";
import type { CommandEnvironment } from "../command-environment.js";
import { ExitCode } from "../exit-codes.js";

/** Said when the run found nothing: a mutating command that prints nothing looks broken. */
const NOTHING_TO_CLOSE = "No epics to auto-close";

/**
 * `auto-close-epics`: close every epic whose dependencies are all closed.
 *
 * WHY it is a command and never a side effect of `close`: closing an epic is a statement
 * about a body of work being finished, and the owner's rule is that the tool makes it only
 * when asked to. Nothing else in the CLI triggers it.
 *
 * Reversible by `reopen <id>`, and every closed id is named on stdout, so the run needs no
 * confirmation prompt.
 */
export class AutoCloseEpicsCommand {
    /**
     * WHY the clock is read once for the whole run: the epics closed here are closed by ONE
     * decision, so they carry one `closed_iso` rather than timestamps that drift apart on a
     * large directory. Same reasoning as `StatusCommand`'s single reading.
     */
    static run(store: TicketStore, environment: CommandEnvironment): number {
        const closed = EpicAutoClose.closedEpics(store.loadAll(), environment.clock.nowIso());
        for (const epic of closed) {
            store.save(epic);
        }
        process.stdout.write(AutoCloseEpicsCommand.report(closed.map((epic) => epic.id)));
        return ExitCode.SUCCESS;
    }

    /** One `Updated <id> -> closed` line per epic — `close`'s wording, so the two read alike. */
    private static report(ids: readonly string[]): string {
        const lines =
            ids.length === 0 ? [NOTHING_TO_CLOSE] : ids.map((id) => `Updated ${id} -> ${TICKET_STATUS_CLOSED}`);
        return lines.map((line) => `${line}${LINE_SEPARATOR}`).join("");
    }
}
