import { ChildExit, type ChildOutcome } from "./child-exit.js";
import { CliError } from "./cli-error.js";
import { ExitCode } from "./exit-codes.js";

/** `spawnSync`'s result, reduced to what deciding this process's exit code needs. */
export interface SpawnOutcome extends ChildOutcome {
    readonly error?: Error | undefined;
}

/**
 * The exit code adopted from a child this CLI handed work to (`jq`, `$PAGER`, `$EDITOR`), and
 * the ONE description of a child that never ran.
 *
 * WHY it is shared: all three children are bash constructs where the child's status WAS the
 * command's status, and all three exit 127 when the binary is not on PATH because that is
 * what the shell did. Three copies of that policy would drift the first time one of them
 * decided a missing binary is "just" a failure.
 */
export class SpawnedChild {
    /**
     * @param binary what to name in the failure message — the configured command, not argv[0]
     *   of this process.
     * @param hintLines extra unprefixed stderr lines, e.g. how to install the binary.
     *
     * WHY the outcome is read BEFORE `result.error`: a child killed mid-write reports BOTH
     * `signal: "SIGPIPE"` and `error: EPIPE` — the EPIPE is our failed write to a process that
     * is already gone, i.e. a symptom of the death the signal already describes. Measured:
     * checking `error` first turned every `query <filter> | head` into "jq could not be run".
     */
    static exitCode(
        outcome: SpawnOutcome,
        binary: string,
        hintLines: readonly string[] = [],
    ): number {
        const code = ChildExit.codeOf(outcome);
        if (code !== undefined) {
            return code;
        }
        throw SpawnedChild.unusable(binary, outcome.error, hintLines);
    }

    /**
     * DIVERGENCE (deliberate, whitelist #6 and #19): bash let the shell report a missing
     * binary, so the message named a LINE OF THE SCRIPT (`./ticket: line 308: jq: command not
     * found`). The exit code 127 is kept; the wording is one the user can act on.
     */
    private static unusable(
        binary: string,
        error: Error | undefined,
        hintLines: readonly string[],
    ): CliError {
        if (error === undefined) {
            return new CliError(`${binary} ended without an exit status`);
        }
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return new CliError(`${binary}: command not found`, hintLines, ExitCode.COMMAND_NOT_FOUND);
        }
        return new CliError(`${binary} could not be run: ${error.message}`);
    }
}
