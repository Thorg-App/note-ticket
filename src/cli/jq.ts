import { spawnSync } from "node:child_process";

import { ChildExit } from "./child-exit.js";
import { CliError } from "./cli-error.js";
import { ExitCode } from "./exit-codes.js";

const JQ_BINARY = "jq";
const JQ_COMPACT_OUTPUT = "-c";
const JQ_HINT = "Install jq, or run `query` without a filter";

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
     *
     * WHY 128+signal when jq is killed: `tk query <filter> | head -1` kills jq with SIGPIPE,
     * and bash's pipeline reported 141 for exactly that. jq is a real child here too, so the
     * shell convention reproduces bash's code instead of flattening it to a generic 1.
     *
     * WHY the outcome is read BEFORE `result.error`: when jq dies mid-input, spawnSync reports
     * BOTH `signal: "SIGPIPE"` and `error: EPIPE` — the EPIPE is our failed write to a child
     * that is already gone, i.e. a symptom of the death the signal already describes.
     * Measured. Checking `error` first turned every `query <filter> | head` into "jq could
     * not be run", exit 1.
     */
    static select(jsonl: string, expression: string): number {
        const result = spawnSync(JQ_BINARY, [JQ_COMPACT_OUTPUT, `select(${expression})`], {
            input: jsonl,
            stdio: ["pipe", "inherit", "inherit"],
        });
        const code = ChildExit.codeOf(result);
        if (code !== undefined) {
            return code;
        }
        // No outcome at all: jq never ran (or node could not tell us how it ended).
        throw Jq.unusable(result.error);
    }

    /**
     * DIVERGENCE (deliberate): with no `jq` on PATH bash emitted the shell's own
     * `line NNN: jq: command not found`, which names a line of the script. The exit code 127
     * is kept; the message is one the user can act on.
     */
    private static unusable(error: Error | undefined): CliError {
        if (error === undefined) {
            return new CliError(`${JQ_BINARY} ended without an exit status`);
        }
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return new CliError(`${JQ_BINARY}: command not found`, [JQ_HINT], ExitCode.COMMAND_NOT_FOUND);
        }
        return new CliError(`${JQ_BINARY} could not be run: ${error.message}`);
    }
}
