/**
 * What a brand-new ticket is made of: the raw field values, the generated facts, and the
 * document layout. Pure — no argv, no I/O — shared by the CLI's `create` and the library's
 * `TicketManager.create`.
 */

import { type FrontmatterEntry, Frontmatter, FrontmatterValue, TicketDocument } from "./frontmatter.js";
import { LINE_SEPARATOR } from "./text.js";
import { TICKET_STATUS_OPEN, TicketField } from "./ticket.js";

/** Bash `${title:-Untitled}` — an absent OR empty title falls back. */
const DEFAULT_TITLE = "Untitled";
const DEFAULT_PRIORITY = "2";
const DEFAULT_TYPE = "task";

const DESIGN_HEADING = "## Design";
const ACCEPTANCE_HEADING = "## Acceptance Criteria";

const EMPTY_ARRAY = FrontmatterValue.serializeArray([]);

/**
 * The raw values a new ticket is built from. Every value is RAW: bash validates neither
 * `priority` nor `type`, so `-p high` is written out verbatim.
 */
export interface CreateOptions {
    /** `undefined` when no title was given. */
    readonly title: string | undefined;
    readonly description: string;
    readonly design: string;
    readonly acceptance: string;
    readonly priority: string;
    readonly type: string;
    /** `undefined` when not given, which is what selects the git-config default. */
    readonly assignee: string | undefined;
    readonly externalRef: string;
    readonly parent: string;
    /** Comma-separated, exactly as typed. */
    readonly tags: string;
}

/**
 * The one place the `CreateOptions` defaults live: the CLI parser seeds its accumulator
 * with them, and `TicketManager.create` fills a partial input with them.
 */
export class CreateOptionsDefaults {
    static resolved(input: Partial<CreateOptions>): CreateOptions {
        return {
            title: input.title,
            description: input.description ?? "",
            design: input.design ?? "",
            acceptance: input.acceptance ?? "",
            priority: input.priority ?? DEFAULT_PRIORITY,
            type: input.type ?? DEFAULT_TYPE,
            assignee: input.assignee,
            externalRef: input.externalRef ?? "",
            parent: input.parent ?? "",
            tags: input.tags ?? "",
        };
    }
}

/** Everything about a new ticket that is not a supplied value: generated, resolved or clock-derived. */
export interface NewTicketFacts {
    readonly id: string;
    /** One timestamp for both `created_iso` and `status_updated_iso`, as bash does. */
    readonly now: string;
    /** FULL id of the parent, or `""` for none — never the partial id the user typed. */
    readonly parentId: string;
    /** Effective assignee: the explicit one if given, else the git-config default. `""` omits the line. */
    readonly assignee: string;
}

/**
 * The file a brand-new ticket starts life as.
 *
 * Frontmatter key order and the optional lines' positions are the contract (`create` prints
 * this frontmatter as JSON, in file order), so the entries are built as one explicit list.
 */
export class NewTicketDocument {
    static of(options: CreateOptions, facts: NewTicketFacts): TicketDocument {
        return TicketDocument.of(
            Frontmatter.fromEntries(NewTicketDocument.entries(options, facts)),
            NewTicketDocument.body(options),
        );
    }

    /** Title as bash resolves it: a missing OR empty title becomes `Untitled`. */
    static titleOf(options: CreateOptions): string {
        return options.title === undefined || options.title === "" ? DEFAULT_TITLE : options.title;
    }

    private static entries(options: CreateOptions, facts: NewTicketFacts): readonly FrontmatterEntry[] {
        const title = NewTicketDocument.titleOf(options);
        const entries: FrontmatterEntry[] = [
            { key: TicketField.ID, rawValue: facts.id },
            { key: TicketField.TITLE, rawValue: `"${title.replace(/"/g, '\\"')}"` },
            { key: TicketField.STATUS, rawValue: TICKET_STATUS_OPEN },
            { key: TicketField.DEPS, rawValue: EMPTY_ARRAY },
            { key: TicketField.LINKS, rawValue: EMPTY_ARRAY },
            { key: TicketField.CREATED_ISO, rawValue: facts.now },
            { key: TicketField.STATUS_UPDATED_ISO, rawValue: facts.now },
            { key: TicketField.TYPE, rawValue: options.type },
            { key: TicketField.PRIORITY, rawValue: options.priority },
        ];
        // Each optional line is written only when non-empty, in bash's order.
        NewTicketDocument.pushIfPresent(entries, TicketField.ASSIGNEE, facts.assignee);
        NewTicketDocument.pushIfPresent(entries, TicketField.EXTERNAL_REF, options.externalRef);
        NewTicketDocument.pushIfPresent(entries, TicketField.PARENT, facts.parentId);
        // `a,b , c` -> `[a, b ,  c]`: bash substitutes `,` with `, ` and trims nothing.
        NewTicketDocument.pushIfPresent(entries, TicketField.TAGS, NewTicketDocument.tagsValue(options.tags));
        return entries;
    }

    private static tagsValue(tags: string): string {
        return tags === "" ? "" : `[${tags.replace(/,/g, ", ")}]`;
    }

    private static pushIfPresent(entries: FrontmatterEntry[], key: string, rawValue: string): void {
        if (rawValue !== "") {
            entries.push({ key, rawValue });
        }
    }

    /**
     * The body, as bash's `echo` sequence produces it: a blank line after the closing fence,
     * then each supplied section followed by its own blank line. Every line is TERMINATED by
     * a newline, so the file always ends with one.
     */
    private static body(options: CreateOptions): string {
        const lines: string[] = [""];
        if (options.description !== "") {
            lines.push(options.description, "");
        }
        if (options.design !== "") {
            lines.push(DESIGN_HEADING, "", options.design, "");
        }
        if (options.acceptance !== "") {
            lines.push(ACCEPTANCE_HEADING, "", options.acceptance, "");
        }
        return lines.map((line) => `${line}${LINE_SEPARATOR}`).join("");
    }
}
