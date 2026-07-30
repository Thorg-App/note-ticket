/**
 * The few facts this tool reads from git.
 */

import { execFileSync } from "node:child_process";

const GIT_BINARY = "git";
const OUTPUT_ENCODING = "utf8";

/** What bash `$( )` strips from a command's output: trailing newlines, nothing else. */
const TRAILING_NEWLINES = /\n+$/;

/**
 * Every query is best-effort and answers `undefined` rather than throwing: git may be
 * missing, the directory may not be a repository, and the setting may simply be unset.
 * Bash swallows all three the same way (`2>/dev/null || true`), and the callers have a
 * defined behavior for "unknown" in each case.
 */
export class Git {
    /** Absolute path of the enclosing repository's root, as `git rev-parse --show-toplevel`. */
    static repoRoot(cwd: string): string | undefined {
        return Git.output(["rev-parse", "--show-toplevel"], cwd);
    }

    /** `git config user.name` — the assignee `create` falls back to. */
    static configuredUserName(): string | undefined {
        return Git.output(["config", "user.name"]);
    }

    /**
     * Stdout of a git invocation with its trailing newlines removed; `undefined` when git
     * failed or said nothing.
     *
     * WHY stderr is discarded: these are probes, and git's complaints about them are not
     * this tool's output.
     *
     * WHY trailing newlines only, and NOT `.trim()`: bash reads the same values through
     * command substitution, which strips trailing newlines and nothing else. A
     * `user.name` of `"  Padded  "` therefore reaches the `assignee:` line with its spaces
     * intact, and a repository path ending in whitespace is not corrupted. `.trim()` was
     * wrong on both counts.
     */
    private static output(args: readonly string[], cwd?: string): string | undefined {
        try {
            const stdout = execFileSync(GIT_BINARY, args, {
                ...(cwd === undefined ? {} : { cwd }),
                encoding: OUTPUT_ENCODING,
                stdio: ["ignore", "pipe", "ignore"],
            }).replace(TRAILING_NEWLINES, "");
            return stdout === "" ? undefined : stdout;
        } catch {
            return undefined;
        }
    }
}
