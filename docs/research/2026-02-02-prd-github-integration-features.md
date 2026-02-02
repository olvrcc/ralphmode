---
date: 2026-02-02T12:00:00-08:00
git_commit: f2aeb7238ef8bef9e6cb3ad7bdf5381684fa1e48
branch: main
repository: ralphmode
topic: "PRD Creation Skills and GitHub Issues Integration"
tags: [research, prd, github, skills, feature-planning]
status: complete
last_updated: 2026-02-02
last_updated_note: "Added branch+PR workflow, resolved design decisions"
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
ralph gh sync           # Import issues to prd.json
ralph gh import 123     # Import single issue as story
ralph gh check          # Verify gh auth status
```

**Branch + PR Workflow** (per task):

```
GitHub Issue #42: "Add user authentication"
                    │
                    ▼ ralph gh import 42
┌─────────────────────────────────────────────────────────────┐
│ prd.json: US-042 { githubIssue: 42, branch: null, pr: null }│
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼ ralph run starts US-042
┌─────────────────────────────────────────────────────────────┐
│ 1. git checkout -b ralph/US-042-user-auth main              │
│ 2. Do work, commit to branch                                │
│ 3. git push -u origin ralph/US-042-user-auth                │
│ 4. gh pr create --body "Closes #42" (uses PR template)      │
│ 5. Update prd.json: branch, pr fields                       │
│ 6. Mark US-042 passes: true                                 │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼ Next task US-043
┌─────────────────────────────────────────────────────────────┐
│ IF US-043.dependsOn includes US-042:                        │
│   git checkout -b ralph/US-043-next ralph/US-042-user-auth  │
│ ELSE:                                                       │
│   git checkout -b ralph/US-043-next main                    │
└─────────────────────────────────────────────────────────────┘
                    │
                    ▼ PR merged by human
┌─────────────────────────────────────────────────────────────┐
│ GitHub auto-closes #42 via "Closes #42" in PR description   │
└─────────────────────────────────────────────────────────────┘
```

**Key principle**: Ralph creates PRs, humans merge them, GitHub closes issues automatically.

**PR Creation** (using project template if exists):
```bash
# Check for PR template
if [ -f .github/PULL_REQUEST_TEMPLATE.md ]; then
  # gh pr create uses it automatically
fi

gh pr create \
  --title "US-042: Add user authentication" \
  --body "$(cat <<EOF
Closes #42

## Summary
[Auto-generated from story description]

## Changes
[List of commits]
EOF
)"
```

**prd.json Extension**:
```javascript
{
  userStories: [{
    id: "US-042",
    title: "Add user authentication",
    githubIssue: 42,      // Link to issue
    dependsOn: [],        // Story IDs this depends on (for branch chaining)
    branch: null,         // Filled when work starts: "ralph/US-042-user-auth"
    pullRequest: null,    // Filled when PR created: 156
    passes: false,
    // ... other fields
  }]
}
```

**Config Extension** (`.ralph/config.json`):
```javascript
{
  agent: "claude",
  maxIterations: 30,
  createdAt: "...",
  git: {
    provider: "github",   // "github" | "bitbucket" | "gitlab" | "none"
    createPRs: true,      // Create PRs for each story
    usePRTemplate: true,  // Use .github/PULL_REQUEST_TEMPLATE.md
    branchPrefix: "ralph" // Branch naming: ralph/US-XXX-slug
  }
}
```

**GH Auth Check** (during init and run):
```javascript
async function checkGitHubAuth() {
  if (config.git?.provider !== 'github') return true;

  try {
    await execFile('gh', ['auth', 'status']);
    return true;
  } catch {
    console.log(chalk.yellow('GitHub CLI not authenticated.'));
    console.log('Run: gh auth login');
    return false;
  }
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
| Branch-per-task workflow | Medium | High | 3 |
| GH issue import | Medium | High | 4 |
| PR creation with template | Medium | High | 5 |
| GH auth check | Low | Medium | 6 |
| Non-GitHub provider support | Low | Medium | 7 |

---

## Design Decisions (Resolved)

1. **Skill Location**: `/prd` skill lives in ralphmode project (ralph-specific, outputs ralph's exact JSON schema)
2. **GH Auth**: Check during init AND when kicked off. Config supports `git.provider: "none"` for non-GitHub projects
3. **Issue Mapping**: 1:1 - one GitHub issue = one ralph story (simpler)
4. **Project Boards**: Not supported - just issues (avoid complexity)
5. **Issue Closing**: Ralph creates PRs with "Closes #XX", humans merge, GitHub auto-closes issues

## Open Questions

1. **Dependent PRs**: When US-043 branches from US-042's branch, should its PR target US-042's branch or main?
2. **PR Review**: Should ralph wait for PR approval before starting next story, or continue?
3. **Merge Conflicts**: How to handle when dependent branch has conflicts with main?

---

## Related Research

- No existing research documents in this repository

## External Resources

- [Ralph PRD JSON Example](https://github.com/snarktank/ralph/blob/main/prd.json.example)
- [PRD Automation Pipeline](https://github.com/deepak2233/prd-automation-pipeline)
- [ChatPRD: PRD for Claude Code](https://www.chatprd.ai/resources/PRD-for-Claude-Code)
- [gh issue - GitHub CLI Manual](https://cli.github.com/manual/gh_issue)
