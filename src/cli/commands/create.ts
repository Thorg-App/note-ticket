import { type FrontmatterEntry, Frontmatter, FrontmatterValue, TicketDocument } from "../../core/frontmatter.js";
import { Slug } from "../../core/slug.js";
import { TICKET_STATUS_OPEN, Ticket, TicketField } from "../../core/ticket.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { CliError, UsageError } from "../cli-error.js";
import type { CommandEnvironment } from "../command-environment.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";
import { LINE_SEPARATOR } from "../../core/text.js";

/** Bash `${title:-Untitled}` — an absent OR empty title falls back. */
const DEFAULT_TITLE = "Untitled";
const DEFAULT_PRIORITY = "2";
const DEFAULT_TYPE = "task";

const DESIGN_HEADING = "## Design";
const ACCEPTANCE_HEADING = "## Acceptance Criteria";

const EMPTY_ARRAY = FrontmatterValue.serializeArray([]);

/** Bash `-*)` arm: any argument starting with a hyphen that is not a known flag. */
const OPTION_PREFIX = "-";
const UNKNOWN_OPTION_MESSAGE = "Unknown option: ";

/**
 * The `create` flags, parsed. Every value is RAW: bash validates neither `priority` nor
 * `type`, so `-p high` is written out verbatim.
 */
export interface CreateOptions {
    /** `undefined` when no positional was given. */
    readonly title: string | undefined;
    readonly description: string;
    readonly design: string;
    readonly acceptance: string;
    readonly priority: string;
    readonly type: string;
    /** `undefined` when `-a` was not given, which is what selects the git-config default. */
    readonly assignee: string | undefined;
    readonly externalRef: string;
    readonly parent: string;
    /** Comma-separated, exactly as typed. */
    readonly tags: string;
}

type MutableCreateOptions = { -readonly [K in keyof CreateOptions]: CreateOptions[K] };

/** Flag spellings bash accepts, each taking the next argument as its value. */
const VALUE_FLAGS: ReadonlyMap<string, keyof CreateOptions> = new Map([
    ["-d", "description"],
    ["--description", "description"],
    ["--design", "design"],
    ["--acceptance", "acceptance"],
    ["-p", "priority"],
    ["--priority", "priority"],
    ["-t", "type"],
    ["--type", "type"],
    ["-a", "assignee"],
    ["--assignee", "assignee"],
    ["--external-ref", "externalRef"],
    ["--parent", "parent"],
    ["--tags", "tags"],
]);

export class CreateOptionsParser {
    /**
     * @throws UsageError for an unknown flag — bash prints `Unknown option: <arg>` with NO
     *   `Error: ` prefix and exits 1.
     * @throws CliError when a flag ends the argument list. DIVERGENCE (deliberate): bash
     *   dereferences `$2` under `set -u` and dies with the shell's own
     *   `./ticket: line 308: $2: unbound variable`, which names a line of the script and
     *   tells the user nothing. Same exit code 1, actionable message.
     */
    static parse(args: readonly string[]): CreateOptions {
        const options: MutableCreateOptions = {
            title: undefined,
            description: "",
            design: "",
            acceptance: "",
            priority: DEFAULT_PRIORITY,
            type: DEFAULT_TYPE,
            assignee: undefined,
            externalRef: "",
            parent: "",
            tags: "",
        };
        let index = 0;
        while (index < args.length) {
            const arg = args[index] as string;
            const flag = VALUE_FLAGS.get(arg);
            if (flag !== undefined) {
                const value = args[index + 1];
                if (value === undefined) {
                    throw new CliError(`option '${arg}' requires a value`);
                }
                options[flag] = value;
                index += 2;
                continue;
            }
            if (arg.startsWith(OPTION_PREFIX)) {
                throw new UsageError([`${UNKNOWN_OPTION_MESSAGE}${arg}`]);
            }
            // Bash assigns `title="$1"` on every positional, so the LAST one wins.
            options.title = arg;
            index += 1;
        }
        return options;
    }
}

/** Everything about a new ticket that is not a flag: generated, resolved or clock-derived. */
export interface NewTicketFacts {
    readonly id: string;
    /** One timestamp for both `created_iso` and `status_updated_iso`, as bash does. */
    readonly now: string;
    /** FULL id of the parent, or `""` for none — never the partial id the user typed. */
    readonly parentId: string;
    /** Effective assignee: `-a` if given, else the git-config default. `""` omits the line. */
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

    /** Title as bash resolves it: a missing OR empty positional becomes `Untitled`. */
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

/**
 * `create [title] [flags]`: write a new ticket at the top level of the tickets directory
 * and print it as one JSON line.
 */
export class CreateCommand {
    static run(store: TicketStore, args: readonly string[], environment: CommandEnvironment): number {
        const options = CreateOptionsParser.parse(args);
        const facts: NewTicketFacts = {
            id: environment.newTicketId(),
            now: environment.clock.nowIso(),
            parentId: CreateCommand.parentId(store, options.parent),
            assignee: options.assignee ?? environment.defaultAssignee(),
        };
        const title = NewTicketDocument.titleOf(options);
        const filename = Slug.uniqueFilename(title, (candidate) => store.topLevelFileExists(candidate));
        const ticket = new Ticket(store.pathForNewTicket(filename), NewTicketDocument.of(options, facts));
        store.save(ticket);
        process.stdout.write(`${ticket.toJsonText()}${LINE_SEPARATOR}`);
        return ExitCode.SUCCESS;
    }

    /**
     * `--parent` accepts a partial id and is stored as the FULL one, so the parent link does
     * not depend on which abbreviation happened to be unique on the day.
     *
     * @throws CliError when the parent cannot be resolved — nothing is written in that case.
     */
    private static parentId(store: TicketStore, parent: string): string {
        if (parent === "") {
            return "";
        }
        return TicketLookup.byId(store.loadAll(), parent).id;
    }
}
