import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Slug } from "../src/core/slug.js";

/**
 * Expectations verified against bash `title_to_filename` by running ./ticket create
 * in a throwaway repo.
 */
describe("Slug.fromTitle", () => {
    const cases: readonly (readonly [title: string, slug: string])[] = [
        ["Hello World", "hello-world"],
        ["Hello   World", "hello-world"],
        ["  Leading and trailing  ", "leading-and-trailing"],
        ["!!!", "untitled"],
        ["", "untitled"],
        ["Ünïcödé Tïtle", "ncd-ttle"],
        ["UPPER_snake_case", "uppersnakecase"],
        ["a/b\\c", "abc"],
        ["Tabs\there", "tabshere"],
        // DIVERGENCE #11: bash's sed pipeline is line-oriented, so the LF survived and the
        // file was literally named `line1<LF>line2.md`. A newline is just another byte
        // outside [a-z0-9-] here.
        ["line1\nline2", "line1line2"],
        ["a - b", "a-b"],
        ["v1.2.3 release", "v123-release"],
    ];

    for (const [title, slug] of cases) {
        it(`maps [${title}] to [${slug}]`, () => {
            assert.equal(Slug.fromTitle(title), slug);
        });
    }

    it("truncates to 200 characters", () => {
        assert.equal(Slug.fromTitle("a".repeat(250)).length, 200);
    });

    it("drops a hyphen exposed by truncation", () => {
        const title = `${"a".repeat(199)} tail`;
        assert.equal(Slug.fromTitle(title), "a".repeat(199));
    });

    // WHY: `İ`.toLowerCase() is "i" + U+0307, which would leak an "i" into the slug.
    it("does not lowercase non-ASCII letters into ASCII ones", () => {
        assert.equal(Slug.fromTitle("İ"), "untitled");
    });
});

describe("Slug.uniqueFilename", () => {
    it("uses the plain slug when free", () => {
        assert.equal(Slug.uniqueFilename("Hello World", () => false), "hello-world.md");
    });

    it("appends -1 on the first collision", () => {
        const taken = new Set(["hello-world.md"]);
        assert.equal(Slug.uniqueFilename("Hello World", (name) => taken.has(name)), "hello-world-1.md");
    });

    it("walks the counter past consecutive collisions", () => {
        const taken = new Set(["hello-world.md", "hello-world-1.md", "hello-world-2.md"]);
        assert.equal(Slug.uniqueFilename("Hello World", (name) => taken.has(name)), "hello-world-3.md");
    });
});
