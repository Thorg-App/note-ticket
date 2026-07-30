import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { FileSystemError } from "../src/core/file-system-error.js";

const PATH = "/x/_tickets/t.md";

/** An fs failure as node raises it: an Error carrying both `errno` and `code`. */
function errnoError(code: string): NodeJS.ErrnoException {
    const error: NodeJS.ErrnoException = new Error(`${code}: something, open '/x/_tickets/t.md.tmp.7'`);
    error.errno = -13;
    error.code = code;
    return error;
}

function messageOf(body: () => unknown): string {
    try {
        body();
    } catch (error) {
        assert.ok(error instanceof FileSystemError, `expected a FileSystemError, got ${String(error)}`);
        return error.message;
    }
    return assert.fail("expected the guarded body to throw");
}

describe("FileSystemError.guarding", () => {
    it("returns the body's value when nothing fails", () => {
        assert.equal(
            FileSystemError.guarding("read", PATH, () => "contents"),
            "contents",
        );
    });

    it("states what could not be done, to the path the user named", () => {
        assert.equal(
            messageOf(() =>
                FileSystemError.guarding("write", PATH, () => {
                    throw errnoError("EACCES");
                }),
            ),
            `cannot write ${PATH}: permission denied (EACCES)`,
        );
    });

    it("phrases the operation it was given", () => {
        assert.match(
            messageOf(() =>
                FileSystemError.guarding("append to", PATH, () => {
                    throw errnoError("EROFS");
                }),
            ),
            /^cannot append to .*: read-only file system \(EROFS\)$/,
        );
    });

    // An unmapped errno must still produce a one-line failure rather than fall through
    // to a stack trace — the code alone is a usable diagnosis.
    it("names an errno it has no wording for", () => {
        assert.equal(
            messageOf(() =>
                FileSystemError.guarding("read", PATH, () => {
                    throw errnoError("ENXIO");
                }),
            ),
            `cannot read ${PATH}: ENXIO`,
        );
    });

    // The line between "the user's environment" and "our bug": only the first is dressed
    // up as a message, because the second needs its stack trace to be fixable.
    it("rethrows a non-errno failure untouched", () => {
        const defect = new TypeError("undefined is not a function");
        assert.throws(
            () =>
                FileSystemError.guarding("write", PATH, () => {
                    throw defect;
                }),
            (error: unknown) => error === defect,
        );
    });
});
