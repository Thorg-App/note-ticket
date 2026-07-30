/**
 * Where tickets live and how they are enumerated, read and written.
 */

import {
    appendFileSync,
    existsSync,
    lstatSync,
    mkdirSync,
    readFileSync,
    readdirSync,
    realpathSync,
    renameSync,
    rmSync,
    statSync,
    writeFileSync,
} from "node:fs";
import { join } from "node:path";

import { Git } from "./git.js";
import { MissingTicketIdError } from "./id.js";
import { Ticket } from "./ticket.js";

const TICKETS_DIR_ENV_VAR = "TICKETS_DIR";
const TICKETS_DIR_NAME = "_tickets";
const TICKET_FILE_EXTENSION = ".md";
const FILE_ENCODING = "utf8";

/** Sibling scratch name used by `save`; deliberately not a `.md` suffix. */
const TEMP_FILE_SUFFIX = ".tmp";

export type TicketsDirResolution =
    | { readonly kind: "resolved"; readonly path: string }
    | { readonly kind: "no-git-repo" };

/**
 * Resolves the tickets directory: an explicit `TICKETS_DIR` wins, otherwise it is
 * `<git-repo-root>/_tickets`, so commands work from any subdirectory.
 */
export class TicketsDirectory {
    static resolve(env: NodeJS.ProcessEnv = process.env, cwd: string = process.cwd()): TicketsDirResolution {
        const override = env[TICKETS_DIR_ENV_VAR];
        if (override) {
            return { kind: "resolved", path: override };
        }
        const repoRoot = Git.repoRoot(cwd);
        if (repoRoot === undefined) {
            return { kind: "no-git-repo" };
        }
        return { kind: "resolved", path: join(repoRoot, TICKETS_DIR_NAME) };
    }
}

/**
 * Byte-wise path ordering.
 *
 * WHY-NOT `String` comparison: JS compares UTF-16 code units, so an astral
 * character sorts before U+FFFF-range ones — the opposite of `LC_ALL=C sort`,
 * which the enumeration order is contractually defined by.
 */
class PathOrder {
    static compare(left: string, right: string): number {
        return Buffer.compare(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
    }
}

/** A ticket file with its modification time, the pair `loadRecent` orders by. */
interface TimestampedFile {
    readonly path: string;
    /** Nanoseconds, so files written in the same millisecond still order correctly. */
    readonly modifiedAt: bigint;
}

/**
 * Reads and writes tickets under one directory.
 *
 * `collectFiles` is the single source of truth for "what is a ticket file":
 * every `.md` file at any depth, symlinks followed, hidden *directories* pruned
 * whole (`.obsidian`, `.trash`, `.git`), hidden *files* included, in byte-wise
 * path order.
 */
export class TicketStore {
    constructor(readonly ticketsDir: string) {}

    exists(): boolean {
        return TicketStore.isDirectory(this.ticketsDir);
    }

    ensureDir(): void {
        mkdirSync(this.ticketsDir, { recursive: true });
    }

    /** Absolute-or-as-given paths of every ticket file, deterministically ordered. */
    collectFiles(): readonly string[] {
        if (!this.exists()) {
            return [];
        }
        const files: string[] = [];
        this.collectInto(this.ticketsDir, files, new Set<string>());
        return files.sort(PathOrder.compare);
    }

    /** Throws `MissingTicketIdError` when the file carries no `id` — see that class. */
    load(path: string): Ticket {
        const ticket = Ticket.parse(path, readFileSync(path, FILE_ENCODING));
        if (ticket.id === "") {
            throw new MissingTicketIdError(path);
        }
        return ticket;
    }

    /** Every ticket file parsed, in `collectFiles` order. */
    loadAll(): readonly Ticket[] {
        return this.collectFiles().map((path) => this.load(path));
    }

    /**
     * The `maxFiles` most recently modified ticket files, newest first.
     *
     * Mirrors bash `cmd_closed`'s `ls -t "${TICKET_FILES[@]}" | head -n 100`: the cap is on
     * FILES SCANNED, applied before any filtering, so an old closed ticket behind 100 newer
     * files is invisible to `closed` no matter what `--limit` says. Verified against ./ticket.
     *
     * Files that cannot be stat'ed (removed mid-run, broken permissions) are dropped, as
     * `ls -t 2>/dev/null` drops them. A symlinked ticket is ordered by the LINK's own mtime
     * — see `modifiedAtOrUndefined`.
     */
    loadRecent(maxFiles: number): readonly Ticket[] {
        const stamped: TimestampedFile[] = [];
        for (const path of this.collectFiles()) {
            const modifiedAt = TicketStore.modifiedAtOrUndefined(path);
            if (modifiedAt !== undefined) {
                stamped.push({ path, modifiedAt });
            }
        }
        return stamped
            .sort(TicketStore.byRecency)
            .slice(0, maxFiles)
            .map((file) => this.load(file.path));
    }

    /**
     * Newest first, ties broken by ascending byte-wise path — GNU `ls -t`'s ordering.
     *
     * WHY nanoseconds: `ls -t` compares the full `st_mtim`, and `statSync().mtimeMs` is
     * truncated to milliseconds, which would reorder files written in the same millisecond.
     * WHY byte-wise for ties: `ls` breaks them with `strcoll`, i.e. the caller's locale;
     * byte-wise matches it under `LC_ALL=C` and is the ordering the rest of this class uses.
     */
    private static byRecency(left: TimestampedFile, right: TimestampedFile): number {
        if (left.modifiedAt !== right.modifiedAt) {
            return left.modifiedAt > right.modifiedAt ? -1 : 1;
        }
        return PathOrder.compare(left.path, right.path);
    }

    /**
     * Write a ticket back, replacing the file atomically.
     *
     * WHY write-then-rename: a truncating in-place write loses the ticket if the disk
     * fills or the process dies mid-write, and lets a concurrent read see a partial
     * file. Bash gets this right via `_sed_i` (`sed … > tmp && mv tmp file`), so an
     * in-place write would be a durability REGRESSION on the path every mutation
     * command takes.
     * WHY the temp name does not end in `.md`: a leftover temp file from a crash would
     * otherwise be enumerated as a ticket by `collectFiles`.
     */
    save(ticket: Ticket): void {
        const tempPath = `${ticket.path}${TEMP_FILE_SUFFIX}.${process.pid}`;
        try {
            writeFileSync(tempPath, ticket.text(), FILE_ENCODING);
            renameSync(tempPath, ticket.path);
        } catch (error) {
            TicketStore.discardScratch(tempPath);
            throw error;
        }
    }

    /**
     * Append text to a ticket file, bash `printf … >> "$file"`.
     *
     * WHY-NOT `save` with the text already concatenated onto the document: `save` replaces the
     * file by renaming a new one over it, which turns a SYMLINKED ticket (a shape this repo
     * supports and enumerates) into a regular file and detaches every other name for it. bash
     * appended through the link. Rewriting also means re-serializing bytes nobody asked to
     * change, so a file whose frontmatter block the parser normalizes at all would be edited by
     * a command that is documented to touch only the end of the file.
     * WHY-NOT the write-then-rename durability `save` argues for: that protects a TRUNCATING
     * write, which loses the whole ticket if it fails halfway. An append cannot lose what is
     * already there.
     */
    appendTo(ticket: Ticket, text: string): void {
        appendFileSync(ticket.path, text, FILE_ENCODING);
    }

    /**
     * Best-effort scratch cleanup. WHY the failure is swallowed: the caller must see the
     * ORIGINAL write error, and a cleanup that cannot run leaves only a stray non-`.md`
     * file, which nothing else in the system looks at.
     */
    private static discardScratch(path: string): void {
        try {
            rmSync(path, { force: true, recursive: true });
        } catch {
            /* intentionally ignored — see doc comment */
        }
    }

    /** Path a newly created ticket takes: always the top level of the tickets dir. */
    pathForNewTicket(filename: string): string {
        return join(this.ticketsDir, filename);
    }

    /**
     * "Is this name taken at the top level?" — for ANY kind of entry, not just a regular file.
     *
     * DIVERGENCE (deliberate, #12 in scripts/parity/README.md): bash asked `[[ -f ]]`, which
     * is false for a DIRECTORY, so a `_tickets/<slug>.md/` directory made `create` redirect
     * into it and die with `Is a directory` at exit 1. Treating the name as taken picks
     * `<slug>-1.md` and the create succeeds.
     */
    topLevelFileExists(filename: string): boolean {
        return existsSync(this.pathForNewTicket(filename));
    }

    /**
     * WHY the ancestor set and not a global visited set: symlinks are followed, so the
     * same real directory can legitimately be reachable by two paths and must be listed
     * under both (as `find -L` does). Only a link back into the current descent is a
     * loop, and that is what has to be cut.
     */
    private collectInto(dir: string, files: string[], ancestorRealPaths: Set<string>): void {
        const realDir = TicketStore.realPathOrUndefined(dir);
        if (realDir === undefined || ancestorRealPaths.has(realDir)) {
            return;
        }
        const descent = new Set([...ancestorRealPaths, realDir]);
        for (const name of readdirSync(dir)) {
            const path = join(dir, name);
            if (TicketStore.isDirectory(path)) {
                // Hidden DIRECTORY: prune the whole subtree (.obsidian, .trash, .git).
                // Hidden FILES are tickets, so the test is on directories only.
                if (!name.startsWith(".")) {
                    this.collectInto(path, files, descent);
                }
            } else if (name.endsWith(TICKET_FILE_EXTENSION) && TicketStore.isFile(path)) {
                files.push(path);
            }
        }
    }

    /** Symlinks are followed; dangling ones answer false rather than throwing. */
    private static isDirectory(path: string): boolean {
        return TicketStore.statOrUndefined(path)?.isDirectory() ?? false;
    }

    private static isFile(path: string): boolean {
        return TicketStore.statOrUndefined(path)?.isFile() ?? false;
    }

    private static statOrUndefined(path: string): ReturnType<typeof statSync> | undefined {
        try {
            return statSync(path);
        } catch {
            return undefined;
        }
    }

    /**
     * Modification time in nanoseconds, or undefined when the file cannot be stat'ed.
     *
     * WHY `lstatSync`: GNU `ls -t` does not dereference a symlink given as an operand (it
     * has no `-L`/`-H` here), so bash `closed` orders a symlinked ticket by the LINK's own
     * mtime, not the target's. Verified against ./ticket: a link stamped 2030 pointing at a
     * file stamped 2020 sorts FIRST in bash. Following the link here would reorder the
     * listing for the symlinked layout README documents as supported.
     */
    private static modifiedAtOrUndefined(path: string): bigint | undefined {
        try {
            return lstatSync(path, { bigint: true }).mtimeNs;
        } catch {
            return undefined;
        }
    }

    private static realPathOrUndefined(path: string): string | undefined {
        try {
            return realpathSync(path);
        } catch {
            return undefined;
        }
    }
}
