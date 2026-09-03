import { LINE_SEPARATOR } from "../../core/text.js";
import { TicketField, type TicketProfile, VALID_TICKET_PROFILES } from "../../core/ticket.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { ChoiceArgument } from "../choice-argument.js";
import { UsageError } from "../cli-error.js";
import type { CommandEnvironment } from "../command-environment.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";

/** The ONE place user-typed text becomes a `TicketProfile` — see `ChoiceArgument`. */
export const TicketProfileArgument = new ChoiceArgument("profile", VALID_TICKET_PROFILES);

/**
 * `profile <id> <profile>`: set one ticket's optional `profile` field.
 *
 * WHY no unset and no default: the field is set only when asked. A ticket carries no profile
 * until this command writes one, so there is nothing to default and nothing to clear.
 */
export class ProfileCommand {
    static run(store: TicketStore, args: readonly string[], environment: CommandEnvironment): number {
        if (args.length < 2) {
            throw new UsageError([
                `Usage: ${environment.programName} profile <id> <profile>`,
                `Valid profiles: ${TicketProfileArgument.list}`,
            ]);
        }
        return ProfileCommand.apply(store, args[0] as string, TicketProfileArgument.parsed(args[1] as string));
    }

    /**
     * The profile is validated BEFORE the id is resolved (the caller's
     * `TicketProfileArgument.parsed` is that check), so an invalid profile is reported even
     * for a ticket that does not exist and an unresolvable id mutates nothing — the same
     * order of operations `StatusCommand` follows.
     */
    private static apply(store: TicketStore, search: string, profile: TicketProfile): number {
        const ticket = TicketLookup.byId(store.loadAll(), search);
        store.save(ticket.withField(TicketField.PROFILE, profile));
        process.stdout.write(`Updated ${ticket.id} profile -> ${profile}${LINE_SEPARATOR}`);
        return ExitCode.SUCCESS;
    }
}
