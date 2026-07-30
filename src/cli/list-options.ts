import { CliError } from "./cli-error.js";
import { TicketFilter } from "./ticket-filter.js";

const OPTION_STATUS = "--status=";
const OPTION_ASSIGNEE_SHORT = "-a";
const OPTION_ASSIGNEE = "--assignee=";
const OPTION_TAG_SHORT = "-T";
const OPTION_TAG = "--tag=";
const OPTION_LIMIT = "--limit=";

/**
 * Command-line options of the listing commands (`ls`, `ready`, `blocked`, `closed`).
 *
 * WHY one parser for the union of the four flag sets rather than one per command: each
 * bash command loop consumes `-a`/`-T` values identically and silently skips anything it
 * does not recognise (`*) shift`), so parsing the union and letting each command read only
 * the fields it cares about is observationally identical. Verified against ./ticket:
 * `ls --limit=1` ignores the limit and `ready --status=X` ignores the status.
 */
export class ListOptions {
    private constructor(
        /** Status + assignee + tag. Only `ls` accepts a status, so only `ls` uses this. */
        readonly filter: TicketFilter,
        /** Raw `--limit=` text, empty when absent. Only `closed` reads it. */
        readonly limitText: string,
    ) {}

    /** Assignee + tag only — the filter of every command that fixes the status itself. */
    get filterIgnoringStatus(): TicketFilter {
        return this.filter.ignoringStatus();
    }

    static parse(args: readonly string[]): ListOptions {
        let status = "";
        let assignee = "";
        let tag = "";
        let limit = "";
        for (let index = 0; index < args.length; index++) {
            const arg = args[index] as string;
            if (arg.startsWith(OPTION_STATUS)) {
                status = ListOptions.inlineValue(arg, OPTION_STATUS);
            } else if (arg.startsWith(OPTION_ASSIGNEE)) {
                assignee = ListOptions.inlineValue(arg, OPTION_ASSIGNEE);
            } else if (arg.startsWith(OPTION_TAG)) {
                tag = ListOptions.inlineValue(arg, OPTION_TAG);
            } else if (arg.startsWith(OPTION_LIMIT)) {
                limit = ListOptions.inlineValue(arg, OPTION_LIMIT);
            } else if (arg === OPTION_ASSIGNEE_SHORT) {
                assignee = ListOptions.separateValue(args, ++index, arg);
            } else if (arg === OPTION_TAG_SHORT) {
                tag = ListOptions.separateValue(args, ++index, arg);
            }
            // Unrecognised arguments are skipped, as in bash.
        }
        return new ListOptions(new TicketFilter(status, assignee, tag), limit);
    }

    private static inlineValue(arg: string, prefix: string): string {
        return arg.slice(prefix.length);
    }

    /**
     * The next argument, whatever it looks like — bash takes `$2` unconditionally, so
     * `-a -T` really does filter on the assignee `-T`.
     *
     * DIVERGENCE (deliberate): with no next argument bash dies on `set -u` with
     * `$2: unbound variable` and a bash line number, which cannot be reproduced. The
     * exit code is kept and the message made intelligible.
     */
    private static separateValue(args: readonly string[], index: number, flag: string): string {
        const value = args[index];
        if (value === undefined) {
            throw new CliError(`option '${flag}' requires a value`);
        }
        return value;
    }
}
