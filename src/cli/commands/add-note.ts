import { LINE_SEPARATOR } from "../../core/text.js";
import { TicketNote } from "../../core/ticket-note.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { CliError, UsageError } from "../cli-error.js";
import type { CommandEnvironment } from "../command-environment.js";
import { ExitCode } from "../exit-codes.js";
import type { Terminal } from "../terminal.js";
import { TicketLookup } from "../ticket-lookup.js";

/** bash `cmd_add_note`'s usage line, which names the literal `ticket`, not the invoked name. */
const USAGE = "Usage: ticket add-note <id> [note text]";

/** With no text to append and no stdin to read it from, there is nothing to do. */
const NO_NOTE = "no note provided";

/** bash `note="$*"` with a default IFS. */
const ARGUMENT_SEPARATOR = " ";

/** bash's `$( )` strips trailing NEWLINES from a command substitution, nothing else. */
const TRAILING_NEWLINES = /\n+$/;

/**
 * Where the note text comes from, in bash's order of preference.
 *
 * Kept apart from the file mutation because the three sources have nothing to do with the
 * bytes appended, and only this part needs to know about terminals.
 */
export class NoteText {
    /**
     * @param textArguments everything after the id.
     *
     * WHY reading stdin is gated on it not being a terminal: with no arguments and a terminal
     * on stdin, `cat` would sit there waiting for a note the user has no way to know is
     * expected. bash tested `[ ! -t 0 ]` for that reason.
     *
     * NB a redirected-but-empty stdin (`tk add-note x </dev/null`, which is how the BDD suite
     * runs every command) is NOT the "no note" case: it yields an EMPTY note and succeeds,
     * exactly as bash does.
     */
    static from(textArguments: readonly string[], terminal: Terminal): string {
        if (textArguments.length > 0) {
            return textArguments.join(ARGUMENT_SEPARATOR);
        }
        if (terminal.isStdinTerminal()) {
            throw new CliError(NO_NOTE);
        }
        return terminal.readStdin().replace(TRAILING_NEWLINES, "");
    }
}

/** `add-note <id> [note text]`: append a timestamped note to a ticket's Notes section. */
export class AddNoteCommand {
    /**
     * WHY the id is resolved BEFORE the note is obtained: bash resolves it first, so
     * `tk add-note nosuchticket` reports the unknown id rather than sitting on stdin (or
     * complaining about a missing note).
     */
    static run(
        store: TicketStore,
        args: readonly string[],
        environment: CommandEnvironment,
    ): number {
        if (args.length < 1) {
            throw new UsageError([USAGE]);
        }
        const ticket = TicketLookup.byId(store.loadAll(), args[0] as string);
        const note = NoteText.from(args.slice(1), environment.terminal);
        // `text()` round trips the file byte-for-byte, so this is what bash's `grep` scanned.
        const appended = TicketNote.appendedTo(ticket.text(), note, environment.clock.nowIso());
        store.appendTo(ticket, appended);
        process.stdout.write(`Note added to ${ticket.id}${LINE_SEPARATOR}`);
        return ExitCode.SUCCESS;
    }
}
