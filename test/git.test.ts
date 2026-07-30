import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { Git } from "../src/core/git.js";

const CONFIGURED_USER_NAME = "Golden Tester";

/**
 * A `user.name` bash would write to the `assignee:` line VERBATIM: command substitution
 * strips trailing newlines only, so the surrounding spaces survive.
 */
const PADDED_USER_NAME = "  Padded Name  ";

/**
 * A throwaway repository with its own `user.name`.
 *
 * WHY the process is chdir'd into it: `Git.configuredUserName` reads the config of the
 * CURRENT directory's repository, exactly as bash `git config user.name` does, and a
 * repository-local setting is the only way to assert a known value without touching the
 * developer's global config.
 */
class ScratchRepo {
    readonly root: string;

    constructor() {
        this.root = realpathSync(mkdtempSync(join(tmpdir(), "ticket-git-test-")));
        this.git(["init", "--quiet"]);
        this.git(["config", "user.name", CONFIGURED_USER_NAME]);
    }

    setUserName(name: string): void {
        this.git(["config", "user.name", name]);
    }

    private git(args: readonly string[]): void {
        execFileSync("git", args, { cwd: this.root, stdio: "ignore" });
    }

    remove(): void {
        rmSync(this.root, { recursive: true, force: true });
    }
}

describe("Git", () => {
    let repo: ScratchRepo;
    let originalCwd: string;

    before(() => {
        repo = new ScratchRepo();
        originalCwd = process.cwd();
        process.chdir(repo.root);
    });

    after(() => {
        process.chdir(originalCwd);
        repo.remove();
    });

    it("reads user.name from the enclosing repository", () => {
        assert.equal(Git.configuredUserName(), CONFIGURED_USER_NAME);
    });

    // Bash's `$(git config user.name)` strips trailing newlines and NOTHING else, so a
    // `.trim()` here would silently reshape the assignee the user configured.
    it("keeps the surrounding whitespace of a configured user.name", () => {
        repo.setUserName(PADDED_USER_NAME);
        try {
            assert.equal(Git.configuredUserName(), PADDED_USER_NAME);
        } finally {
            repo.setUserName(CONFIGURED_USER_NAME);
        }
    });

    it("reports the repository root", () => {
        assert.equal(Git.repoRoot(repo.root), repo.root);
    });

    it("answers undefined outside any repository", () => {
        assert.equal(Git.repoRoot(realpathSync(tmpdir())), undefined);
    });
});
