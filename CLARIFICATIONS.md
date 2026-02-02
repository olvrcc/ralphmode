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

---

## Q2: PR Review Gate

Should ralph wait for PR approval/merge before starting the next story?

**Options:**
- **A) No, continue** (Recommended) - Ralph keeps working. Creates branches from previous work. Human reviews/merges async.
- **B) Yes, wait** - Ralph pauses after each PR until merged. Slower but safer.
- **C) Configurable** - Add `git.waitForMerge: true|false` to config.

**Your answer:**

---

## Q3: Merge Conflict Handling

When a dependent branch has conflicts with main (because main moved), what should ralph do?

**Options:**
- **A) Skip and continue** - Mark story blocked, move to next independent story
- **B) Attempt rebase** - Try `git rebase main`, fail gracefully if conflicts
- **C) Stop and alert** (Recommended) - Output warning, human intervention needed
- **D) Other**

**Your answer:**

---

## Q4: Story ID Format

Current format is `US-XXX` (e.g., US-001). When importing GitHub issue #42, should the ID be:

**Options:**
- **A) US-042** - Zero-padded to 3 digits, matches current convention
- **B) US-42** - Match GitHub issue number exactly (no padding)
- **C) GH-42** - Different prefix for GitHub-sourced stories
- **D) Keep original** - Just use `42` as the ID

**Your answer:**

---

## Q5: Branch Naming

What branch naming convention for stories?

**Options:**
- **A) `ralph/US-042-slug`** (Recommended) - Prefix + ID + slugified title
- **B) `ralph/42-slug`** - Prefix + issue number + slug
- **C) `feature/US-042-slug`** - Standard feature prefix
- **D) Configurable** - Let user set pattern in config

**Your answer:**

---

*Once all questions are answered, I'll clear this doc and proceed with implementation.*
