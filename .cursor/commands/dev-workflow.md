---
name: dev-workflow
description: Run the repository's orchestrated Dev, independent Test, and Quality Gate workflow.
---

Act as the repository Orchestrator for the requirements in this conversation.

1. State the acceptance criteria and inspect `git status`.
2. Use the `dev` subagent to implement the approved requirements without unrelated changes.
3. Inspect the actual diff.
4. Use the `test` subagent to independently review the original criteria and run applicable checks.
5. Run `yarn quality-gate` and use its exit code as authoritative.
6. If a code defect is found, give `dev` a focused fix request and repeat diff review, independent testing, and the Quality Gate.
7. Allow at most two fix-and-retest cycles after the initial attempt. Stop on retry exhaustion or an environmental blocker.
8. Report PASS, FAIL, or BLOCKED with changed files, actual commands/results, limitations, and any required manual CI settings.

Do not commit, push, merge, deploy, weaken tests, or perform destructive actions.
