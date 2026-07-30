/**
 * The dependency graph over tickets: ready/blocked computation, cycle detection
 * and dependency-tree layout.
 *
 * `deps` edges point from a ticket to what it waits on. An UNKNOWN dependency id
 * counts as not-closed, i.e. it blocks — a dangling reference must never make a
 * ticket look actionable.
 */

import { type Ticket, TICKET_STATUS_IN_PROGRESS, TICKET_STATUS_OPEN } from "./ticket.js";

/** Tree-drawing pieces; the CLI renders `prefix + connector + <node text>`. */
const CONNECTOR_LAST = "└── ";
const CONNECTOR_MIDDLE = "├── ";
const PREFIX_UNDER_LAST = "    ";
const PREFIX_UNDER_MIDDLE = "│   ";

/** A ticket that cannot be worked on yet, with the reasons why. */
export interface BlockedTicket {
    readonly ticket: Ticket;
    /** Dependency ids that are not closed, in the order they appear in `deps`. */
    readonly blockerIds: readonly string[];
}

export interface DepCycle {
    /** The cycle walk, first id repeated at the end: `[a, b, a]`. */
    readonly pathIds: readonly string[];
    /** The same members without the repeat, rotated to start at the smallest id. */
    readonly memberIds: readonly string[];
}

/** One line of a rendered dependency tree. */
export interface TreeRow {
    readonly id: string;
    readonly depth: number;
    readonly prefix: string;
    readonly connector: string;
}

export interface TreeOptions {
    /** Print every path to a ticket instead of only its deepest placement. */
    readonly full: boolean;
}

/** Orders listings the way `ready`/`blocked` do: priority first, then id. */
class TicketOrder {
    static byPriorityThenId(left: Ticket, right: Ticket): number {
        return TicketOrder.comparePriority(left.priority, right.priority) || TicketOrder.compareId(left.id, right.id);
    }

    /**
     * Numeric when both sides are numbers, lexicographic otherwise — mirrors awk's
     * strnum comparison, which the bash sort relies on for `0`..`4`.
     */
    private static comparePriority(left: string, right: string): number {
        const leftNumber = Number(left);
        const rightNumber = Number(right);
        if (!Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) {
            return leftNumber - rightNumber;
        }
        return TicketOrder.compareId(left, right);
    }

    private static compareId(left: string, right: string): number {
        return left < right ? -1 : left > right ? 1 : 0;
    }
}

export class DepGraph {
    private constructor(private readonly byId: ReadonlyMap<string, Ticket>) {}

    /**
     * Index tickets by id. Files without an `id` are not tickets and are dropped;
     * on a duplicate id the last file in enumeration order wins, matching bash.
     */
    static build(tickets: readonly Ticket[]): DepGraph {
        const byId = new Map<string, Ticket>();
        for (const ticket of tickets) {
            if (ticket.id !== "") {
                byId.set(ticket.id, ticket);
            }
        }
        return new DepGraph(byId);
    }

    /** Subgraph of non-closed tickets — the population `dep cycle` reports on. */
    excludingClosed(): DepGraph {
        return DepGraph.build([...this.byId.values()].filter((ticket) => !ticket.isClosed));
    }

    get(id: string): Ticket | undefined {
        return this.byId.get(id);
    }

    has(id: string): boolean {
        return this.byId.has(id);
    }

    /** All tickets in enumeration (path) order. */
    tickets(): readonly Ticket[] {
        return [...this.byId.values()];
    }

    /** An unknown id is NOT closed, so a dangling dependency keeps blocking. */
    isClosed(id: string): boolean {
        return this.byId.get(id)?.isClosed ?? false;
    }

    depsOf(id: string): readonly string[] {
        return this.byId.get(id)?.deps ?? [];
    }

    /** Open/in_progress tickets whose every dependency is closed. */
    ready(): readonly Ticket[] {
        return this.activeTickets()
            .filter((ticket) => ticket.deps.every((dep) => this.isClosed(dep)))
            .sort(TicketOrder.byPriorityThenId);
    }

    /**
     * Dependency ids of `id` that are not closed, in `deps` order — what still holds it up.
     * An unknown id is kept: a dangling reference blocks (see the module doc).
     */
    blockerIdsOf(id: string): readonly string[] {
        return this.depsOf(id).filter((dep) => !this.isClosed(dep));
    }

    /** Open/in_progress tickets with at least one dependency that is not closed. */
    blocked(): readonly BlockedTicket[] {
        return this.activeTickets()
            .map((ticket) => ({ ticket, blockerIds: this.blockerIdsOf(ticket.id) }))
            .filter((blocked) => blocked.blockerIds.length > 0)
            .sort((left, right) => TicketOrder.byPriorityThenId(left.ticket, right.ticket));
    }

    /** Tickets that depend on `id` and are still open — what closing `id` unblocks. */
    activeDependents(id: string): readonly Ticket[] {
        return this.tickets().filter((ticket) => !ticket.isClosed && ticket.deps.includes(id));
    }

    /** Tickets whose `parent` is `id`. */
    children(id: string): readonly Ticket[] {
        return this.tickets().filter((ticket) => ticket.parent === id);
    }

    /**
     * Every dependency cycle, deduplicated by member set.
     *
     * Iteration follows enumeration order so the result is deterministic (bash
     * iterated an awk array, whose order is unspecified).
     */
    cycles(): readonly DepCycle[] {
        const finder = new CycleFinder(this);
        return finder.find();
    }

    /**
     * Rows of the dependency tree rooted at `id`, or an empty list if unknown.
     *
     * Default mode shows each ticket once, at its DEEPEST position in the tree, and
     * orders siblings by subtree depth then id — so the longest chain reads down the
     * left. `full` disables the dedup and the deepest-only rule.
     */
    tree(rootId: string, options: TreeOptions): readonly TreeRow[] {
        if (!this.has(rootId)) {
            return [];
        }
        return new TreeLayout(this, rootId, options).rows();
    }

    private activeTickets(): Ticket[] {
        return this.tickets().filter(
            (ticket) => ticket.status === TICKET_STATUS_OPEN || ticket.status === TICKET_STATUS_IN_PROGRESS,
        );
    }
}

/** DFS colouring during cycle detection; absent from the map means unvisited. */
type VisitState = "on-stack" | "done";

/**
 * Depth-first cycle detection. Each back edge yields one cycle; cycles sharing the
 * same member set are reported once.
 *
 * WHY-NOT the bash algorithm verbatim: it aborted the whole DFS on the first cycle
 * and left nodes marked "visiting", so a later traversal reaching such a node
 * reported a path that was not a cycle at all.
 */
class CycleFinder {
    private readonly state = new Map<string, VisitState>();
    private readonly stack: string[] = [];
    private readonly seen = new Set<string>();
    private readonly cycles: DepCycle[] = [];

    constructor(private readonly graph: DepGraph) {}

    find(): readonly DepCycle[] {
        for (const ticket of this.graph.tickets()) {
            if (!this.state.has(ticket.id)) {
                this.visit(ticket.id);
            }
        }
        return this.cycles;
    }

    private visit(id: string): void {
        const state = this.state.get(id);
        if (!this.graph.has(id) || state === "done") {
            return;
        }
        if (state === "on-stack") {
            this.record(id);
            return;
        }
        this.state.set(id, "on-stack");
        this.stack.push(id);
        for (const dep of this.graph.depsOf(id)) {
            this.visit(dep);
        }
        this.stack.pop();
        this.state.set(id, "done");
    }

    /** `id` is on the current stack: the cycle is the stack suffix starting at it. */
    private record(id: string): void {
        const start = this.stack.indexOf(id);
        const pathIds = [...this.stack.slice(start), id];
        const memberIds = CycleFinder.normalize(this.stack.slice(start));
        const key = memberIds.join(",");
        if (!this.seen.has(key)) {
            this.seen.add(key);
            this.cycles.push({ pathIds, memberIds });
        }
    }

    /** Rotate to start at the smallest id so equivalent cycles compare equal. */
    private static normalize(members: readonly string[]): readonly string[] {
        let smallest = 0;
        for (let i = 1; i < members.length; i++) {
            if ((members[i] as string) < (members[smallest] as string)) {
                smallest = i;
            }
        }
        return members.map((_member, i) => members[(smallest + i) % members.length] as string);
    }
}

/**
 * Computes the dependency-tree rows in three passes, as the bash implementation
 * does: deepest depth per ticket, subtree depth for sibling ordering, then layout.
 */
class TreeLayout {
    /** Deepest depth at which each ticket is reachable from the root. */
    private readonly maxDepth = new Map<string, number>();
    /** Max of `maxDepth` over a ticket and its descendants — the sibling sort key. */
    private readonly subtreeDepth = new Map<string, number>();
    private readonly printed = new Set<string>();
    private readonly output: TreeRow[] = [];

    constructor(
        private readonly graph: DepGraph,
        private readonly rootId: string,
        private readonly options: TreeOptions,
    ) {}

    rows(): readonly TreeRow[] {
        this.measureDepths(this.rootId, 0, new Set<string>());
        this.measureSubtreeDepths(this.rootId, new Set<string>());
        this.output.push({ id: this.rootId, depth: 0, prefix: "", connector: "" });
        this.printed.add(this.rootId);
        this.layoutChildren(this.rootId, 0, "", new Set([this.rootId]));
        return this.output;
    }

    /**
     * WHY every simple path is walked rather than memoized: the deepest placement of
     * a ticket depends on the path taken to it, so a visited-set would cut off the
     * longer route. Cost matches the bash implementation.
     */
    private measureDepths(id: string, depth: number, path: Set<string>): void {
        if (!this.graph.has(id) || path.has(id)) {
            return;
        }
        if (depth > (this.maxDepth.get(id) ?? -1)) {
            this.maxDepth.set(id, depth);
        }
        path.add(id);
        for (const dep of this.graph.depsOf(id)) {
            this.measureDepths(dep, depth + 1, path);
        }
        path.delete(id);
    }

    /**
     * WHY the pending list is snapshotted before recursing: a sibling that gets a value
     * as a side effect of an earlier sibling's subtree is still revisited, which
     * REFINES its value now that more of its own descendants are measured. Dropping
     * that refinement changes sibling ordering in `--full` trees (verified against
     * ./ticket on generated graphs).
     */
    private measureSubtreeDepths(id: string, path: Set<string>): void {
        if (!this.graph.has(id) || path.has(id)) {
            return;
        }
        const pending = this.graph.depsOf(id).filter((dep) => !this.subtreeDepth.has(dep));
        const childPath = new Set([...path, id]);
        for (const dep of pending) {
            this.measureSubtreeDepths(dep, childPath);
        }
        let deepest = this.maxDepth.get(id) ?? 0;
        for (const dep of this.graph.depsOf(id)) {
            deepest = Math.max(deepest, this.subtreeDepth.get(dep) ?? deepest);
        }
        this.subtreeDepth.set(id, deepest);
    }

    private layoutChildren(id: string, depth: number, prefix: string, path: Set<string>): void {
        const children = this.printableChildren(id, depth, path);
        children.forEach((child, index) => {
            const isLast = index === children.length - 1;
            // Re-checked because `deps` is NOT deduped (DepGraph.depsOf returns the raw
            // frontmatter list), so `deps: [b, b]` puts the same id in `children` twice and
            // the first push already marked it printed. Bash re-checks at pop time for the
            // same reason; without this, the duplicate prints an extra row. `--full` keeps
            // both rows because isPrintable ignores `printed` there — as bash does.
            if (!this.isPrintable(child, depth + 1, path)) {
                return;
            }
            const connector = isLast ? CONNECTOR_LAST : CONNECTOR_MIDDLE;
            this.output.push({ id: child, depth: depth + 1, prefix, connector });
            if (!this.options.full) {
                this.printed.add(child);
            }
            const childPrefix = prefix + (isLast ? PREFIX_UNDER_LAST : PREFIX_UNDER_MIDDLE);
            this.layoutChildren(child, depth + 1, childPrefix, new Set([...path, child]));
        });
    }

    /** Children to draw under `id`, ordered by subtree depth then id. */
    private printableChildren(id: string, depth: number, path: Set<string>): readonly string[] {
        return this.graph
            .depsOf(id)
            .filter((child) => this.isPrintable(child, depth + 1, path))
            .sort((left, right) => this.compareSiblings(left, right));
    }

    private isPrintable(id: string, depth: number, path: Set<string>): boolean {
        if (!this.graph.has(id) || path.has(id) || !this.maxDepth.has(id)) {
            return false;
        }
        if (this.options.full) {
            return true;
        }
        // Draw a ticket only at its deepest placement, and only once.
        return !this.printed.has(id) && depth === this.maxDepth.get(id);
    }

    private compareSiblings(left: string, right: string): number {
        const byDepth = (this.subtreeDepth.get(left) ?? -1) - (this.subtreeDepth.get(right) ?? -1);
        return byDepth || (left < right ? -1 : left > right ? 1 : 0);
    }
}
