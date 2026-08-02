# note-ticket

A git-backed ticket tracker whose tickets are plain markdown files with YAML frontmatter,
stored at `<git-repo-root>/_tickets`. It ships two surfaces:

- **[`ticket` — the CLI](docs/cli.md)** — create, list, query and graph tickets from a shell.
- **[`note-ticket` — the npm library](docs/npm-library.md)** — the same operations as a typed
  `TicketManager` API, for tools that would otherwise shell out.

Both write byte-identical files, so a repo can be driven by either or both.

```bash
ticket create "Rework the importer" --tags backend
ticket ls
ticket query 'select(.status == "open")'
```

```typescript
import { FileTicketManager } from "note-ticket";

const manager = FileTicketManager.forRepository();
const ticket = manager.create({ title: "Rework the importer", tags: "backend" });
manager.setStatus(ticket.id, "in_progress");
```

## Install

```bash
# Homebrew (macOS/Linux)
brew tap wedow/tools && brew install ticket-core

# Arch Linux (AUR)
yay -S ticket-core

# npm — the library, and the CLI on your bin path
npm install note-ticket

# From a git checkout (auto-rebuilds on git pull)
git clone <repo> && cd note-ticket && ln -s "$PWD/ticket" ~/.local/bin/ticket
```

The CLI needs **node** and **git** at runtime (plus a POSIX shell for the launcher); **jq** only
for `ticket query <jq-filter>`. Details, and what needs npm when, are in
[docs/cli.md](docs/cli.md#requirements).

## Documentation

| Document | Contents |
|---|---|
| [docs/cli.md](docs/cli.md) | Full CLI reference: commands, ids, dependency graph, errors, scripting. |
| [docs/npm-library.md](docs/npm-library.md) | Library API: `TicketManager`, `Ticket`, `DepGraph`, the error types, and the guarantees. |
| [CHANGELOG.md](CHANGELOG.md) | Release history. |
| [ORIGINAL_README.md](ORIGINAL_README.md) | The upstream project's README, kept for provenance. |

## License

[Thorg Core License, Version 1.0](LICENSE.md) (ThorgCL-1.0). Portions derived from
[wedow/ticket](https://github.com/wedow/ticket) under MIT — see
[THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
