import { spawnSync } from "node:child_process";

import { CliError } from "./cli-error.js";

const JQ_BINARY = "jq";
const JQ_COMPACT_OUTPUT = "-c";
const JQ_HINT = "Install jq, or run `query` without a filter";

/** The shell's exit code for a command that is not on PATH, which is what bash produced. */
const COMMAND_NOT_FOUND_EXIT_CODE = 127;

/** A process that died of a signal reports no status; bash would say 128+signal. */
const SIGNALLED_EXIT_CODE = 1;

/**
 * The external `jq`, spawned rather than reimplemented.
 *
 * WHY-NOT a built-in filter language: `query [jq-filter]` promises jq's own syntax, and a
 * hand-rolled subset would silently disagree with it on exactly the expressions users reach
 * for. `jq` stays an optional external dependency, needed only when a filter is given.
 */
export class Jq {
    /**
     * Runs `jq -c "select(<expression>)"` over `jsonl`, exactly as bash pipes into it.
     * jq's stdout and stderr are this process's, and its exit code is returned unchanged
     * (a syntax error is jq's 3, an unmatched filter is still 0).
     */
    static select(jsonl: string, expression: string): number {
        const result = spawnSync(JQ_BINARY, [JQ_COMPACT_OUTPUT, `select(${expression})`], {
            input: jsonl,
            stdio: ["pipe", "inherit", "inherit"],
        });
        if (result.error !== undefined) {
            throw Jq.unusable(result.error);
        }
        return result.status ?? SIGNALLED_EXIT_CODE;
    }

    /**
     * DIVERGENCE (deliberate): with no `jq` on PATH bash emitted the shell's own
     * `line NNN: jq: command not found`, which names a line of the script. The exit code 127
     * is kept; the message is one the user can act on.
     */
    private static unusable(error: Error): CliError {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return new CliError(`${JQ_BINARY}: command not found`, [JQ_HINT], COMMAND_NOT_FOUND_EXIT_CODE);
        }
        return new CliError(`${JQ_BINARY} could not be run: ${error.message}`);
    }
}
