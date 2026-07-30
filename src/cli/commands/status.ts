import {
    TICKET_STATUS_CLOSED,
    TICKET_STATUS_IN_PROGRESS,
    TICKET_STATUS_OPEN,
    type Ticket,
    TicketField,
    type TicketStatus,
    VALID_TICKET_STATUSES,
} from "../../core/ticket.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { CliError, UsageError } from "../cli-error.js";
import type { CommandEnvironment } from "../command-environment.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";
import { LINE_SEPARATOR } from "../../core/text.js";

/** The `Valid statuses:` tail bash prints, and the list its error message names. */
const STATUS_LIST = VALID_TICKET_STATUSES.join(" ");

/**
 * A command that is `status` with the status already decided.
 *
 * WHY as data: bash's `cmd_start`/`cmd_close`/`cmd_reopen` differ in exactly two tokens —
 * the name in their usage line and the status they pass on — and then delegate.
 */
export interface StatusWrapper {
    readonly command: string;
    readonly status: TicketStatus;
}

/**
 * The ONE place user-typed text becomes a `TicketStatus`. Past this boundary the status is
 * a union member, so no downstream signature has to re-check it.
 */
export class TicketStatusArgument {
    /** @throws CliError naming the accepted statuses, as bash `validate_status` does. */
    static parsed(text: string): TicketStatus {
        const status = VALID_TICKET_STATUSES.find((valid) => valid === text);
        if (status === undefined) {
            throw new CliError(`invalid status '${text}'. Must be one of: ${STATUS_LIST}`);
        }
        return status;
    }
}

export const STATUS_WRAPPERS = {
    start: { command: "start", status: TICKET_STATUS_IN_PROGRESS },
    close: { command: "close", status: TICKET_STATUS_CLOSED },
    reopen: { command: "reopen", status: TICKET_STATUS_OPEN },
} as const satisfies Record<string, StatusWrapper>;

/**
 * The frontmatter change a status move makes. Pure — no I/O, no output — so the resulting
 * file bytes (key order included) can be asserted directly.
 */
export class StatusUpdate {
    /**
     * The ticket with its status and stamps updated. `closed_iso` records when work ENDED, so
     * it is written only while the ticket is closed and dropped again on any other status —
     * a reopened ticket that kept a `closed_iso` would misreport as finished work.
     *
     * A field the file does not have yet is inserted as the FIRST frontmatter entry
     * (`Frontmatter.withField`), which is where bash's `sed` insert lands it.
     */
    static applied(ticket: Ticket, status: TicketStatus, now: string): Ticket {
        const updated = ticket
            .withField(TicketField.STATUS, status)
            .withField(TicketField.STATUS_UPDATED_ISO, now);
        return status === TICKET_STATUS_CLOSED
            ? updated.withField(TicketField.CLOSED_ISO, now)
            : updated.withoutField(TicketField.CLOSED_ISO);
    }
}

/**
 * `status <id> <status>` and its fixed-status wrappers: move one ticket to a new status and
 * restamp the timestamps that describe the move.
 */
export class StatusCommand {
    static run(store: TicketStore, args: readonly string[], environment: CommandEnvironment): number {
        if (args.length < 2) {
            throw new UsageError([
                `Usage: ${environment.programName} status <id> <status>`,
                `Valid statuses: ${STATUS_LIST}`,
            ]);
        }
        return StatusCommand.apply(
            store,
            args[0] as string,
            TicketStatusArgument.parsed(args[1] as string),
            environment,
        );
    }

    static runWrapper(
        store: TicketStore,
        args: readonly string[],
        environment: CommandEnvironment,
        wrapper: StatusWrapper,
    ): number {
        if (args.length < 1) {
            throw new UsageError([`Usage: ${environment.programName} ${wrapper.command} <id>`]);
        }
        return StatusCommand.apply(store, args[0] as string, wrapper.status, environment);
    }

    /**
     * Bash's order of operations, which decides what a failure leaves behind: the status is
     * validated BEFORE the id is resolved (the caller's `TicketStatusArgument.parsed` is
     * that check), and the id is resolved before anything is written.
     * An unresolvable id therefore mutates NOTHING — including the empty id an unset shell
     * variable expands to (`tk close "$UNSET_VAR"`), which matches no ticket at all.
     *
     * WHY the clock is read once: bash calls `_iso_date` separately for `status_updated_iso`
     * and `closed_iso`, so the two can differ by a second on a slow machine although they
     * describe the same event. One reading is the same contract without the seam.
     */
    private static apply(
        store: TicketStore,
        search: string,
        status: TicketStatus,
        environment: CommandEnvironment,
    ): number {
        const ticket = TicketLookup.byId(store.loadAll(), search);
        store.save(StatusUpdate.applied(ticket, status, environment.clock.nowIso()));
        process.stdout.write(`Updated ${ticket.id} -> ${status}${LINE_SEPARATOR}`);
        return ExitCode.SUCCESS;
    }
}
