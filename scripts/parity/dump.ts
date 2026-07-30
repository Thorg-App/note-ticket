/**
 * Thin entrypoint that renders `src/core` output in bash `./ticket`'s exact format,
 * so the parity checks can diff the two byte-for-byte. Not shipped: this is a test
 * fixture for the migration and gets deleted at T6 together with bash `ticket`.
 *
 * Only for commands the shipped CLI does NOT serve yet — once a command lands in
 * `TS_COMMANDS`, its check switches to `dist/ticket.mjs` and its mode is deleted here,
 * so the output format is never described in two places.
 */
import { DepGraph } from "../../src/core/dep-graph.js";
import { Slug } from "../../src/core/slug.js";
import { TicketStore } from "../../src/core/ticket-store.js";

const [, , mode, arg1, arg2] = process.argv;

/** Every mode but `slug` reads the tickets dir the harness points us at. */
function openStore(): TicketStore {
    return new TicketStore(process.env["TICKETS_DIR"] as string);
}

function graph(): DepGraph {
    return DepGraph.build(openStore().loadAll());
}

if (mode === "tree") {
    const g = graph();
    for (const row of g.tree(arg1 as string, { full: arg2 === "full" })) {
        const t = g.get(row.id);
        process.stdout.write(`${row.prefix}${row.connector}${row.id} [${t?.status}] ${t?.title}\n`);
    }
} else if (mode === "cycle") {
    const g = graph();
    const cycles = g.excludingClosed().cycles();
    if (cycles.length === 0) {
        process.stdout.write("No dependency cycles found\n");
    } else {
        cycles.forEach((c, i) => {
            if (i > 0) process.stdout.write("\n");
            process.stdout.write(`Cycle ${i + 1}: ${c.pathIds.join(" -> ")}\n`);
            for (const id of c.memberIds) {
                const t = g.get(id);
                process.stdout.write(`  ${id.padEnd(8)} [${t?.status}] ${t?.title}\n`);
            }
        });
    }
} else if (mode === "query") {
    for (const t of openStore().loadAll()) {
        if (t.hasFrontmatterFields) process.stdout.write(`${JSON.stringify(t.toJsonRecord())}\n`);
    }
} else if (mode === "slug") {
    process.stdout.write(`${Slug.fromTitle(arg1 as string)}.md\n`);
} else {
    process.stderr.write(`dump: unknown mode=[${mode}]\n`);
    process.exit(2);
}
