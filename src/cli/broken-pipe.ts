import { ExitCode } from "./exit-codes.js";

const BROKEN_PIPE_ERROR_CODE = "EPIPE";

/**
 * Makes a vanished stdout reader (`tk ls | head -1`) look the way a Unix tool's does.
 *
 * WHY this exists: bash's `awk` writes in buffer-sized chunks and is KILLED by SIGPIPE as
 * soon as `head` exits, so `./ticket ls | head -1` exited 141. Node ignores SIGPIPE and
 * surfaces the failed write as an `error` event on `process.stdout`; with no listener that
 * ends up as an unhandled error (exit 1 with a stack trace) — neither bash's code nor a
 * useful message.
 *
 * DIVERGENCE (deliberate, unavoidable): bash's exit code depends on how many `write(2)`
 * calls its awk happened to make, i.e. on the OUTPUT SIZE, not on the command. Measured
 * with `ls | head -1`: bash exits 0 up to ~4 KB of output (awk's buffer, one write that
 * lands before `head` closes the pipe) and 141 above it, while node writes in one go and
 * only fails past the 64 KB pipe buffer. So the two agree for tiny and for large listings
 * and disagree in between; chasing the buffer boundary would mean reproducing awk's
 * internal chunking, which is not a contract anyone can honour. See docs-internal/migration-to-ts-high-level.md.
 */
export class BrokenPipe {
    /** Report a closed stdout as SIGPIPE death instead of as a crash or a success. */
    static reportAsSignalDeath(): void {
        process.stdout.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code !== BROKEN_PIPE_ERROR_CODE) {
                throw error;
            }
            process.exitCode = ExitCode.BROKEN_PIPE;
        });
    }
}
