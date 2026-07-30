import { spawnSync } from "node:child_process";

import { SpawnedChild } from "./spawned-child.js";

const JQ_BINARY = "jq";
const JQ_COMPACT_OUTPUT = "-c";
const JQ_HINT = "Install jq, or run `query` without a filter";

/**
 * The external `jq`, spawned rather than reimplemented.
 *
 * WHY-NOT a built-in filter language: `query [jq-filter]` promises jq's own syntax, and a
 * hand-rolled subset would silently disagree with it on exactly the expressions users reach
 * for. `jq` stays an optional external dependency, needed only when a filter is given.
 */
export class Jq {
    /**
     * Runs `jq -c "select(<expression>)"` over `jsonl`, exactly as bash pipes into it.
     * jq's stdout and stderr are this process's, and its exit code is returned unchanged
     * (a syntax error is jq's 3, an unmatched filter is still 0).
     *
     * WHY 128+signal when jq is killed: `tk query <filter> | head -1` kills jq with SIGPIPE,
     * and bash's pipeline reported 141 for exactly that. jq is a real child here too, so the
     * shell convention reproduces bash's code instead of flattening it to a generic 1. That
     * rule, and the 127 for a missing `jq`, live in `SpawnedChild`.
     */
    static select(jsonl: string, expression: string): number {
        const result = spawnSync(JQ_BINARY, [JQ_COMPACT_OUTPUT, `select(${expression})`], {
            input: jsonl,
            stdio: ["pipe", "inherit", "inherit"],
        });
        return SpawnedChild.exitCode(result, JQ_BINARY, [JQ_HINT]);
    }
}
