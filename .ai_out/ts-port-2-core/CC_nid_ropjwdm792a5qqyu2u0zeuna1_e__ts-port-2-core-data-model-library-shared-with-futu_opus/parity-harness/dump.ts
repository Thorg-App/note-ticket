import { DepGraph } from "../../src/core/dep-graph.js";
import { TicketStore } from "../../src/core/ticket-store.js";

const [, , mode, rootId, fullFlag] = process.argv;
const store = new TicketStore(process.env["TICKETS_DIR"] as string);
const graph = DepGraph.build(store.loadAll());

if (mode === "tree") {
    for (const row of graph.tree(rootId as string, { full: fullFlag === "full" })) {
        const t = graph.get(row.id);
        process.stdout.write(`${row.prefix}${row.connector}${row.id} [${t?.status}] ${t?.title}\n`);
    }
} else if (mode === "cycle") {
    const cycles = graph.excludingClosed().cycles();
    if (cycles.length === 0) {
        process.stdout.write("No dependency cycles found\n");
    } else {
        cycles.forEach((c, i) => {
            if (i > 0) process.stdout.write("\n");
            process.stdout.write(`Cycle ${i + 1}: ${c.pathIds.join(" -> ")}\n`);
            for (const id of c.memberIds) {
                const t = graph.get(id);
                process.stdout.write(`  ${id.padEnd(8)} [${t?.status}] ${t?.title}\n`);
            }
        });
    }
} else if (mode === "ready") {
    for (const t of graph.ready()) {
        process.stdout.write(`${t.id.padEnd(8)} [P${t.priority}][${t.status}] - ${t.title}\n`);
    }
} else if (mode === "blocked") {
    for (const b of graph.blocked()) {
        process.stdout.write(
            `${b.ticket.id.padEnd(8)} [P${b.ticket.priority}][${b.ticket.status}] - ${b.ticket.title} <- [${b.blockerIds.join(", ")}]\n`,
        );
    }
} else if (mode === "query") {
    for (const t of store.loadAll()) {
        if (t.hasFrontmatterFields) process.stdout.write(`${JSON.stringify(t.toJsonRecord())}\n`);
    }
}
