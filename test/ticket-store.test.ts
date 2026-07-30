import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { after, before, describe, it } from "node:test";

import { MissingTicketIdError } from "../src/core/id.js";
import { TicketsDirectory, TicketStore } from "../src/core/ticket-store.js";

/** Mirrors the scratch name `TicketStore.save` uses; deliberately not a `.md`. */
const SCRATCH_SUFFIX = `.tmp.${process.pid}`;

/** Builds a throwaway tickets tree and returns paths relative to its root. */
class TicketsTree {
    readonly root: string;

    constructor() {
        this.root = mkdtempSync(join(tmpdir(), "ticket-store-test-"));
    }

    write(relativePath: string, text: string): string {
        const path = join(this.root, relativePath);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
        return path;
    }

    ticket(relativePath: string, id: string): string {
        return this.write(relativePath, `---\nid: ${id}\ntitle: "t"\nstatus: open\ndeps: []\n---\n`);
    }

    relativeNames(paths: readonly string[]): readonly string[] {
        return paths.map((path) => relative(this.root, path));
    }

    remove(): void {
        rmSync(this.root, { recursive: true, force: true });
    }
}

describe("TicketStore.collectFiles", () => {
    const tree = new TicketsTree();
    let store: TicketStore;

    before(() => {
        tree.ticket("top.md", "nid_1");
        tree.ticket("sub/z.md", "nid_2");
        tree.ticket("sub/a.md", "nid_3");
        tree.ticket("A/one.md", "nid_4");
        tree.ticket("a/two.md", "nid_5");
        tree.ticket("Z.md", "nid_6");
        tree.ticket("_under.md", "nid_7");
        tree.ticket(".draft.md", "nid_8");
        tree.ticket(".hidden/h.md", "nid_9");
        tree.ticket(".hidden/visible/v.md", "nid_10");
        tree.write("notes.txt", "not a ticket");
        tree.write("no-extension", "not a ticket");
        store = new TicketStore(tree.root);
    });

    after(() => tree.remove());

    it("finds tickets at every depth", () => {
        assert.ok(tree.relativeNames(store.collectFiles()).includes("sub/a.md"));
    });

    it("ignores non-markdown files", () => {
        assert.equal(
            tree.relativeNames(store.collectFiles()).some((name) => name.endsWith(".txt")),
            false,
        );
    });

    it("prunes a hidden directory whole, including non-hidden folders inside it", () => {
        assert.equal(
            tree.relativeNames(store.collectFiles()).some((name) => name.startsWith(".hidden")),
            false,
        );
    });

    it("treats a hidden FILE as a ticket", () => {
        assert.ok(tree.relativeNames(store.collectFiles()).includes(".draft.md"));
    });

    // Byte order, i.e. LC_ALL=C: '.' < 'A' < 'Z' < '_' < 'a'. Verified against ./ticket.
    it("orders paths byte-wise", () => {
        assert.deepEqual(tree.relativeNames(store.collectFiles()), [
            ".draft.md",
            "A/one.md",
            "Z.md",
            "_under.md",
            "a/two.md",
            "sub/a.md",
            "sub/z.md",
            "top.md",
        ]);
    });

    it("returns nothing for a missing tickets dir", () => {
        assert.deepEqual(new TicketStore(join(tree.root, "nope")).collectFiles(), []);
    });

    it("parses every collected file", () => {
        assert.equal(store.loadAll().length, store.collectFiles().length);
    });

    it("exposes the ticket id of a loaded file", () => {
        assert.equal(store.load(join(tree.root, "top.md")).id, "nid_1");
    });
});

describe("TicketStore byte ordering beyond the BMP", () => {
    const tree = new TicketsTree();

    before(() => {
        tree.ticket("�.md", "nid_a");
        tree.ticket("\u{10000}.md", "nid_b");
    });

    after(() => tree.remove());

    /**
     * The UTF-8 lead byte of U+FFFD (0xEF) is below that of U+10000 (0xF0), while in
     * UTF-16 the surrogate 0xD800 sorts FIRST. This is exactly where a plain string
     * comparison would diverge from `LC_ALL=C sort`.
     */
    it("sorts U+FFFD before an astral character", () => {
        assert.deepEqual(tree.relativeNames(new TicketStore(tree.root).collectFiles()), [
            "�.md",
            "\u{10000}.md",
        ]);
    });
});

describe("TicketStore symlink handling", () => {
    const tree = new TicketsTree();

    before(() => {
        tree.ticket("real/inner.md", "nid_real");
        symlinkSync(join(tree.root, "real"), join(tree.root, "linked-dir"));
        symlinkSync(join(tree.root, "real/inner.md"), join(tree.root, "linked.md"));
        symlinkSync(join(tree.root, "missing.md"), join(tree.root, "dangling.md"));
        symlinkSync(tree.root, join(tree.root, "real/loop"));
    });

    after(() => tree.remove());

    it("follows a symlinked directory", () => {
        assert.ok(tree.relativeNames(new TicketStore(tree.root).collectFiles()).includes("linked-dir/inner.md"));
    });

    it("follows a symlinked ticket file", () => {
        assert.ok(tree.relativeNames(new TicketStore(tree.root).collectFiles()).includes("linked.md"));
    });

    it("skips a dangling symlink", () => {
        assert.equal(
            tree.relativeNames(new TicketStore(tree.root).collectFiles()).includes("dangling.md"),
            false,
        );
    });

    /**
     * The loop guard is an ANCESTOR set, not a global visited set: `linked-dir` and
     * `real` are the same real directory and must BOTH be listed, while `real/loop`
     * (a link back to the root) must be cut. Asserting the exact list makes a
     * "simplification" to a global visited set fail here.
     */
    it("lists every reachable path exactly once and cuts the loop", () => {
        assert.deepEqual(tree.relativeNames(new TicketStore(tree.root).collectFiles()), [
            "linked-dir/inner.md",
            "linked.md",
            "real/inner.md",
        ]);
    });
});

/**
 * Every `.md` file under the tickets dir MUST carry an `id`; one that does not is a
 * corrupt repo, so it fails loudly instead of vanishing from every listing.
 */
describe("TicketStore id enforcement", () => {
    const tree = new TicketsTree();

    after(() => tree.remove());

    it("rejects a file whose frontmatter has no id key", () => {
        const path = tree.write("no-id.md", '---\ntitle: "t"\nstatus: open\n---\n');
        assert.throws(() => new TicketStore(tree.root).load(path), MissingTicketIdError);
    });

    it("rejects an empty id value", () => {
        const path = tree.write("empty-id.md", '---\nid:\ntitle: "t"\n---\n');
        assert.throws(() => new TicketStore(tree.root).load(path), MissingTicketIdError);
    });

    it("rejects a quoted-empty id value", () => {
        const path = tree.write("quoted-empty-id.md", '---\nid: ""\ntitle: "t"\n---\n');
        assert.throws(() => new TicketStore(tree.root).load(path), MissingTicketIdError);
    });

    it("rejects a file with no frontmatter block at all", () => {
        const path = tree.write("bare.md", "just prose, no frontmatter\n");
        assert.throws(() => new TicketStore(tree.root).load(path), MissingTicketIdError);
    });

    it("names the offending path in the error", () => {
        const path = tree.write("named.md", "no frontmatter\n");
        assert.throws(
            () => new TicketStore(tree.root).load(path),
            (error: Error) => error.message === `${path} has no 'id' frontmatter field`,
        );
    });

    // The accepted trade-off: ONE malformed file breaks every command that enumerates.
    it("fails the whole enumeration, not just the malformed file", () => {
        tree.ticket("fine.md", "nid_fine");
        tree.write("broken.md", "---\ntitle: \"t\"\n---\n");
        assert.throws(() => new TicketStore(tree.root).loadAll(), MissingTicketIdError);
    });
});

describe("TicketStore writes", () => {
    const tree = new TicketsTree();

    after(() => tree.remove());

    it("creates the tickets dir on demand", () => {
        const store = new TicketStore(join(tree.root, "fresh"));
        store.ensureDir();
        assert.equal(store.exists(), true);
    });

    it("round-trips a saved ticket", () => {
        const path = tree.ticket("save.md", "nid_save");
        const store = new TicketStore(tree.root);
        store.save(store.load(path).withField("status", "closed"));
        assert.equal(store.load(path).status, "closed");
    });

    it("leaves no scratch file behind after a save", () => {
        const path = tree.ticket("atomic.md", "nid_atomic");
        const store = new TicketStore(tree.root);
        store.save(store.load(path).withField("status", "closed"));
        assert.deepEqual(
            readdirSync(tree.root).filter((name) => name.startsWith("atomic")),
            ["atomic.md"],
        );
    });

    /**
     * The durability property bash gets from `sed > tmp && mv`: a failed write must
     * leave the old ticket intact, and must not leave anything `collectFiles` would
     * report as a ticket. A directory squatting on the scratch path makes the write
     * fail while the original file is still in place.
     */
    describe("when the write fails", () => {
        const path = tree.ticket("survivor.md", "nid_survivor");
        const store = new TicketStore(tree.root);

        before(() => {
            mkdirSync(`${path}${SCRATCH_SUFFIX}`);
            assert.throws(() => store.save(store.load(path).withField("status", "closed")));
        });

        it("keeps the previous content readable", () => {
            assert.equal(store.load(path).status, "open");
        });

        it("adds no extra ticket file", () => {
            assert.deepEqual(
                readdirSync(tree.root).filter((name) => name.startsWith("survivor") && name.endsWith(".md")),
                ["survivor.md"],
            );
        });
    });

    it("places a new ticket at the top level", () => {
        const store = new TicketStore(tree.root);
        assert.equal(store.pathForNewTicket("x.md"), join(tree.root, "x.md"));
    });

    it("detects a taken top-level filename", () => {
        tree.ticket("taken.md", "nid_taken");
        assert.equal(new TicketStore(tree.root).topLevelFileExists("taken.md"), true);
    });
});

describe("TicketsDirectory.resolve", () => {
    it("prefers the TICKETS_DIR override", () => {
        assert.deepEqual(TicketsDirectory.resolve({ TICKETS_DIR: "/custom" }, "/"), {
            kind: "resolved",
            path: "/custom",
        });
    });

    it("anchors to the enclosing git repo root", () => {
        const resolution = TicketsDirectory.resolve({}, process.cwd());
        assert.equal(resolution.kind === "resolved" && resolution.path.endsWith("/_tickets"), true);
    });

    it("reports no git repo outside one", (t) => {
        const outside = mkdtempSync(join(tmpdir(), "ticket-no-repo-"));
        try {
            // Guard the premise instead of assuming: if the temp root happens to sit
            // inside someone's repo, the assertion below would be meaningless.
            try {
                execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: outside, stdio: "ignore" });
                t.skip(`[${outside}] is inside a git repository`);
                return;
            } catch {
                /* not a repo: exactly the precondition this test needs */
            }
            assert.deepEqual(TicketsDirectory.resolve({}, outside), { kind: "no-git-repo" });
        } finally {
            rmSync(outside, { recursive: true, force: true });
        }
    });
});
