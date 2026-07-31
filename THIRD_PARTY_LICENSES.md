# Third Party Licenses

## npm dependencies — none are distributed

The CLI has **zero runtime npm dependencies**: `dist/ticket.mjs` is esbuild's bundle of
`src/` and the Node standard library, and no third-party code lands in it. `esbuild`,
`typescript` and `@types/node` are `devDependencies` used only to build and typecheck, and
packaged installs deliberately do not ship `node_modules/`. Nothing from them is
redistributed, so nothing from them is listed here. Add an entry here the moment a real
runtime dependency is introduced.

## wedow/ticket
**Source:** https://github.com/wedow/ticket
**License:** MIT  

Portions of note-ticket are based on or derived from wedow/ticket.

---

MIT License

Copyright (c) 2025

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
