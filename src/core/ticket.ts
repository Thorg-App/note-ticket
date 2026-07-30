/**
 * The ticket entity: a markdown file's frontmatter + body, plus the path it was
 * loaded from. Field names mirror the on-disk keys.
 */

import { Frontmatter, FrontmatterValue, type FrontmatterJsonValue, TicketDocument } from "./frontmatter.js";

/** Statuses `create`/`status` accept. `done` also occurs in legacy files. */
export const TICKET_STATUS_OPEN = "open";
export const TICKET_STATUS_IN_PROGRESS = "in_progress";
export const TICKET_STATUS_CLOSED = "closed";

export const VALID_TICKET_STATUSES: readonly string[] = [
    TICKET_STATUS_OPEN,
    TICKET_STATUS_IN_PROGRESS,
    TICKET_STATUS_CLOSED,
];

/** Priority when the field is absent — 0 is highest, 4 lowest. */
export const DEFAULT_PRIORITY = "2";

const FIELD_ID = "id";
const FIELD_TITLE = "title";
const FIELD_STATUS = "status";
const FIELD_DEPS = "deps";
const FIELD_LINKS = "links";
const FIELD_TAGS = "tags";
const FIELD_PRIORITY = "priority";
const FIELD_ASSIGNEE = "assignee";
const FIELD_PARENT = "parent";

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
        return this.frontmatter.getString(FIELD_ID) ?? "";
    }

    /** Title with the surrounding double quotes stripped; inner escapes kept as on disk. */
    get title(): string {
        return this.frontmatter.getString(FIELD_TITLE) ?? "";
    }

    get status(): string {
        return this.frontmatter.getString(FIELD_STATUS) ?? "";
    }

    get deps(): readonly string[] {
        return this.frontmatter.getArray(FIELD_DEPS);
    }

    get links(): readonly string[] {
        return this.frontmatter.getArray(FIELD_LINKS);
    }

    get tags(): readonly string[] {
        return this.frontmatter.getArray(FIELD_TAGS);
    }

    /** Raw priority text, defaulted — kept a string because it is echoed verbatim. */
    get priority(): string {
        const priority = this.frontmatter.getString(FIELD_PRIORITY);
        return priority === undefined || priority === "" ? DEFAULT_PRIORITY : priority;
    }

    get assignee(): string {
        return this.frontmatter.getString(FIELD_ASSIGNEE) ?? "";
    }

    get parent(): string {
        return this.frontmatter.getString(FIELD_PARENT) ?? "";
    }

    get isClosed(): boolean {
        return this.status === TICKET_STATUS_CLOSED;
    }

    get body(): string {
        return this.document.body();
    }

    /** False for files that have no frontmatter fields at all; `query` skips those. */
    get hasFrontmatterFields(): boolean {
        return this.frontmatter.entries().length > 0;
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

    withField(key: string, rawValue: string): Ticket {
        return this.withFrontmatter(this.frontmatter.withField(key, rawValue));
    }

    withoutField(key: string): Ticket {
        return this.withFrontmatter(this.frontmatter.withoutField(key));
    }

    withArrayField(key: string, items: readonly string[]): Ticket {
        return this.withField(key, FrontmatterValue.serializeArray(items));
    }

    withBodyAppended(text: string): Ticket {
        return new Ticket(this.path, this.document.withBodyAppended(text));
    }

    text(): string {
        return this.document.text();
    }

    private withFrontmatter(frontmatter: Frontmatter): Ticket {
        return new Ticket(this.path, this.document.withFrontmatter(frontmatter));
    }
}
