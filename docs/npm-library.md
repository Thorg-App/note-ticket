# `note-ticket` — using it as an npm library

The package ships a typed library API alongside the CLI, so a Node/TypeScript tool can manage
tickets programmatically instead of shelling out. The implementation reuses the exact code the
CLI runs, so both write **byte-identical files** — a repo can be driven by both at once.

```bash
npm install note-ticket
```

```typescript
import { FileTicketManager, TicketNotFoundError } from "note-ticket";

// `<git-repo-root>/_tickets` from cwd.
const manager = FileTicketManager.forRepository();

const ticket = manager.create({ title: "My ticket", tags: "backend,api" });
manager.setStatus(ticket.id, "in_progress");
manager.addNote(ticket.id, "progress so far …");
manager.get("partial-id");   // throws TicketNotFoundError / AmbiguousTicketIdError
manager.list();              // every ticket, in the order `ticket ls` lists them
```

Everything below is exported from the package root (`note-ticket`); the CLI internals
deliberately are not. Every exported symbol carries a doc comment that your editor will show
on hover — this page is the map, the types themselves are the reference.

Installing the package also puts the `ticket` CLI on your bin path. Its usage is documented in
[cli.md](cli.md).

---

## The key interfaces

| Symbol | What it is |
|---|---|
| **`TicketManager`** | The contract to depend on: list / get / create / setStatus / addNote / save. |
| **`FileTicketManager`** | The file-backed implementation of `TicketManager`. |
| **`Ticket`** | One ticket file in memory. Immutable — `with…` returns a new one. |
| **`NewTicketInput`** | What `create` takes (`Partial<CreateOptions>`). |
| **`TicketStatus`** | `"open" \| "in_progress" \| "closed" \| "punted"` — the statuses this tool WRITES. |
| **`TicketField`** | The on-disk frontmatter key names, in one place. |
| **`TicketNotFoundError` / `AmbiguousTicketIdError`** | Id resolution failures. |
| **`CorruptTicketFileError` / `FileSystemError`** | A `.md` file that is not a ticket / an OS-level failure. |
| **`DepGraph`** | Dependency graph over a set of tickets: ready, blocked, cycles, tree. |
| **`TicketRelation`** | The add/remove rules for the `deps` and `links` id arrays. |

Lower-level pieces (`TicketStore`, `TicketsDirectory`, `IdResolver`, `TicketId`, `Frontmatter`,
`TicketDocument`, `Clock`) are exported too, and are covered at the end.

---

## Getting a manager

```typescript
FileTicketManager.forRepository(cwd?, options?)   // <git-repo-root>/_tickets
FileTicketManager.forDirectory(ticketsDir, options?)  // an explicit directory
```

`forRepository` throws a plain `Error` when `cwd` is not inside a git repository —
`forDirectory` is the way to point the library somewhere else. Neither factory requires the directory to exist yet — `create` makes it.
`manager.ticketsDir` reports the directory in use.

`options` is a `FileTicketManagerOptions`, and exists so a test can hold the non-deterministic
inputs still. Every omitted field is the real thing:

| Field | Default |
|---|---|
| `clock?: Clock` | `SystemClock` — the source of `created_iso` / `status_updated_iso` / `closed_iso`. |
| `newTicketId?: () => string` | `TicketId.generate()`. |
| `defaultAssignee?: () => string` | `git config user.name`, or `""` (which omits the line). |

```typescript
import { FileTicketManager, FixedClock } from "note-ticket";

const manager = FileTicketManager.forDirectory(tmpDir, {
    clock: new FixedClock("2026-01-01T00:00:00Z"),
    newTicketId: () => "nid_test_e",
});
```

## `TicketManager`

| Method | Returns | Notes |
|---|---|---|
| `ticketsDir` | `string` | The directory this manager operates on. |
| `list()` | `readonly Ticket[]` | Every ticket, byte-wise path order — the order `ticket ls` / `query` use. |
| `get(id)` | `Ticket` | Partial ids allowed; see **Id resolution**. |
| `create(input)` | `Ticket` | Writes a new file at the TOP level of the tickets dir. |
| `setStatus(id, status)` | `Ticket` | Restamps `status_updated_iso`, and `closed_iso` (which exists exactly while the ticket is closed). |
| `addNote(id, note)` | `void` | APPENDS a timestamped note under `## Notes`; touches nothing else. |
| `save(ticket)` | `void` | Persists a ticket you edited through the `with…` accessors. |

`FileTicketManager` implements it. Depend on `TicketManager` in your own signatures so a test
double is substitutable.

### Id resolution

Every `id` parameter accepts a **partial** id, with the CLI's rules: an exact match wins,
otherwise the id must contain the text as a substring; more than one match at the winning tier
is an error, and surrounding whitespace is trimmed. An empty string matches nothing.

```typescript
try {
    manager.get(userInput);
} catch (error) {
    if (error instanceof AmbiguousTicketIdError) {
        console.error(`did you mean one of ${error.matchingIds.join(", ")}?`);
    } else if (error instanceof TicketNotFoundError) {
        console.error(`no ticket matches '${error.search}'`);
    }
}
```

### Creating

`NewTicketInput` is `Partial<CreateOptions>` — every field is optional and every omitted one
takes the same default the CLI's `create` uses. **Values are written RAW**, exactly as the CLI
writes its flags: nothing is validated or normalized.

| Field | Default | Notes |
|---|---|---|
| `title` | `"Untitled"` | Also decides the filename (a slug of it, with a numeric suffix on collision). |
| `description` | `""` | Markdown body. Omitted from the file when empty. |
| `design` | `""` | Body section under `## Design`. |
| `acceptance` | `""` | Body section under `## Acceptance Criteria`. |
| `type` | `"task"` | Not validated — `bug`/`feature`/`task`/`epic`/`chore` by convention. |
| `priority` | `"2"` | A STRING, 0 highest … 4 lowest. Not validated. |
| `assignee` | `git config user.name` | `""` omits the line entirely. |
| `externalRef` | `""` | Written as the hyphenated `external-ref:` key. |
| `parent` | `""` | May be a PARTIAL id; the full id is stored. Resolved BEFORE anything is written, so an unresolvable parent creates no file. |
| `tags` | `""` | Comma-separated, exactly as typed: `"a,b"` → `tags: [a, b]`. |

```typescript
const ticket = manager.create({
    title: "Rework the importer",
    description: "Full context for whoever picks this up …",
    type: "feature",
    priority: "1",
    tags: "backend,importer",
    parent: someEpic.id,
});
console.log(ticket.id, ticket.path);
```

### Status

```typescript
import { TICKET_STATUS_CLOSED, VALID_TICKET_STATUSES } from "note-ticket";

manager.setStatus(id, TICKET_STATUS_CLOSED);   // or the literal "closed"
```

`TicketStatus` is the compile-time union of the three statuses this tool writes, so a typo is a
type error. It deliberately does NOT describe what is on disk: frontmatter is hand-editable, so
`Ticket.status` is plain `string` (it may hold the legacy `done`, or a typo). `VALID_TICKET_STATUSES`
is the runtime list, for validating text you got from a user.

## `Ticket`

Immutable. Every `with…` method returns a NEW `Ticket` and changes nothing on disk; persist with
`manager.save(...)`.

**Reads** (interpreted values — quotes stripped, arrays split):

| Accessor | Type | Notes |
|---|---|---|
| `path` | `string` | The file this ticket was read from, and the file `save` writes back to. |
| `id` | `string` | The stable identity. |
| `title` | `string` | Quotes stripped. |
| `status` | `string` | Raw text; NOT narrowed to `TicketStatus` — see above. |
| `isClosed` / `isFinished` | `boolean` | `closed` / `closed`-or-legacy-`done`. Dependencies block until `isClosed`. |
| `deps` / `links` / `tags` | `readonly string[]` | File order. `deps` is NOT deduplicated — a hand-edited file may repeat an id. |
| `priority` | `string` | Defaults to `"2"` when the field is absent. |
| `assignee` / `parent` | `string` | `""` when absent. |
| `body` | `string` | Markdown after the closing `---`. |
| `frontmatter` | `Frontmatter` | The whole block, for fields with no named accessor. |
| `toJsonRecord()` / `toJsonText()` | record / string | Exactly what `ticket query` emits per ticket (fields in file order, then `full_path`). |

**Writes** — the escape hatch for field-level edits the `TicketManager` interface has no
dedicated method for. They take **RAW** frontmatter text (what goes after `key: `), so a value
that needs quoting or brackets must arrive that way; `withArrayField` does the bracketing for you.
Use `TicketField` for the key rather than spelling it out.

```typescript
import { TicketField } from "note-ticket";

const retagged = manager.get(id)
    .withArrayField(TicketField.TAGS, ["backend", "urgent"])   // tags: [backend, urgent]
    .withField(TicketField.PRIORITY, "0")
    .withoutField(TicketField.EXTERNAL_REF);
manager.save(retagged);
```

A key that is NEW to the file is inserted FIRST in the block (this matches what the CLI's
`sed`-era behavior did, and `query`'s JSON key order depends on it). An existing key keeps its
position.

### `deps` and `links`

`TicketRelation` holds the rules both fields share, so you do not reimplement them:

```typescript
import { TicketRelation } from "note-ticket";

const ticket = manager.get(id);
const blocked = TicketRelation.DEPENDENCY.withAdded(ticket, otherId);  // undefined if already there
if (blocked !== undefined) {
    manager.save(blocked);
}

const { ticket: linked, addedCount } = TicketRelation.LINK.withAllAdded(ticket, [a, b]);
TicketRelation.DEPENDENCY.withRemoved(ticket, otherId);   // undefined if it was not there
TicketRelation.LINK.idsOf(ticket);                        // readonly string[]
```

Membership and removal are exact ARRAY-ELEMENT matches, so an id that merely occurs as a
substring of a sibling id is never touched. `links` are symmetric by convention — the CLI writes
both sides; if you use `TicketRelation.LINK` directly, so must you.

## `DepGraph`

Build one over any set of tickets and ask graph questions. Ids that no ticket carries are
treated as **not closed**, so a dangling dependency keeps blocking.

```typescript
import { DepGraph } from "note-ticket";

const graph = DepGraph.build(manager.list());

graph.ready();                  // readonly Ticket[]      open/in_progress, every dep closed
graph.blocked();                // readonly BlockedTicket[]  { ticket, blockerIds }
graph.blockerIdsOf(id);         // readonly string[]      deps that are not closed
graph.activeDependents(id);     // readonly Ticket[]      what closing `id` would unblock
graph.children(id);             // readonly Ticket[]      tickets whose `parent` is `id`
graph.excludingClosed().cycles();  // readonly DepCycle[]  { pathIds, memberIds }
graph.tree(rootId, { full: false });  // readonly TreeRow[]  { id, depth, prefix, connector }
```

`ready`/`blocked` are ordered by priority then id, as the CLI lists them. `tree` returns rows,
not text: render one line as `prefix + connector + <whatever you want to show>`. With
`full: false` each ticket appears once, at its deepest position; `full: true` draws every path.
`tree` returns an empty list for an unknown root.

## Errors

| Error | Thrown when | Carries |
|---|---|---|
| `TicketNotFoundError` | No id matched. | `search` |
| `AmbiguousTicketIdError` | Several matched at the winning tier. | `search`, `matchingIds` |
| `MissingTicketIdError` | A `.md` file parsed but has no `id`. | `path` |
| `MissingFrontmatterBlockError` | A `.md` file has no readable frontmatter block (CRLF files land here, and the message says so). | `path` |
| `FileSystemError` | The OS refused a read/write/list (EACCES, EROFS, ENOSPC, …). | `path`, `code` |

`MissingTicketIdError` and `MissingFrontmatterBlockError` share the abstract base
`CorruptTicketFileError` — catch that to handle "this repo has a broken ticket file" as one case.
They are thrown by anything that READS tickets, `list()` included: every `.md` file under the
tickets directory is expected to be a ticket, so one that is not is a corrupt repo rather than a
file to skip silently.

`FileSystemError` names the path the USER knows (the ticket, not the scratch file writes go
through). A failure with no errno is rethrown untouched, so a defect keeps its stack trace.

## Lower-level exports

Reach for these when `TicketManager` is not enough:

| Symbol | Use |
|---|---|
| `TicketsDirectory.resolve(env?, cwd?)` | The CLI's directory resolution as data: `{ kind: "resolved", path }` or `{ kind: "no-git-repo" }`. |
| `TicketStore` | Discovery/load/save over one directory: `collectFiles`, `load`, `loadAll`, `loadRecent`, `save`, `appendTo`. `collectFiles` is the single source of truth for "what is a ticket file". |
| `IdResolver` / `IdCandidate` / `IdResolution` | Id resolution as DATA (`resolved` / `not-found` / `ambiguous`) instead of thrown errors — useful for building your own message. |
| `TicketId.generate()` | A fresh `nid_<25 chars of [a-z0-9]>_e`. |
| `Frontmatter`, `FrontmatterValue`, `TicketDocument`, `FrontmatterEntry`, `FrontmatterJsonValue` | The frontmatter layer `Ticket.frontmatter` / `Ticket.document` hand back. Values are RAW; `FrontmatterValue` interprets them. |
| `Clock`, `SystemClock`, `FixedClock` | The timestamp source, injectable through `FileTicketManagerOptions`. |

## Guarantees and gotchas

- **Byte-identical to the CLI.** Same core code, same file layout, same key order.
- **Raw values.** `priority`, `type` and `tags` are not validated or normalized — what you pass
  is what lands in the file.
- **Writes are atomic per file** (write-then-rename), but there is **no cross-file locking**:
  last write wins, exactly as with the CLI. `addNote` appends in place instead, so a symlinked
  ticket file stays a symlink.
- **LF only.** CRLF ticket files are unsupported and fail to load; see the error table.
- **Ordering is contractual.** `list()` is byte-wise path order.
- **New tickets always land at the top level** of the tickets directory. Move files afterwards
  if you want subfolders — identity is the `id`, not the path.
