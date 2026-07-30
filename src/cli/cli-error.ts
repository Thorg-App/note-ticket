import { ExitCode } from "./exit-codes.js";
import { LINE_SEPARATOR } from "../core/text.js";

const ERROR_PREFIX = "Error: ";

/**
 * A failure whose text is meant for the user, and the ONE place that knows how such a
 * failure looks on stderr. Every user-facing failure is raised as this type so the
 * dispatcher never has a second rendering path to keep in step.
 *
 * Anything NOT of this type is a bug and is allowed to crash with a stack trace rather
 * than being dressed up as a usage error.
 */
export class CliError extends Error {
    /**
     * @param message the `Error: `-prefixed first line.
     * @param detailLines follow-up lines printed WITHOUT the prefix, as bash does for its
     *   "Run inside a git repo, or set TICKETS_DIR env var" hint.
     * @param exitCode process exit code; 1 for every usage error, overridden only where bash
     *   produced a different one (a missing `jq` exits 127, the shell's "command not found").
     */
    constructor(
        message: string,
        readonly detailLines: readonly string[] = [],
        readonly exitCode: number = ExitCode.FAILURE,
    ) {
        super(message);
        this.name = "CliError";
    }

    /** Exactly what goes to stderr, trailing newline included. */
    get stderrText(): string {
        return [`${ERROR_PREFIX}${this.message}`, ...this.detailLines]
            .map((line) => `${line}${LINE_SEPARATOR}`)
            .join("");
    }
}

/**
 * A command invoked with the wrong arguments, told as bash tells it: the `Usage:` lines
 * verbatim, with NO `Error: ` prefix. Same exit code 1 as any other failure.
 *
 * WHY a subclass rather than a flag on CliError: the dispatcher has exactly one rendering
 * path (`stderrText`), and this is the second rendering, not a second kind of message.
 */
export class UsageError extends CliError {
    constructor(readonly usageLines: readonly string[]) {
        super(usageLines[0] ?? "", usageLines.slice(1));
        this.name = "UsageError";
    }

    override get stderrText(): string {
        return this.usageLines.map((line) => `${line}${LINE_SEPARATOR}`).join("");
    }
}
