import { readFileSync } from "node:fs";

/** fd 0. `readFileSync` takes a descriptor, and 0 is stdin's. */
const STDIN_FILE_DESCRIPTOR = 0;
const STDIN_ENCODING = "utf8";

/**
 * The process's standard streams, as far as the commands that must know about the terminal
 * care: `add-note` reads stdin when it is not a terminal, `edit` launches an editor only when
 * both stdin and stdout are.
 *
 * WHY an interface: "is this a TTY" and "what is on stdin" are properties of how the process
 * was launched, which no test can arrange for itself — a unit test asserting the editor arm
 * needs to SAY that both streams are terminals. `Clock` exists for the same reason.
 */
export interface Terminal {
    /** bash `[ -t 0 ]`. */
    isStdinTerminal(): boolean;
    /** bash `[ -t 1 ]`. */
    isStdoutTerminal(): boolean;
    /** Everything readable on stdin, verbatim — bash `cat` with no redirection. */
    readStdin(): string;
}

export class ProcessTerminal implements Terminal {
    /**
     * WHY the explicit `=== true`: `isTTY` is `undefined` (not `false`) for a pipe or a file,
     * so a truthiness test on it reads as "not a terminal" only by accident of coercion.
     */
    isStdinTerminal(): boolean {
        return process.stdin.isTTY === true;
    }

    isStdoutTerminal(): boolean {
        return process.stdout.isTTY === true;
    }

    /**
     * WHY-NOT the stream API: bash's `note=$(cat)` reads stdin to EOF before doing anything
     * else, and every command here is synchronous, so the descriptor is read the same way.
     * Nothing is stripped or decoded beyond utf8 — the caller owns that.
     */
    readStdin(): string {
        return readFileSync(STDIN_FILE_DESCRIPTOR, STDIN_ENCODING);
    }
}
