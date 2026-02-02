---
date: 2026-02-02T12:00:00-08:00
git_commit: f2aeb7238ef8bef9e6cb3ad7bdf5381684fa1e48
branch: main
repository: ralphmode
topic: "PRD Creation Skills and GitHub Issues Integration"
tags: [research, prd, github, skills, feature-planning]
status: complete
last_updated: 2026-02-02
---

# Research: PRD Creation Skills and GitHub Issues Integration

**Date**: 2026-02-02
**Git Commit**: f2aeb7238ef8bef9e6cb3ad7bdf5381684fa1e48
**Branch**: main
**Repository**: ralphmode

## Research Question

Plan features for ralphmode:
1. PRD creation skill with best practices
2. PRD-to-JSON task conversion
3. GitHub issues integration for story generation and status feedback

## Summary

This research documents three feature areas for ralphmode enhancement:

1. **PRD Creation**: The superpowers skill ecosystem has a strong `brainstorming` skill that already handles requirements discovery. A new `/prd` skill can extend this specifically for ralph-compatible PRD output.

2. **PRD-to-JSON Conversion**: Ralph already has `convertToPRDJson()` for basic markdown parsing. Enhancement needed: AI-powered extraction that handles varied PRD formats and produces properly structured `prd.json`.

3. **GitHub Integration**: The `gh` CLI provides comprehensive JSON export, label management, and comment APIs. A bidirectional sync between GitHub issues and ralph tasks is feasible.

---

## Detailed Findings

### 1. Current Ralphmode PRD Structure

**Location**: `bin/ralph.js` (lines 606-647 for conversion, full file is 876 lines)

**Current prd.json Schema**:
```javascript
{
  project: string,           // Project name
  branchName: string,        // Git branch for work
  description: string,       // Feature description
  userStories: [{
    id: string,              // "US-XXX" format
    title: string,
    description: string,
    acceptanceCriteria: string[],
    priority: number,
    passes: boolean,         // Completion status
    notes: string
  }]
}
```

**Current Markdown Input Format**:
```markdown
# Feature: Task Priority System

Add priority levels to tasks.

## Stories

1. Add priority field to database
   - Add priority column
   - Values: high/medium/low
```

**Conversion Logic** (`convertToPRDJson`):
- Numbered lines become story titles
- Indented bullets become acceptance criteria
- Auto-generates US-XXX IDs
- All stories start with `passes: false`

**Gap**: No interactive PRD creation wizard, just paste/file/example during init.

---

### 2. Relevant Superpowers Skills

**brainstorming** (`~/.claude/plugins/cache/claude-plugins-official/superpowers/4.1.1/skills/brainstorming/SKILL.md`):
- Turn ideas into designs through one-question-at-a-time dialogue
- Explores 2-3 approaches with trade-offs
- Outputs to `docs/plans/YYYY-MM-DD-<topic>-design.md`
- Strong YAGNI principle

**writing-plans** (`~/.claude/plugins/cache/claude-plugins-official/superpowers/4.1.1/skills/writing-plans/SKILL.md`):
- Creates implementation plans for multi-step features
- Breaks into bite-sized tasks (2-5 min each)
- TDD-first approach
- Outputs to `docs/plans/`

**subagent-driven-development**:
- Executes plans with fresh subagents per task
- Two-stage review (spec compliance + code quality)
- Works with writing-plans output

**Pattern**: brainstorming → writing-plans → execution is the natural flow.

---

### 3. PRD Best Practices (External Research)

**Essential PRD Sections**:
- Title & change history
- Overview/purpose with problem statement
- Success metrics (SMART goals)
- User personas
- Features & requirements
- Timeline/release planning

**Modern PRD Formats**:
- **One-Pager**: Lean format for small features
- **Full PRD**: Comprehensive with risks and cross-team systems
- **Living Documents**: Continuously updated

**AI-Optimized PRDs** function as "programming interfaces":
- Dependency-ordered, testable phases
- "DO NOT CHANGE" safeguards for existing functionality
- Precise enough to execute, structured enough to sequence

**Hierarchical Decomposition**:
1. Epics → high-level objectives
2. User Stories → "As a [role], I want [action] so that [goal]"
3. Sub-tasks → assignable work items

**Sources**:
- [Product School PRD Template](https://productschool.com/blog/product-strategy/product-template-requirements-document-prd)
- [How to Write PRDs for AI Coding Agents](https://medium.com/@haberlah/how-to-write-prds-for-ai-coding-agents-d60d72efb797)

---

### 4. GitHub CLI Integration Capabilities

**Reading Issues**:
```bash
# JSON export with specific fields
gh issue list --json number,title,body,labels,state,assignees

# View single issue
gh issue view 123 --json number,title,body,labels

# Search with filters
gh issue list --label "feature" --assignee "@me"
```

**Updating Issues**:
```bash
# Add/remove labels
gh issue edit 123 --add-label "status:in-progress"
gh issue edit 123 --remove-label "status:todo"

# Add comment
gh issue comment 123 --body "Started work in ralph branch"

# Close with comment
gh issue close 123 --comment "Completed in PR #456"
```

**JSON Fields Available**:
`assignees`, `author`, `body`, `closed`, `closedAt`, `comments`, `createdAt`, `id`, `labels`, `milestone`, `number`, `state`, `title`, `updatedAt`, `url`

**Transform to Ralph Format**:
```bash
gh issue list --json number,title,body,labels --jq '.[] | {
  id: "US-\(.number | tostring | ("000" + .)[-3:])",
  title: .title,
  description: .body,
  priority: (if .labels | map(.name) | contains(["priority:high"]) then 1 else 2 end),
  passes: false
}'
```

**Sources**:
- [gh issue - GitHub CLI Manual](https://cli.github.com/manual/gh_issue)
- [Scripting with GitHub CLI](https://github.blog/engineering/engineering-principles/scripting-with-github-cli/)

---

## Proposed Feature Architecture

### Feature 1: `/prd` Skill

**Purpose**: Interactive PRD creation wizard that outputs ralph-compatible `prd.json`

**Workflow**:
1. Invoke `superpowers:brainstorming` for discovery
2. Add PRD-specific prompts (success metrics, acceptance criteria format)
3. Output structured JSON matching ralph schema
4. Optionally run `ralph init` with generated PRD

**Skill Structure**:
```yaml
---
name: prd
description: Use when creating a new PRD for ralph autonomous development
---
```

**Key Additions to Brainstorming**:
- Force user stories format output
- Require acceptance criteria for each story
- Generate US-XXX IDs automatically
- Include ralph-specific fields (priority, passes)

### Feature 2: PRD-to-JSON Converter Enhancement

**Current**: Basic regex-based markdown parsing

**Proposed Enhancement**:
```javascript
// New command
ralph prd convert <file.md>

// Or during init
ralph init --prd-file ./requirements.md
```

**AI-Powered Conversion**:
- Accept various PRD formats (not just numbered lists)
- Extract user stories from prose
- Infer acceptance criteria from descriptions
- Handle priority hints in text
- Validate output schema

**Schema Validation**:
```javascript
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["project", "userStories"],
  "properties": {
    "project": { "type": "string" },
    "branchName": { "type": "string" },
    "description": { "type": "string" },
    "userStories": {
      "type": "array",
      "items": {
        "required": ["id", "title", "acceptanceCriteria"],
        "properties": {
          "id": { "type": "string", "pattern": "^US-\\d{3}$" },
          "title": { "type": "string" },
          "description": { "type": "string" },
          "acceptanceCriteria": { "type": "array", "items": { "type": "string" } },
          "priority": { "type": "number", "minimum": 1 },
          "passes": { "type": "boolean" },
          "notes": { "type": "string" }
        }
      }
    }
  }
}
```

### Feature 3: GitHub Issues Integration

**New Commands**:
```bash
ralph gh sync           # Bidirectional sync
ralph gh import 123     # Import single issue as story
ralph gh status         # Update issue with ralph progress
```

**Sync Workflow**:

```
GitHub Issue              Ralph Story
+--------------+          +--------------+
| #123         |  import  | US-123       |
| Open         | -------> | passes:false |
| label:todo   |          |              |
+--------------+          +--------------+
       |                        |
       |                        | ralph run
       |                        | completes
       |                        v
       |                 +--------------+
       |    feedback     | US-123       |
       | <-------------- | passes:true  |
       v                 +--------------+
+--------------+
| #123         |
| Closed       |
| label:done   |
| Comment:     |
| "Completed"  |
+--------------+
```

**Status Feedback Options**:
- Auto-comment on issue when story starts
- Update labels (status:todo → status:in-progress → status:done)
- Close issue when story passes
- Link to commit/PR in comment

**Implementation** (using execFile for safety):
```javascript
import { execFile } from 'child_process';

// In ralph.sh loop, after story completion:
const issue = story.githubIssue;
if (issue) {
  execFile('gh', ['issue', 'edit', String(issue),
    '--remove-label', 'status:in-progress',
    '--add-label', 'status:done']);
  execFile('gh', ['issue', 'close', String(issue),
    '--comment', `Completed by ralph in commit ${commitHash}`]);
}
```

**prd.json Extension**:
```javascript
{
  userStories: [{
    id: "US-001",
    githubIssue: 123,  // NEW: link to GitHub issue
    // ... other fields
  }]
}
```

---

## Code References

- `bin/ralph.js:606-647` - Current `convertToPRDJson()` function
- `bin/ralph.js:101-320` - `initProject()` with PRD source selection
- `bin/ralph.js:391-423` - `showStatus()` displaying story completion
- `~/.claude/plugins/cache/claude-plugins-official/superpowers/4.1.1/skills/brainstorming/SKILL.md` - Brainstorming skill template

---

## Implementation Priority

| Feature | Complexity | Value | Priority |
|---------|------------|-------|----------|
| `/prd` skill | Medium | High | 1 |
| PRD validation | Low | Medium | 2 |
| GH import | Medium | High | 3 |
| GH status feedback | Medium | High | 4 |
| Bidirectional sync | High | Medium | 5 |

---

## Open Questions

1. **Skill Location**: Should `/prd` be a ralph-specific skill or a general superpowers skill?
2. **GH Auth**: Assume `gh auth` is already configured, or add check during `ralph init`?
3. **Multi-Issue Stories**: Can one ralph story span multiple GitHub issues, or 1:1 mapping?
4. **Project Board Integration**: Support GitHub Projects for Kanban-style tracking?

---

## Related Research

- No existing research documents in this repository

## External Resources

- [Ralph PRD JSON Example](https://github.com/snarktank/ralph/blob/main/prd.json.example)
- [PRD Automation Pipeline](https://github.com/deepak2233/prd-automation-pipeline)
- [ChatPRD: PRD for Claude Code](https://www.chatprd.ai/resources/PRD-for-Claude-Code)
- [gh issue - GitHub CLI Manual](https://cli.github.com/manual/gh_issue)
