# AI development workflow

This repository uses Cursor project agents and a repository Quality Gate to
separate implementation from verification.

## Roles

- `orchestrator`: owns the workflow, acceptance criteria, delegation, diff
  review, retry limit, and final status.
- `dev`: implements only approved requirements, preserves existing user work,
  and reports commands it actually ran.
- `test`: independently reviews the original acceptance criteria and diff,
  runs checks, and returns `PASS`, `FAIL`, or `BLOCKED`. It is read-only and
  must not modify production code.

Definitions are in `.cursor/agents/`. The always-on safety and verification
rules are in `.cursor/rules/workflow.mdc`.

## Invocation

Use the reusable Cursor command:

```text
/dev-workflow
```

Include the requirement and acceptance criteria in the request. The command
instructs Cursor to use the `dev` and `test` project agents through native
subagent delegation. The `orchestrator` agent can also be invoked directly
when a longer workflow needs to be coordinated.

The workflow is:

```text
requirements
  -> acceptance criteria
  -> dev implementation
  -> actual diff inspection
  -> independent test review
  -> Quality Gate
  -> focused fix and retest, if needed
  -> final report
```

The initial attempt may be followed by at most two fix-and-retest cycles.
Each cycle repeats diff inspection, independent testing, and the Quality Gate.
The workflow stops on retry exhaustion or an environmental blocker.

## Quality Gate

Run from the repository root:

```powershell
yarn quality-gate
```

The command runs checks sequentially and stops at the first non-zero result:

1. `yarn renderer:build` — Next.js renderer compilation and TypeScript check.
2. `yarn electron:build` — Electron/source TypeScript compilation.

There are currently no `lint`, unit-test, or integration-test scripts in
`package.json`, so those checks are reported as unavailable rather than
silently treated as passing. Add real scripts and dependencies before marking
those checks required.

## CI

`.github/workflows/quality-gate.yml` runs on pushes and pull requests targeting
`master` or `main`. It uses Node 20, Yarn's frozen lockfile install, and the
same `yarn quality-gate` command used locally. It does not require API keys or
runtime services for the checks currently available.

The workflow does not enable branch protection or required status checks.
Repository administrators must configure those settings in GitHub and mark the
`Quality Gate` check as required if enforcement is desired.

## Safety and enforcement boundaries

Agents must preserve user changes and must not automatically commit, push,
merge, deploy, or run destructive Git commands. A written agent claim is not
evidence that a command passed; the orchestrator uses actual exit codes and
output.

Cursor agent instructions coordinate behavior inside Cursor. They are not a
security boundary and cannot enforce policy against a user or an external
automation. GitHub branch protection is the enforcement mechanism for CI
status requirements.

## Limitations

- No automated lint, unit, or integration test suite exists yet.
- The Quality Gate validates compilation/build health, not runtime behavior,
  browser capture, Vbee access, CapCut availability, or external API calls.
- The CI runner does not install Playwright browsers or run the Windows
  packaging flow; those remain local/manual checks.
