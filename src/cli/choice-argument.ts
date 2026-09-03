import { CliError } from "./cli-error.js";

/**
 * A command argument that must be one of a fixed set of literals (`status`, `profile`).
 *
 * The ONE place user-typed text becomes a member of such a union: past `parsed` the value
 * is typed, so no downstream signature has to re-check it. Both the usage tail
 * (`Valid statuses: …`) and the rejection (`invalid status 'x'. Must be one of: …`) name
 * the same list, so a new choice can never be accepted without being advertised.
 */
export class ChoiceArgument<T extends string> {
    constructor(
        /** The user's word for the argument, as the error names it: `status`, `profile`. */
        private readonly noun: string,
        private readonly choices: readonly T[],
    ) {}

    /** The accepted values, space-separated — bash `validate_status`'s wording. */
    get list(): string {
        return this.choices.join(" ");
    }

    /** @throws CliError naming the accepted values. */
    parsed(text: string): T {
        const choice = this.choices.find((valid) => valid === text);
        if (choice === undefined) {
            throw new CliError(`invalid ${this.noun} '${text}'. Must be one of: ${this.list}`);
        }
        return choice;
    }
}
