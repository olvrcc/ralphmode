---
name: prd
description: Create a PRD for ralph autonomous development through guided conversation
---

# PRD Creation Skill

You are helping create a Product Requirements Document (PRD) for ralph, an autonomous AI coding agent.

## Output Format

The PRD must output a `prd.json` file with this exact schema:

```json
{
  "project": "ProjectName",
  "branchName": "feature/description",
  "description": "Overall feature description",
  "userStories": [
    {
      "id": "PREFIX-001",
      "ticketId": 1,
      "title": "Short story title",
      "description": "Detailed description",
      "acceptanceCriteria": ["criterion 1", "criterion 2"],
      "priority": 1,
      "passes": false,
      "notes": "",
      "githubIssue": null,
      "dependsOn": [],
      "branch": null,
      "pullRequest": null,
      "blocked": false
    }
  ]
}
```

## Discovery Process

Ask ONE question at a time:

1. **Project Context**
   - "What's the project name?"
   - "Brief description of what we're building?"

2. **Ticket Prefix**
   - "What prefix for story IDs? (e.g., PROJ, US, GH):"
   - Suggest auto-generating from project name (e.g., "Sandy" → "SND")

3. **User Stories**
   For each story, gather:
   - Title (action-oriented, e.g., "Add user authentication")
   - Description (1-2 sentences of context)
   - Acceptance criteria (testable conditions)
   - Priority (1 = highest)
   - Dependencies (which other stories must complete first)

4. **Confirm and Generate**
   - Summarize all stories
   - Ask for any adjustments
   - Generate the prd.json

## Guidelines

- Keep stories small (1-2 hours of work each)
- Acceptance criteria should be testable
- Order by dependency then priority
- Each story should be independently completable (except for dependencies)
- Use YAGNI - only include what's needed for the immediate feature

## Example Output

After gathering requirements, write to `.ralph/prd.json`:

```json
{
  "project": "MyApp",
  "branchName": "feature/dark-mode",
  "description": "Add dark mode theme support",
  "userStories": [
    {
      "id": "APP-001",
      "ticketId": 1,
      "title": "Add theme context provider",
      "description": "Create React context for theme state management",
      "acceptanceCriteria": [
        "ThemeProvider wraps app",
        "useTheme hook returns current theme",
        "Theme persists to localStorage"
      ],
      "priority": 1,
      "passes": false,
      "notes": "",
      "githubIssue": null,
      "dependsOn": [],
      "branch": null,
      "pullRequest": null,
      "blocked": false
    },
    {
      "id": "APP-002",
      "ticketId": 2,
      "title": "Add dark mode toggle",
      "description": "Button in header to switch themes",
      "acceptanceCriteria": [
        "Toggle button visible in header",
        "Clicking switches theme immediately",
        "Icon reflects current theme"
      ],
      "priority": 2,
      "passes": false,
      "notes": "",
      "githubIssue": null,
      "dependsOn": ["APP-001"],
      "branch": null,
      "pullRequest": null,
      "blocked": false
    }
  ]
}
```

## When Complete

After writing prd.json, inform the user:

"PRD created at `.ralph/prd.json` with X stories.

To start autonomous development:
```
ralph run
```

Or to review status:
```
ralph status
```"
