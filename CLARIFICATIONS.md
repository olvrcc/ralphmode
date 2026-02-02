# Clarifications

Questions needing your input before implementation. Add your answers below each question.

---

## Q1: Dependent PR Target Branch

When US-043 depends on US-042 and branches from `ralph/US-042-*`, where should US-043's PR target?

**Options:**

- **A) Target main** (Recommended) - Simpler. PR shows full diff. Merge after US-042 merges.
- **B) Target US-042's branch** - Stacked PRs. Requires rebase after US-042 merges.
- **C) Other**

**Your answer:**
B - I merge or squash merge and if I delete the underlying branch on merge, github automatically changes the base branch to main. By doing it this way it maintains a clean lineage of dependant branches.

---

## Q2: PR Review Gate

Should ralph wait for PR approval/merge before starting the next story?

**Options:**

- **A) No, continue** (Recommended) - Ralph keeps working. Creates branches from previous work. Human reviews/merges async.
- **B) Yes, wait** - Ralph pauses after each PR until merged. Slower but safer.
- **C) Configurable** - Add `git.waitForMerge: true|false` to config.

**Your answer:**
A & C - (configurable) but defaults to continue.

---

## Q3: Merge Conflict Handling

When a dependent branch has conflicts with main (because main moved), what should ralph do?

**Options:**

- **A) Skip and continue** - Mark story blocked, move to next independent story
- **B) Attempt rebase** - Try `git rebase main`, fail gracefully if conflicts
- **C) Stop and alert** (Recommended) - Output warning, human intervention needed
- **D) Other**

**Your answer:**
do its best to fix the conflicts with the context of the changes. If it's not possible, do A.

---

## Q4: Story ID Format

Current format is `US-XXX` (e.g., US-001). When importing GitHub issue #42, should the ID be:

**Options:**

- **A) US-042** - Zero-padded to 3 digits, matches current convention
- **B) US-42** - Match GitHub issue number exactly (no padding)
- **C) GH-42** - Different prefix for GitHub-sourced stories
- **D) Keep original** - Just use `42` as the ID

**Your answer:**
Why US? It should request it and save the slug to the ralph settings -we should actually just store it somewhere in the project - but for now, let's keep it in the ralph config as it could be jira tickets or just random ones - so setting the slug prefix ourselves is good- also the PRD json schema should keep a ticket ID field.

---

## Q5: Branch Naming

What branch naming convention for stories?

**Options:**

- **A) `ralph/US-042-slug`** (Recommended) - Prefix + ID + slugified title
- **B) `ralph/42-slug`** - Prefix + issue number + slug
- **C) `feature/US-042-slug`** - Standard feature prefix
- **D) Configurable** - Let user set pattern in config

**Your answer:** we should store the branch as <ticketID>-<kebab-case-short-story-description> - we don't need the prefix- but we can add it as a ralph config. I have a cli called xgit, that does all the branching for us typically - so we should use that as well if available because it puts the rules around branching outside of ralph which really is where it should be, tbh. but as a fallback we can use a slim approach

---

## Q6: Default Ticket Prefix (Follow-up to Q4)

If user doesn't specify a prefix during init, what should we default to?

**Options:**
- **A) Ask during init** - Prompt: "Ticket prefix (e.g., PROJ, US, GH):"
- **B) Default to repo name** - e.g., `ralphmode` → `RM-001`
- **C) No prefix** - Just use numbers: `001`, `002`

**Your answer:**

---

## Q7: xgit Integration (Follow-up to Q5)

What's the `xgit` command interface for creating branches? I need to know:
1. Command signature (e.g., `xgit branch <name>` or `xgit checkout -b <name>`)
2. Does it handle the ticket ID / slug formatting, or does ralph pass the full branch name?

**Your answer:**

---

_Once all questions are answered, I'll clear this doc and proceed with implementation._
