/**
 * Thin entrypoint that renders `src/core` output in bash `./ticket`'s exact format,
 * so the parity checks can diff the two byte-for-byte. Not shipped: this is a test
 * fixture for the migration and gets deleted at T6 together with bash `ticket`.
 *
 * Only for commands the shipped CLI does NOT serve yet — once a command lands in
 * `TS_COMMANDS`, its check switches to `dist/ticket.mjs` and its mode is deleted here,
 * so the output format is never described in two places. `tree` and `cycle` went that
 * way at T4; `slug` is what is left, because `create` is still bash.
 */
import { Slug } from "../../src/core/slug.js";

const [, , mode, arg1] = process.argv;

if (mode === "slug") {
    process.stdout.write(`${Slug.fromTitle(arg1 as string)}.md\n`);
} else {
    process.stderr.write(`dump: unknown mode=[${mode}]\n`);
    process.exit(2);
}
