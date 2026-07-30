/**
 * Line-based reader/writer for the YAML *subset* used by ticket frontmatter:
 * `key: value` lines, inline `[a, b]` arrays, double-quoted titles.
 *
 * WHY-NOT js-yaml: a real YAML parser disagrees with the bash implementation on
 * edge cases (quoting, escapes, type coercion) and would silently change the
 * on-disk contract the BDD suite pins. Values are therefore kept RAW — exactly
 * the bytes that follow the colon — and interpreted only on demand.
 */

const FRONTMATTER_MARKER = "---";
const LINE_SEPARATOR = "\n";

/** A `key: value` frontmatter line. `rawValue` is the on-disk text, untouched. */
export interface FrontmatterEntry {
    readonly key: string;
    readonly rawValue: string;
}

/** A frontmatter value is either a scalar string or an inline array. */
export type FrontmatterJsonValue = string | readonly string[];

/**
 * Interpretation of raw frontmatter values. Stateless: the rules are a property
 * of the format, not of any document.
 */
export class FrontmatterValue {
    /** `"My Title"` -> `My Title`. Inner escapes are left as-is (bash parity). */
    static unquote(rawValue: string): string {
        const isQuoted = rawValue.length >= 2 && rawValue.startsWith('"') && rawValue.endsWith('"');
        return isQuoted ? rawValue.slice(1, -1) : rawValue;
    }

    static isArray(rawValue: string): boolean {
        return rawValue.startsWith("[") && rawValue.endsWith("]") && rawValue.length >= 2;
    }

    /**
     * `[a, b]` -> `["a", "b"]`. Empty items are dropped, so `[]`, `[ ]` and
     * `[a, , b]` all yield clean arrays.
     */
    static parseArray(rawValue: string): readonly string[] {
        const inner = FrontmatterValue.isArray(rawValue) ? rawValue.slice(1, -1) : rawValue;
        return inner
            .split(",")
            .map((item) => item.trim())
            .filter((item) => item !== "");
    }

    /** `["a", "b"]` -> `[a, b]` — the on-disk inline form written by `create`. */
    static serializeArray(items: readonly string[]): string {
        return `[${items.join(", ")}]`;
    }

    /** Scalar or array, decided by the raw text — the shape `query` emits as JSON. */
    static toJson(rawValue: string): FrontmatterJsonValue {
        return FrontmatterValue.isArray(rawValue)
            ? FrontmatterValue.parseArray(rawValue)
            : FrontmatterValue.unquote(rawValue);
    }
}

/**
 * The frontmatter block: an ordered, immutable sequence of lines.
 *
 * Lines are kept verbatim so that untouched fields, comments and blank lines
 * survive a read/write round trip byte-for-byte. Key order is part of the
 * contract (`query` emits JSON keys in file order).
 *
 * Duplicate keys are NOT set semantics: every lookup and mutation addresses the
 * FIRST occurrence only, and `toJsonRecord` collapses duplicates to the last value
 * at the first key's position. Bash instead rewrites/deletes EVERY matching line and
 * emits duplicate JSON keys, so a hand-edited file with a repeated key is one of the
 * documented divergences rather than a promise this class keeps.
 */
export class Frontmatter {
    private constructor(private readonly lines: readonly string[]) {}

    static readonly EMPTY = new Frontmatter([]);

    static fromLines(lines: readonly string[]): Frontmatter {
        return new Frontmatter([...lines]);
    }

    /** Build a block from field pairs, in the given order. */
    static fromEntries(entries: readonly FrontmatterEntry[]): Frontmatter {
        return new Frontmatter(entries.map((entry) => `${entry.key}: ${entry.rawValue}`));
    }

    toLines(): readonly string[] {
        return this.lines;
    }

    /**
     * Field lines in file order. A field line starts with an ASCII letter and
     * contains a colon; everything else (comments, blanks, indented
     * continuations) is not a field.
     */
    entries(): readonly FrontmatterEntry[] {
        const entries: FrontmatterEntry[] = [];
        for (const line of this.lines) {
            const entry = Frontmatter.parseLine(line);
            if (entry) {
                entries.push(entry);
            }
        }
        return entries;
    }

    has(key: string): boolean {
        return this.indexOfKey(key) >= 0;
    }

    /** Raw on-disk value (quotes and brackets intact), or undefined. */
    get(key: string): string | undefined {
        const index = this.indexOfKey(key);
        if (index < 0) {
            return undefined;
        }
        return Frontmatter.parseLine(this.lines[index] as string)?.rawValue;
    }

    /** Scalar value with surrounding double quotes stripped. */
    getString(key: string): string | undefined {
        const rawValue = this.get(key);
        return rawValue === undefined ? undefined : FrontmatterValue.unquote(rawValue);
    }

    /** Inline array value; an absent key yields an empty array. */
    getArray(key: string): readonly string[] {
        const rawValue = this.get(key);
        return rawValue === undefined ? [] : FrontmatterValue.parseArray(rawValue);
    }

    /**
     * Set a field, preserving key order for an existing key.
     *
     * WHY prepend for a new key: bash `update_yaml_field` inserts after the
     * opening `---`, so a newly added field becomes the FIRST entry. Verified
     * against ./ticket; JSONL key order depends on it.
     */
    withField(key: string, rawValue: string): Frontmatter {
        const line = `${key}: ${rawValue}`;
        const index = this.indexOfKey(key);
        if (index < 0) {
            return new Frontmatter([line, ...this.lines]);
        }
        const lines = [...this.lines];
        lines[index] = line;
        return new Frontmatter(lines);
    }

    /** Drop a field. Idempotent — absent keys are a no-op. */
    withoutField(key: string): Frontmatter {
        const index = this.indexOfKey(key);
        if (index < 0) {
            return this;
        }
        return new Frontmatter(this.lines.filter((_line, i) => i !== index));
    }

    /** Field values keyed and ordered as on disk — the payload `query` serializes. */
    toJsonRecord(): Record<string, FrontmatterJsonValue> {
        const record: Record<string, FrontmatterJsonValue> = {};
        for (const entry of this.entries()) {
            record[entry.key] = FrontmatterValue.toJson(entry.rawValue);
        }
        return record;
    }

    private indexOfKey(key: string): number {
        return this.lines.findIndex((line) => Frontmatter.parseLine(line)?.key === key);
    }

    /**
     * Split a field line at its FIRST colon. Keys are ASCII-letter-initial, which
     * excludes list items (`- x`) and indented continuations.
     *
     * A letter-initial line with no colon is not a field. Bash instead turns the whole
     * line into a JSON key with an empty value; see the divergence list.
     */
    private static parseLine(line: string): FrontmatterEntry | undefined {
        if (!/^[a-zA-Z]/.test(line)) {
            return undefined;
        }
        const colon = line.indexOf(":");
        if (colon < 0) {
            return undefined;
        }
        return { key: line.slice(0, colon), rawValue: line.slice(colon + 1).trim() };
    }
}

/**
 * How a file delimits its frontmatter. Preserved so that serialization never
 * restructures a file it was only asked to edit a field in.
 *
 * - `none`: no `---` line at all; the whole file is body.
 * - `unterminated`: an opening `---` with no closing one; everything after it is
 *   block and there is no body.
 * - `terminated`: the normal shape written by `create`.
 */
type BlockShape = "none" | "unterminated" | "terminated";

/**
 * A ticket file's text split into its frontmatter block and its body.
 *
 * `text()` reproduces the original bytes exactly when nothing was changed, for ALL
 * three block shapes — a malformed file is edited, never silently repaired, which is
 * what bash's line-oriented `sed` does too.
 */
export class TicketDocument {
    private constructor(
        readonly frontmatter: Frontmatter,
        /** Text before the opening marker. Empty for every ticket the tool writes. */
        private readonly prologue: readonly string[],
        private readonly bodyLines: readonly string[],
        private readonly shape: BlockShape,
    ) {}

    /**
     * Parse file text. The block spans from the first line that is exactly `---`
     * to the next such line (or EOF), mirroring the bash `front_count` logic.
     */
    static parse(text: string): TicketDocument {
        const lines = text.split(LINE_SEPARATOR);
        const openIndex = lines.indexOf(FRONTMATTER_MARKER);
        if (openIndex < 0) {
            return new TicketDocument(Frontmatter.EMPTY, [], lines, "none");
        }
        const closeIndex = lines.indexOf(FRONTMATTER_MARKER, openIndex + 1);
        const prologue = lines.slice(0, openIndex);
        if (closeIndex < 0) {
            const block = Frontmatter.fromLines(lines.slice(openIndex + 1));
            return new TicketDocument(block, prologue, [], "unterminated");
        }
        return new TicketDocument(
            Frontmatter.fromLines(lines.slice(openIndex + 1, closeIndex)),
            prologue,
            lines.slice(closeIndex + 1),
            "terminated",
        );
    }

    static of(frontmatter: Frontmatter, body: string): TicketDocument {
        return new TicketDocument(frontmatter, [], body.split(LINE_SEPARATOR), "terminated");
    }

    /** Body text after the closing marker, verbatim. Empty when there is no closing marker. */
    body(): string {
        return this.bodyLines.join(LINE_SEPARATOR);
    }

    /**
     * Replace the frontmatter, keeping the file's existing shape. A file that had no
     * block at all gains a properly terminated one — there is no way to add fields
     * without delimiting them.
     */
    withFrontmatter(frontmatter: Frontmatter): TicketDocument {
        const shape: BlockShape = this.shape === "none" ? "terminated" : this.shape;
        return new TicketDocument(frontmatter, this.prologue, this.bodyLines, shape);
    }

    /** Append text to the body verbatim. */
    withBodyAppended(text: string): TicketDocument {
        return TicketDocument.of(this.frontmatter, this.body() + text);
    }

    /** Full file text; byte-identical to the parsed input when nothing was changed. */
    text(): string {
        if (this.shape === "none") {
            return this.bodyLines.join(LINE_SEPARATOR);
        }
        if (this.shape === "unterminated") {
            return [...this.prologue, FRONTMATTER_MARKER, ...this.frontmatter.toLines()].join(LINE_SEPARATOR);
        }
        return [
            ...this.prologue,
            FRONTMATTER_MARKER,
            ...this.frontmatter.toLines(),
            FRONTMATTER_MARKER,
            ...this.bodyLines,
        ].join(LINE_SEPARATOR);
    }
}
