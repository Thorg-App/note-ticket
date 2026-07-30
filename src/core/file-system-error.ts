/**
 * A filesystem operation on a ticket file (or the tickets directory) that the OS refused.
 *
 * WHY this exists: an unwritable ticket, a read-only checkout or a full disk are the USER's
 * environment, not a defect in this CLI, so they must read like every other failure —
 * `Error: <message>`, exit 1 — instead of the raw node stack trace `writeFileSync` throws.
 * The CLI adopts this into a `CliError`, exactly as it does `CorruptTicketFileError`; core
 * itself stays free of CLI knowledge.
 */

/** What was being attempted, phrased to read after "cannot ". */
export type FileOperation = "read" | "write" | "append to" | "list" | "create directory";

/**
 * `strerror` wording for the errnos a ticket operation realistically hits.
 * WHY-NOT node's own `error.message`: it leads with `EACCES: permission denied, open '<temp
 * path>'`, naming the scratch file `save` renames from — a path the user never chose and
 * cannot act on.
 */
const ERRNO_DESCRIPTIONS: Readonly<Record<string, string>> = {
    EACCES: "permission denied",
    EPERM: "operation not permitted",
    EROFS: "read-only file system",
    ENOSPC: "no space left on device",
    EDQUOT: "disk quota exceeded",
    ENOENT: "no such file or directory",
    ENOTDIR: "not a directory",
    EISDIR: "is a directory",
    ELOOP: "too many levels of symbolic links",
    ENAMETOOLONG: "file name too long",
    EMFILE: "too many open files",
    EIO: "input/output error",
};

export class FileSystemError extends Error {
    private constructor(
        readonly path: string,
        readonly code: string,
        message: string,
    ) {
        super(message);
        // WHY spelled out rather than `new.target.name`: the bundler renames classes.
        this.name = "FileSystemError";
    }

    /**
     * Runs `body`, converting an OS-level failure into this error, named after `path`.
     *
     * Anything without an errno is rethrown untouched: it is a defect, and a defect must
     * keep its stack trace rather than be dressed up as an environment problem.
     */
    static guarding<T>(operation: FileOperation, path: string, body: () => T): T {
        try {
            return body();
        } catch (error) {
            const code = FileSystemError.errnoCodeOf(error);
            if (code === undefined) {
                throw error;
            }
            throw new FileSystemError(
                path,
                code,
                `cannot ${operation} ${path}: ${FileSystemError.describe(code)}`,
            );
        }
    }

    private static errnoCodeOf(error: unknown): string | undefined {
        // An fs failure is an Error carrying a numeric `errno`; that pair is what
        // distinguishes it from a TypeError thrown by our own code.
        if (!(error instanceof Error)) {
            return undefined;
        }
        const candidate = error as NodeJS.ErrnoException;
        return typeof candidate.errno === "number" && typeof candidate.code === "string"
            ? candidate.code
            : undefined;
    }

    /** An unmapped errno still names itself — better a bare `ENXIO` than a stack trace. */
    private static describe(code: string): string {
        const description = ERRNO_DESCRIPTIONS[code];
        return description === undefined ? code : `${description} (${code})`;
    }
}
