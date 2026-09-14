/**
 * Which epics an auto-close run closes, and what they look like afterwards. Pure — no I/O,
 * no output — so the caller decides when the bytes hit disk. Shared by the CLI's
 * `auto-close-epics` and the library's `TicketManager.autoCloseEpics`.
 */

import { DepGraph } from "./dep-graph.js";
import { StatusUpdate } from "./status-update.js";
import { type Ticket, TICKET_STATUS_CLOSED } from "./ticket.js";

export class EpicAutoClose {
    /**
     * Every epic whose tracked work is over, already moved to `closed` — SAVE the returned
     * tickets to apply the run. An empty list means there was nothing to close.
     *
     * Closing runs to a FIXED POINT: an epic that depends on another epic becomes closable the
     * moment that one closes, and settling it in a single run is what makes the command
     * idempotent. Without it, running `auto-close-epics` twice in a row would close more the
     * second time — a result the user has no way to predict from the first run's output.
     * A cycle of epics never closes, because no member ever loses its open dependency.
     *
     * `now` stamps every ticket the run closes, so one invocation reads as one event.
     */
    static closedEpics(tickets: readonly Ticket[], now: string): readonly Ticket[] {
        const closed: Ticket[] = [];
        let population = tickets;
        for (;;) {
            // Epics closed in an earlier round are `closed` in `population`, hence no longer
            // active, hence never returned twice.
            const round = DepGraph.build(population)
                .completedEpics()
                .map((epic) => StatusUpdate.applied(epic, TICKET_STATUS_CLOSED, now));
            if (round.length === 0) {
                return closed;
            }
            closed.push(...round);
            const byId = new Map(round.map((epic) => [epic.id, epic]));
            population = population.map((ticket) => byId.get(ticket.id) ?? ticket);
        }
    }
}
