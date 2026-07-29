/**
 * Where tickets live and how they are enumerated, read and written.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Ticket } from "./ticket.js";

const TICKETS_DIR_ENV_VAR = "TICKETS_DIR";
const TICKETS_DIR_NAME = "_tickets";
const TICKET_FILE_EXTENSION = ".md";
const FILE_ENCODING = "utf8";

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
        const repoRoot = TicketsDirectory.gitRepoRoot(cwd);
        if (repoRoot === undefined) {
            return { kind: "no-git-repo" };
        }
        return { kind: "resolved", path: join(repoRoot, TICKETS_DIR_NAME) };
    }

    private static gitRepoRoot(cwd: string): string | undefined {
        try {
            return execFileSync("git", ["rev-parse", "--show-toplevel"], {
                cwd,
                encoding: FILE_ENCODING,
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
        } catch {
            return undefined;
        }
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

    load(path: string): Ticket {
        return Ticket.parse(path, readFileSync(path, FILE_ENCODING));
    }

    /** Every ticket file parsed, in `collectFiles` order. */
    loadAll(): readonly Ticket[] {
        return this.collectFiles().map((path) => this.load(path));
    }

    save(ticket: Ticket): void {
        writeFileSync(ticket.path, ticket.text(), FILE_ENCODING);
    }

    /** Path a newly created ticket takes: always the top level of the tickets dir. */
    pathForNewTicket(filename: string): string {
        return join(this.ticketsDir, filename);
    }

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

    private static realPathOrUndefined(path: string): string | undefined {
        try {
            return realpathSync(path);
        } catch {
            return undefined;
        }
    }
}
