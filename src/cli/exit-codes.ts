import { constants } from "node:os";

/**
 * Every exit code this CLI can produce, in one place.
 *
 * WHY one module: the codes are a user-facing contract shared by the dispatcher, the error
 * channel and the `jq` passthrough, and bash produced some of them by accident of the shell
 * (127 for a missing binary, 128+signal for a signalled child). Spreading them across the
 * files that happen to return them invites two files disagreeing about what "failure" is.
 */
export class ExitCode {
    static readonly SUCCESS = 0;

    /** Every usage error: bash `return 1` for all of them. */
    static readonly FAILURE = 1;

    /** The shell's code for a command that is not on PATH, which is what bash produced. */
    static readonly COMMAND_NOT_FOUND = 127;

    /**
     * What a shell reports for a process killed by signal N. bash's pipelines exit this way
     * (`tk query <filter> | head -1` kills `jq` with SIGPIPE), so reproducing it is what
     * makes a TS-served command interchangeable with the bash one inside a pipeline.
     */
    private static readonly SIGNALLED_BASE = 128;

    /** What every well-behaved Unix tool exits with when the reader of its stdout is gone. */
    static readonly BROKEN_PIPE = ExitCode.forSignal("SIGPIPE");

    /**
     * The code a shell reports for a child killed by `signal`.
     *
     * WHY the lookup instead of a literal: signal numbers are platform-specific, and
     * `os.constants.signals` is the authority node already carries.
     */
    static forSignal(signal: NodeJS.Signals): number {
        const number = constants.signals[signal];
        return number === undefined ? ExitCode.FAILURE : ExitCode.SIGNALLED_BASE + number;
    }
}
