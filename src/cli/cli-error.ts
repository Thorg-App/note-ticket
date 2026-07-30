/**
 * An error whose message is meant for the user.
 *
 * The dispatcher prints it as `Error: <message>` on stderr and exits non-zero, the way
 * every bash error line is shaped. Anything NOT of this type is a bug and is allowed to
 * crash with a stack trace rather than being dressed up as a user-facing message.
 */
export class CliError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "CliError";
    }
}
