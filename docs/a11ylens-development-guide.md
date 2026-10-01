# A11yLens Development Guide

This guide describes how AI coding agents should work when extending
`jupyterlab-a11y-checker` for A11yLens.

Before substantial A11yLens changes, read:

1. the repository root `AGENTS.md`
2. `docs/a11ylens-project-brief.md`
3. this document

---

## 1. Repository First

The existing repository is the source of truth for:

- package structure,
- naming,
- existing abstractions,
- current behavior,
- public APIs,
- tests.

The project brief describes requirements, not necessarily literal classes or
modules that must exist.

Before creating a new abstraction:

1. search for an existing equivalent,
2. inspect how similar functionality is currently implemented,
3. prefer extending existing code when appropriate.

Do not create a parallel architecture simply because the project brief uses a
different conceptual name.

---

## 2. Preserve Existing Behavior

A11yLens extends the existing accessibility checker.

Do not unnecessarily replace or rewrite existing:

- deterministic accessibility checks,
- notebook parsing,
- finding representations,
- CLI behavior,
- JupyterLab UI behavior.

Structural checking should continue functioning independently of external model
services.

Avoid regressions to existing CLI, core, and extension behavior.

---

## 3. Keep Responsibilities Separate

Maintain reasonable separation between:

- notebook processing,
- deterministic accessibility checking,
- model-assisted candidate handling,
- context selection,
- model/provider communication,
- semantic analysis/remediation,
- validation,
- UI,
- evaluation/logging.

Provider-specific API code should not be placed inside notebook parsing or
context-selection logic.

Context-selection logic should not directly control UI behavior.

UI code should not contain semantic-analysis logic that belongs in shared/core
functionality.

Follow existing package boundaries whenever practical.

---

## 4. Work Incrementally

Do not implement the entire proposal in one change.

Prefer small vertical slices.

For example:

```text
existing image candidate
-> minimal context
-> model request
-> structured result
-> safe display/logging
```

before adding:

```text
structure-aware context
-> validation
-> advanced UI
-> evaluation
```

Avoid speculative infrastructure for optional future features.

---

## 5. Before Editing

For a substantial task, first:

1. inspect relevant code,
2. identify current behavior,
3. identify relevant tests,
4. list the files likely to change,
5. propose a short implementation plan.

If the repository architecture conflicts with the project brief:

- explain the conflict,
- recommend the smallest reasonable adaptation,
- do not silently redesign the repository.

For large architectural changes, wait for review before implementing when possible.

---

## 6. During Implementation

Prefer:

- small interfaces,
- explicit typed data,
- provider-neutral internal representations,
- reuse of existing repository types,
- testable functions,
- predictable error handling.

Preserve notebook-location information across the workflow.

Do not automatically execute or apply model-generated content.

Do not expose credentials in:

- notebook files,
- logs,
- source control,
- test fixtures.

Avoid sending unrelated notebook content to external model services.

---

## 7. Model Output

Treat model output as untrusted application input.

Where practical:

- require structured responses,
- parse responses explicitly,
- validate expected fields and types,
- handle malformed output safely,
- preserve error information for debugging.

A failed model request must not prevent deterministic accessibility results from
being available.

---

## 8. Testing

After modifying behavior:

1. run the most relevant existing tests,
2. add or update tests for new behavior,
3. check existing core behavior for regressions,
4. run broader tests when package boundaries are affected.

For context-selection behavior, prefer deterministic unit tests.

For external model communication, use mocks or fixtures where practical rather
than requiring live API access for normal test execution.

---

## 9. Scope Control

Required priority:

1. image alternative-text workflow
2. context selection
3. semantic analysis/remediation
4. validation
5. JupyterLab integration
6. evaluation support

Do not prioritize:

- link-description work,
- table-caption work,
- embeddings,
- agent frameworks,
- dependency graphs,
- multiple model providers,

until the required image workflow works end to end.

Supporting one provider cleanly is preferable to partially supporting several
providers early in development.

---

## 10. After Editing

Report:

### Changed

- files changed
- major behavior added or modified

### Tests

- commands run
- pass/fail result

### Decisions

- important architectural choices

### Remaining Issues

- unresolved questions
- assumptions
- known limitations

Do not describe work as complete if relevant tests are failing.

---

## 11. Documentation

Update documentation when an implementation decision becomes stable.

Use:

- `docs/a11ylens-project-brief.md`
  - project requirements

- `docs/architecture.md`
  - actual implemented architecture

- root `AGENTS.md`
  - repository-wide agent guidance

Do not continually expand the root `AGENTS.md` with detailed A11yLens design
information.
