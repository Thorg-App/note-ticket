import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ProgramName } from "../src/cli/program-name.js";

/**
 * WHY these are unit tests and not BDD scenarios: the behave suite always invokes the
 * script as `./ticket`, whose basename IS `ticket`, so hardcoding the name would keep every
 * scenario green. The env var is the only observable input, and it is injectable here.
 */
describe("ProgramName", () => {
    it("uses the basename of the name bash was invoked as", () => {
        assert.equal(ProgramName.invoked({ TICKET_INVOKED_AS: "/usr/local/bin/tk" }, []), "tk");
    });

    it("falls back to the running script when bash did not pass its name", () => {
        assert.equal(ProgramName.invoked({}, ["node", "/opt/ticket/dist/ticket.mjs"]), "ticket.mjs");
    });

    it("ignores an EMPTY invoked-as, which would otherwise print a blank command name", () => {
        assert.equal(ProgramName.invoked({ TICKET_INVOKED_AS: "" }, ["node", "/opt/tk"]), "tk");
    });

    it("falls back to `ticket` when nothing at all names the program", () => {
        assert.equal(ProgramName.invoked({}, []), "ticket");
    });
});
