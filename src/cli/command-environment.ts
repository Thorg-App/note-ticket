import { type Clock, SystemClock } from "../core/clock.js";
import { Git } from "../core/git.js";
import { TicketId } from "../core/id.js";
import { ProgramName } from "./program-name.js";
import { ProcessTerminal, type Terminal } from "./terminal.js";

/** Bash omits the `assignee:` line entirely when `git config user.name` says nothing. */
const NO_ASSIGNEE = "";

/**
 * What a command needs from the ambient process, beyond its arguments and the tickets
 * directory: the invoked program name (usage text), the clock, the two sources of freshly
 * generated content `create` uses, and the standard streams (`add-note`, `edit`).
 *
 * WHY this exists rather than each command reaching for the globals: all of them are
 * non-deterministic or environment-dependent, which is exactly what a unit test asserting
 * the bytes of a written ticket has to hold still. `forProcess()` is the one place the real
 * environment is bound.
 */
export class CommandEnvironment {
    constructor(
        readonly programName: string,
        readonly clock: Clock,
        readonly newTicketId: () => string = () => TicketId.generate(),
        readonly defaultAssignee: () => string = () => Git.configuredUserName() ?? NO_ASSIGNEE,
        readonly terminal: Terminal = new ProcessTerminal(),
    ) {}

    static forProcess(): CommandEnvironment {
        return new CommandEnvironment(ProgramName.invoked(), new SystemClock());
    }
}
