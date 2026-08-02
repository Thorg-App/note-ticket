---
id: nid_b6ghefgxv6rco0mxjesa5qkdi_e
title: "adjust the installation to just intall ticket"
status: open
deps: []
links: []
created_iso: 2026-08-02T17:12:59Z
status_updated_iso: 2026-08-02T17:12:59Z
type: task
priority: 3
assignee: nickolaykondratyev
---

From previous agent run:
"Called out — a packaging change I made deliberately: the docs now say ticket, but npm/Homebrew/AUR only ever installed tk, which would have made the docs false. So the CLI is now installed under both names (npm bin, the formula, the PKGBUILD); tk keeps working and no existing user breaks. scripts/package-smoke.sh drives both symlinks and checks each reports its own name in usage."

I am thinking that if we are doing any installs we should just install `ticket` NOT tk. 