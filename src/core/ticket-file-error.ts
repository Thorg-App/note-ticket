/**
 * The ways a `.md` file under the tickets dir can fail to be a ticket.
 *
 * WHY a hard error rather than skip-with-warning (human decision, 2026-07-29, ticket
 * nid_5g3eta9cf7yi6iukmscxma6wc_e): every file under `_tickets/` is EXPECTED to be a
 * ticket, so one that is not is a corrupt repo. Bash silently never matches such a file,
 * which makes a hand-edit that broke it look like the ticket ceased to exist — no signal
 * at all.
 *
 * ACCEPTED TRADE-OFF: one malformed file therefore fails EVERY enumerating command,
 * `ls` included. Every message names the path so the fix is obvious. The `Error: `
 * prefix is the CLI's to add, matching every other bash error line.
 */

/** A file under the tickets dir that cannot be read as a ticket. */
export abstract class CorruptTicketFileError extends Error {
    protected constructor(
        readonly path: string,
        message: string,
        // WHY spelled out rather than `new.target.name`: the bundler renames classes.
        name: string,
    ) {
        super(message);
        this.name = name;
    }
}

/**
 * A file whose frontmatter block parsed, but which carries no usable `id`.
 *
 * Deliberately distinct from `MissingFrontmatterBlockError`: naming the `id` field is only
 * honest when a block was actually read, and the file really does lack that one key.
 */
export class MissingTicketIdError extends CorruptTicketFileError {
    constructor(path: string) {
        super(path, `${path} has no 'id' frontmatter field`, "MissingTicketIdError");
    }
}

/** A lone `\r` is enough: `---\r` is not the `---` fence, whatever follows it. */
const CARRIAGE_RETURN = "\r";

/**
 * A file from which no frontmatter block could be read at all.
 *
 * WHY it names CRLF (ticket nid_z10hpj927zqilxcpl9ycpe0ad_e): CRLF ticket files are
 * UNSUPPORTED — the parser matches `---` and `key: value` without tolerating a trailing
 * `\r`, so a Windows-edited file parses as having no block though it visibly contains
 * `id: ...`. Reporting the `id` field as missing sent the user hunting for a field that is
 * right there; pointing at the line endings turns a dead end into a one-line diagnosis.
 *
 * WHY-NOT tolerate the `\r` and support CRLF: that touches `TicketDocument`'s byte-exact
 * round trip, which every write command depends on. Decided against until a real user
 * hits it.
 */
export class MissingFrontmatterBlockError extends CorruptTicketFileError {
    constructor(path: string, fileText: string) {
        super(
            path,
            MissingFrontmatterBlockError.describe(path, fileText),
            "MissingFrontmatterBlockError",
        );
    }

    private static describe(path: string, fileText: string): string {
        return fileText.includes(CARRIAGE_RETURN)
            ? `${path} frontmatter block is not parseable (CRLF line endings are not supported)`
            : `${path} has no YAML frontmatter block`;
    }
}
