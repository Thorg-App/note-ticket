import { DepGraph } from "../../core/dep-graph.js";
import type { Ticket } from "../../core/ticket.js";
import type { TicketStore } from "../../core/ticket-store.js";
import { UsageError } from "../cli-error.js";
import { Pager } from "../pager.js";
import { TicketLookup } from "../ticket-lookup.js";
import { TicketRow } from "../ticket-row.js";

const USAGE = "Usage: ticket show <id>";

const LINE_SEPARATOR = "\n";
const FRONTMATTER_FENCE = "---";
/** `parent: <id>` inside the frontmatter — the only line `show` rewrites. */
const PARENT_LINE = /^parent: */;
const PARENT_TITLE_MARKER = "  # ";
const SECTION_BULLET = "- ";

/**
 * `show <id>`: the ticket file as it is on disk, plus the relationships that are not in it.
 *
 * The file is echoed LINE BY LINE rather than parsed and re-serialised, so whatever the
 * author wrote survives verbatim; only the `parent:` line is annotated with the parent's
 * title. The computed sections follow in a fixed order: Blockers, Blocking, Children, Linked.
 */
export class ShowCommand {
    static run(store: TicketStore, args: readonly string[]): number {
        if (args.length === 0) {
            throw new UsageError([USAGE]);
        }
        const tickets = store.loadAll();
        const target = TicketLookup.byId(tickets, args[0] as string);
        return Pager.write(ShowCommand.render(target, DepGraph.build(tickets)));
    }

    /** The whole output for one ticket: its file, then the computed sections. */
    static render(target: Ticket, graph: DepGraph): string {
        return ShowCommand.fileLines(target, graph) + ShowCommand.sections(target, graph);
    }

    /**
     * The file's own lines, with the parent's title appended to the `parent:` line.
     *
     * WHY line-based and not `Ticket.text()`: bash read the file with `getline`, which drops
     * a missing final newline — so a file not ending in one gains one here. Reproduced so
     * the two implementations are byte-identical on such a file.
     */
    private static fileLines(target: Ticket, graph: DepGraph): string {
        let fenceCount = 0;
        return ShowCommand.linesOf(target.text())
            .map((line) => {
                if (line === FRONTMATTER_FENCE) {
                    fenceCount++;
                    return line;
                }
                const inFrontmatter = fenceCount === 1;
                if (!inFrontmatter || !PARENT_LINE.test(line)) {
                    return line;
                }
                return ShowCommand.annotatedParent(line, graph);
            })
            .map((line) => `${line}${LINE_SEPARATOR}`)
            .join("");
    }

    /** `parent: <id>  # <title>`, or the line untouched when the parent is unknown. */
    private static annotatedParent(line: string, graph: DepGraph): string {
        const parentId = line.replace(PARENT_LINE, "");
        const parent = graph.get(parentId);
        return parent === undefined ? line : `${line}${PARENT_TITLE_MARKER}${parent.title}`;
    }

    /**
     * Text split into lines the way awk's `getline` reads records: the final newline is a
     * TERMINATOR, not a separator, so it does not produce a trailing empty line.
     */
    private static linesOf(text: string): readonly string[] {
        const lines = text.split(LINE_SEPARATOR);
        return lines[lines.length - 1] === "" ? lines.slice(0, -1) : lines;
    }

    /**
     * The four computed sections, each omitted when it has no rows.
     *
     * DIVERGENCE (deliberate): bash built Blocking and Children by iterating an awk
     * associative array, whose order is UNSPECIFIED, and appended one Blocking row per
     * matching `deps` ENTRY — so a ticket listing the target twice was printed twice. These
     * follow enumeration (path) order and list each ticket once. See
     * `scripts/parity/README.md`.
     */
    private static sections(target: Ticket, graph: DepGraph): string {
        const targetId = target.id;
        return [
            ShowCommand.section("Blockers", graph.blockerIdsOf(targetId), graph),
            ShowCommand.section("Blocking", ShowCommand.idsOf(graph.activeDependents(targetId)), graph),
            ShowCommand.section("Children", ShowCommand.idsOf(graph.children(targetId)), graph),
            ShowCommand.section("Linked", target.links, graph),
        ].join("");
    }

    private static idsOf(tickets: readonly Ticket[]): readonly string[] {
        return tickets.map((ticket) => ticket.id);
    }

    /** `\n## <heading>\n\n` and one `- <id> [<status>] <title>` row per id. */
    private static section(heading: string, ids: readonly string[], graph: DepGraph): string {
        if (ids.length === 0) {
            return "";
        }
        const rows = ids.map((id) => `${SECTION_BULLET}${TicketRow.identified(id, graph.get(id))}`);
        return TicketRow.text(["", `## ${heading}`, "", ...rows]);
    }
}
