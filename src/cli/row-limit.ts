import { CliError } from "./cli-error.js";

/** Rows `closed` prints when `--limit=` is not given (bash `local limit=20`). */
const DEFAULT_ROW_LIMIT = 20;

const WHOLE_NUMBER = /^[0-9]+$/;

/**
 * How many rows a listing prints — the `--limit=N` of `closed`.
 *
 * DIVERGENCE (deliberate): bash hands the raw text to `head -n "$limit"`, which also accepts
 * `+N`, size suffixes (`--limit=2k` means 2048) and negative values meaning "all but the last
 * N", and which makes `--limit=0` exit **141** because `head` closes the pipe and `awk` dies of
 * SIGPIPE. All of those are accidents of the implementation rather than an interface anyone
 * would design, so only a plain decimal count is accepted here:
 *   - `--limit=0` prints nothing and exits 0 (bash: nothing, exit 141);
 *   - anything not all-digits, `--limit=` included, is a usage error with bash's exit code 1
 *     (bash printed `head: invalid number of lines: 'abc'`, which is not a message about a
 *     flag the user typed).
 * Verified against ./ticket; see scripts/parity/README.md.
 */
export class RowLimit {
    private constructor(private readonly rows: number) {}

    /** @param text the raw `--limit=` value, or undefined when the flag was not given. */
    static parse(text: string | undefined): RowLimit {
        if (text === undefined) {
            return new RowLimit(DEFAULT_ROW_LIMIT);
        }
        if (!WHOLE_NUMBER.test(text)) {
            throw new CliError(`--limit must be a whole number of rows, got '${text}'`);
        }
        return new RowLimit(Number(text));
    }

    applyTo<T>(rows: readonly T[]): readonly T[] {
        return rows.slice(0, this.rows);
    }
}
