import { ExitCode } from "./exit-codes.js";

/** How a finished child process ended, as `spawnSync` reports it. */
export interface ChildOutcome {
    readonly status: number | null;
    readonly signal: NodeJS.Signals | null;
}

/**
 * The exit code this process adopts from a child it handed work to (`jq`, `$PAGER`).
 *
 * WHY the child's code is adopted at all: in bash these were pipeline members under
 * `set -o pipefail`, so their status WAS the command's status — a jq syntax error exits 3,
 * a pager killed by SIGPIPE exits 141. Flattening that to a generic 1 would break callers
 * that branch on the code.
 */
export class ChildExit {
    /**
     * `undefined` means the child produced no outcome at all, i.e. it never ran — the
     * caller decides how to describe that, because only it knows which binary was missing.
     *
     * WHY the signal is read only after the status: a child killed by a signal reports
     * `status: null` and `signal: <name>`, and the shell convention for that is 128+N.
     */
    static codeOf(outcome: ChildOutcome): number | undefined {
        if (outcome.status !== null) {
            return outcome.status;
        }
        if (outcome.signal !== null) {
            return ExitCode.forSignal(outcome.signal);
        }
        return undefined;
    }
}
