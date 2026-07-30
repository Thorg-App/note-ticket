/**
 * Title -> filename slug, matching bash `title_to_filename`.
 */

/** Filesystem-safe cap; the bash implementation truncates at the same width. */
const MAX_SLUG_LENGTH = 200;

const FALLBACK_SLUG = "untitled";

const TICKET_FILE_EXTENSION = ".md";

/** Answers "is this filename already taken?" so slug logic stays free of I/O. */
export type FilenameExistsPredicate = (filename: string) => boolean;

export class Slug {
    /**
     * Lowercase, spaces to hyphens, drop everything outside `[a-z0-9-]`, collapse
     * and trim hyphens, truncate, fall back to `untitled`.
     *
     * WHY ASCII-only lowercasing: bash uses `tr '[:upper:]' '[:lower:]'` over
     * bytes, so non-ASCII letters are left alone and then stripped. String
     * `toLowerCase()` would map e.g. `İ` to `i` + combining mark and leak an `i`.
     * WHY only U+0020 becomes a hyphen: `tr ' ' '-'` sees no other whitespace, so
     * a tab is stripped rather than turned into a separator.
     *
     * DIVERGENCE (deliberate, #11 in scripts/parity/README.md) for a NEWLINE in the title:
     * bash's `sed` is line-oriented, so the LF survived every substitution and
     * `tk create $'a\nb'` produced a file literally named `a<LF>b.md` (and a JSON line that
     * did not parse). Here the newline is simply not in `[a-z0-9-]` and is dropped like any
     * other stray byte, giving `ab.md`.
     */
    static fromTitle(title: string): string {
        const slug = Slug.trimHyphens(
            Slug.asciiLowercase(title)
                .replace(/ /g, "-")
                .replace(/[^a-z0-9-]/g, "")
                .replace(/-{2,}/g, "-"),
        )
            .slice(0, MAX_SLUG_LENGTH)
            // Truncation can expose a trailing hyphen; bash strips one.
            .replace(/-$/, "");
        return slug === "" ? FALLBACK_SLUG : slug;
    }

    /**
     * Filename for a new ticket, appending `-1`, `-2`, ... until unused.
     */
    static uniqueFilename(title: string, exists: FilenameExistsPredicate): string {
        const slug = Slug.fromTitle(title);
        const candidate = `${slug}${TICKET_FILE_EXTENSION}`;
        if (!exists(candidate)) {
            return candidate;
        }
        for (let counter = 1; ; counter++) {
            const suffixed = `${slug}-${counter}${TICKET_FILE_EXTENSION}`;
            if (!exists(suffixed)) {
                return suffixed;
            }
        }
    }

    private static asciiLowercase(text: string): string {
        return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    }

    private static trimHyphens(text: string): string {
        return text.replace(/^-/, "").replace(/-$/, "");
    }
}
