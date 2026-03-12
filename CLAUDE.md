# Project Rules

## Record Learnings

When the user reports a bug, makes a correction, points out a mistake, or identifies an issue with generated code or documentation, you MUST append a new learning entry to `learnings.md` in the project root.

### When to Record

Record a learning ONLY when the issue is discovered during **connector code generation or modification** — i.e., when a prompt is used to build, update, or fix actual connector code. Examples:
- Generated code has a bug or anti-pattern the user catches
- A build or test fails due to a pattern that should have been avoided
- User corrects generated connector code or points out a code-level error
- User references another codebase as the "correct" way to generate code

### When NOT to Record

Do NOT record learnings when:
- The user is updating skills, rules, or knowledge base files directly
- The user asks to add/change guidance in `docs/rules/`, `docs/knowledge-base/`, or `skills/`
- The correction is about the skills/rules infrastructure itself, not about generated connector code

### How to Record

Append a new entry to `learnings.md` using this format:

```
---

## LNNN — Short title describing the issue

**Date:** YYYY-MM-DD
**Source:** Brief context of how this was discovered
**Problem:** What went wrong and why
**Fix:** What the correct approach is
```

Increment the learning number (L001, L002, ...) based on the last entry in the file.

### Record Learnings — Rules

- ONLY update `learnings.md` — do NOT modify rules, skills, or knowledge base files as part of this automatic recording
- Record the learning AFTER fixing the actual issue (fix first, record second)
- Keep entries concise: 2-3 sentences each for Problem and Fix
- Always read `learnings.md` before generating new connector code to avoid repeating past mistakes

---

## Keep README.md in Sync

After making changes to any of the following, you MUST update `README.md` to reflect the change:

### Tracked Locations

| Change Area | Files | README Sections to Update |
|---|---|---|
| **Knowledge Base** | `docs/knowledge-base/*.md` | "Knowledge Base & Documentation" table, folder structure count (`11 reference documents`), sub-agent diagram count (`11 .md files`) |
| **Rules** | `docs/rules/connector-*.md` | "Mandatory Coding Rules" table, rule count references (`13 .md files`) |
| **Skills** | `skills/*/SKILL.md` | "Step-by-Step Build Instructions" tables (orchestrator / pipeline / utility), folder structure count (`20 specialized AI skills`), `tessl.json` count |
| **Commands** | `.claude/commands/*.md` | "Claude Commands" table |
| **Root Config** | `tessl.json`, `learnings.md`, `TECHNICAL_DESIGN_DOC.md` | "Root Config Files" table |
| **Doc Index** | `docs/index.md` | Keep in sync with KB table changes |

### What to Update

1. **Add/remove table rows** — when a file is added or deleted, add or remove the corresponding row in the relevant README table
2. **Update counts** — when files are added or removed, update all numeric counts (e.g., "11 reference documents" → "12 reference documents")
3. **Update descriptions** — if a file's purpose changes significantly, update its description in the README table
4. **Pipeline steps** — if a skill is added to or removed from the build pipeline, update the "16-Step Build Pipeline" section and renumber steps

### Keep README in Sync — Rules

- Update README AFTER the primary change is complete (change first, README second)
- Only touch the sections relevant to the change — do not rewrite unrelated parts
- Keep table descriptions concise (one sentence)
- When updating counts, search for ALL occurrences in README (folder structure, diagrams, tables) using grep before editing

---

## AskQuestion Tool — Free-Text Input Options

When using the AskQuestion tool with an option where the user needs to type in their own value (free-text input):

- Use the label `Type in your input` as the placeholder — never leave it blank or use vague labels like `Other...`.
- Provide exactly **one** such option per question. Do not add redundant helper options like "Type your value in the text field" or "(ignore these options)".

A clear placeholder helps the user understand they need to type something, rather than leaving them guessing at an empty field.
