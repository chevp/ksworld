# ksworld

**ksworld exposes [worldctl](https://github.com/chevp/worldctl)'s web-safe capabilities as a
standalone GitHub Action.**

worldctl is the CLI/agent-facing entry point into world-control's Semantic Core over a `labs/**`
tree: it indexes, queries, validates, and proposes/applies mutations to that tree. Some of its
commands do that entirely in Node — reading files, building an in-memory projection, writing JSON
— and some of them shell out to native Windows tools (`eon.exe`, `nexo.exe`) or spawn `claude -p`
to actually *execute* a workflow/agent. A GitHub Actions runner can't do the second kind. ksworld
is the first kind only, vendored into its own package so it runs anywhere Node 20 does.

```yaml
- uses: chevp/ksworld@v1
  with:
    root: labs
    args: |
      status
      --all
```

## What's in, what's out

| In (this repo) | Out (stays in worldctl) |
| --- | --- |
| `query` — `inspect`, `search`, `diagnose` | `chat`, `run`, `new` — spawn `claude -p` / `nexo.exe run` |
| `content` — `list`/`inspect`/`find`/`analyze`/`migrate --plan` | `build <orderRef>` — runs `eon.exe run`/`nexo.exe run` |
| `layout` — read-only `.glayout.json` indexing | `run-capability` — runs `nexo.exe run <agent>` |
| `gamedna` — deterministic `.gflow` rule compiler (no LLM, no native process) | `validate --native` — shells out to `eon.exe validate`/`nexo.exe validate` |
| `status` / `validate` — reference-only analysis | `gworld` — needs `@kosmos/gworld` → `@pipe25d/core` |
| `propose` / `diff` / `apply` — proposal lifecycle (writes only a Proposal until `apply`) | `serve` — HTTP daemon; needs gworld/pipe25d/control-lab-runtime |
| `plan`, `resolve` — resolves an Order/`.gflow` to a plan, never executes it | |
| `learn` — records/lists Experiences from a `.gplan.json` | |

Every excluded command is excluded because it needs something a public Actions runner doesn't
have: a native Windows binary, a `claude` login, or a private sibling package
(`@kosmos/gworld`, `@pipe25d/core`, `control-lab-runtime`) that isn't published anywhere. Nothing
here is disabled by a flag — the code for those commands simply isn't in this package, so there is
no `--unsafe` escape hatch to accidentally trip over in CI.

`ksworld validate` therefore reports fewer things than `worldctl validate`: unresolved references,
missing capability providers, Action/Lua-sidecar problems — never "is this `.eon`/`.agent`
document structurally well-formed", since that check only exists as a native `eon.exe`/`nexo.exe`
call in worldctl proper.

## Usage

```yaml
name: world-control
on: [pull_request]

jobs:
  status:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: chevp/ksworld@v1
        with:
          root: labs
          args: |
            validate
            --all
```

`args` is one argv token per line — not shell-split — so a search term or ref containing spaces
still arrives as one token:

```yaml
      - uses: chevp/ksworld@v1
        with:
          root: labs
          args: |
            search
            technique
            oak wood floor
```

### Local use

```bash
npm install
npm run build
node bin/ksworld --root labs status --all
node bin/ksworld --root labs query search technique wood
node bin/ksworld --root labs propose link agent:foo requires technique:bar
node bin/ksworld --root labs diff <proposalId>
node bin/ksworld --root labs apply <proposalId>
```

`--root` has no built-in default pointing at a private network share (worldctl's own default
does) — pass it explicitly, or set `KSWORLD_LABS_ROOT`.

`--state-dir` (default `.kosmos/worldctl`) deliberately matches worldctl's own default: both tools
read/write the same per-Lab sidecar and proposal store on a shared `labs/**` checkout, so a
proposal ksworld creates in CI is the same proposal a human running worldctl locally can `apply`.

## Provenance

Vendored from `tools/worldctl`'s own `src/` (2026-09-11): same `model`/`persistence`/`graph`/
`resolve`/`mutate`/`validate`/`read` layers, same Ref/Proposal/Projection design — see
`software-architecture-description.md` in that repo for the full design. Not auto-synced; a
worldctl change lands here only when someone ports it.

## License

[MIT](LICENSE)
