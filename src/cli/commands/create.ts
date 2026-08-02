import {
    type CreateOptions,
    CreateOptionsDefaults,
    NewTicketDocument,
    type NewTicketFacts,
} from "../../core/new-ticket.js";
import { Slug } from "../../core/slug.js";
import { Ticket } from "../../core/ticket.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { CliError, UsageError } from "../cli-error.js";
import type { CommandEnvironment } from "../command-environment.js";
import { ExitCode } from "../exit-codes.js";
import { TicketLookup } from "../ticket-lookup.js";
import { LINE_SEPARATOR } from "../../core/text.js";

/** Bash `-*)` arm: any argument starting with a hyphen that is not a known flag. */
const OPTION_PREFIX = "-";
const UNKNOWN_OPTION_MESSAGE = "Unknown option: ";

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
        const options: MutableCreateOptions = CreateOptionsDefaults.resolved({});
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
