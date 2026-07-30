/**
 * The ticket entity: a markdown file's frontmatter + body, plus the path it was
 * loaded from. Field names mirror the on-disk keys.
 */

import { Frontmatter, FrontmatterValue, type FrontmatterJsonValue, TicketDocument } from "./frontmatter.js";

/** Statuses `create`/`status` accept. `done` also occurs in legacy files. */
export const TICKET_STATUS_OPEN = "open";
export const TICKET_STATUS_IN_PROGRESS = "in_progress";
export const TICKET_STATUS_CLOSED = "closed";
/** Legacy status found in old files; `create`/`status` never write it. */
export const TICKET_STATUS_DONE = "done";

export const VALID_TICKET_STATUSES: readonly string[] = [
    TICKET_STATUS_OPEN,
    TICKET_STATUS_IN_PROGRESS,
    TICKET_STATUS_CLOSED,
];

/** Priority when the field is absent — 0 is highest, 4 lowest. */
export const DEFAULT_PRIORITY = "2";

/**
 * The on-disk frontmatter key names, in one place.
 *
 * WHY exported: the write commands address fields by name (`status`, `closed_iso`, `deps`,
 * …) and a second spelling of a key in a command module would be a silent data-model fork.
 */
export class TicketField {
    static readonly ID = "id";
    static readonly TITLE = "title";
    static readonly STATUS = "status";
    static readonly DEPS = "deps";
    static readonly LINKS = "links";
    static readonly TAGS = "tags";
    static readonly PRIORITY = "priority";
    static readonly ASSIGNEE = "assignee";
    static readonly PARENT = "parent";
    static readonly TYPE = "type";
    /** Hyphenated on disk, unlike every other key. */
    static readonly EXTERNAL_REF = "external-ref";
    static readonly CREATED_ISO = "created_iso";
    static readonly STATUS_UPDATED_ISO = "status_updated_iso";
    static readonly CLOSED_ISO = "closed_iso";
}

/** Key `query` appends after the frontmatter fields. */
const JSON_KEY_FULL_PATH = "full_path";

export class Ticket {
    constructor(
        /** Absolute path of the file this ticket was read from. */
        readonly path: string,
        readonly document: TicketDocument,
    ) {}

    static parse(path: string, text: string): Ticket {
        return new Ticket(path, TicketDocument.parse(text));
    }

    get frontmatter(): Frontmatter {
        return this.document.frontmatter;
    }

    /**
     * Stable identity. Empty only for a corrupt file: `TicketStore.load` rejects such a
     * file with `MissingTicketIdError`, so a ticket obtained from the store always has one.
     */
    get id(): string {
        return this.frontmatter.getString(TicketField.ID) ?? "";
    }

    /** Title with the surrounding double quotes stripped; inner escapes kept as on disk. */
    get title(): string {
        return this.frontmatter.getString(TicketField.TITLE) ?? "";
    }

    get status(): string {
        return this.frontmatter.getString(TicketField.STATUS) ?? "";
    }

    /**
     * The inline id array under `key`, empty when the field is absent.
     *
     * WHY public: `TicketRelation` addresses `deps`/`links` by field name and MUST read them
     * exactly as the accessors below do — two expressions of "an id array of this ticket"
     * would drift the moment either side started normalizing.
     */
    arrayField(key: string): readonly string[] {
        return this.frontmatter.getArray(key);
    }

    get deps(): readonly string[] {
        return this.arrayField(TicketField.DEPS);
    }

    get links(): readonly string[] {
        return this.arrayField(TicketField.LINKS);
    }

    get tags(): readonly string[] {
        return this.arrayField(TicketField.TAGS);
    }

    /** Raw priority text, defaulted — kept a string because it is echoed verbatim. */
    get priority(): string {
        const priority = this.frontmatter.getString(TicketField.PRIORITY);
        return priority === undefined || priority === "" ? DEFAULT_PRIORITY : priority;
    }

    get assignee(): string {
        return this.frontmatter.getString(TicketField.ASSIGNEE) ?? "";
    }

    get parent(): string {
        return this.frontmatter.getString(TicketField.PARENT) ?? "";
    }

    get isClosed(): boolean {
        return this.status === TICKET_STATUS_CLOSED;
    }

    /**
     * Work is over: `closed`, or the legacy `done`.
     *
     * WHY this is NOT `isClosed`: the two notions are deliberately different in bash. The
     * `closed` listing selects `status == "closed" || status == "done"`, while dependency
     * resolution (`ready`/`blocked`) compares against `"closed"` alone, so a `done`
     * dependency still blocks. Verified against ./ticket; collapsing them would change
     * either the listing or the graph.
     */
    get isFinished(): boolean {
        return this.isClosed || this.status === TICKET_STATUS_DONE;
    }

    get body(): string {
        return this.document.body();
    }

    hasTag(tag: string): boolean {
        return this.tags.includes(tag);
    }

    /**
     * The `query` record: frontmatter fields in file order, then `full_path`.
     * A `full_path` field already in the frontmatter is overwritten, matching the
     * bash emitter where the appended pair wins in any JSON parser.
     */
    toJsonRecord(): Record<string, FrontmatterJsonValue> {
        return { ...this.frontmatter.toJsonRecord(), [JSON_KEY_FULL_PATH]: this.path };
    }

    /**
     * `toJsonRecord` as one compact JSON line, no trailing newline: the unit `query`
     * emits per ticket and `create` prints for the ticket it just wrote (bash shares one
     * `_file_to_jsonl` between the two, and so does this).
     *
     * DIVERGENCE (deliberate): bash escapes only `\` and `"`, so a value containing a raw
     * control character — reachable via `tk create $'tab\there'` — produces a line that is
     * not valid JSON and that `jq` rejects. `JSON.stringify` escapes it properly.
     */
    toJsonText(): string {
        return JSON.stringify(this.toJsonRecord());
    }

    withField(key: string, rawValue: string): Ticket {
        return this.withFrontmatter(this.frontmatter.withField(key, rawValue));
    }

    withoutField(key: string): Ticket {
        return this.withFrontmatter(this.frontmatter.withoutField(key));
    }

    withArrayField(key: string, items: readonly string[]): Ticket {
        return this.withField(key, FrontmatterValue.serializeArray(items));
    }

    text(): string {
        return this.document.text();
    }

    private withFrontmatter(frontmatter: Frontmatter): Ticket {
        return new Ticket(this.path, this.document.withFrontmatter(frontmatter));
    }
}
