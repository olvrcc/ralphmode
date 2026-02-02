# PRD Creation & GitHub Integration Implementation Plan

## Overview

Enhance ralphmode with:
1. Extended config/PRD schema for git integration
2. GitHub issue import and PR creation workflow
3. Branch-per-story with dependency chaining
4. `/prd` skill for interactive PRD creation

## Current State Analysis

**Single file CLI** (`bin/ralph.js`, 907 lines):
- `initProject()` lines 101-320 - wizard setup
- `convertToPRDJson()` lines 606-647 - regex-based markdown parser
- `runRalph()` lines 322-389 - sandy sandbox execution
- `generatePrompt()` lines 514-578 - agent instructions

**Current config schema** (created at init):
```javascript
{ agent, maxIterations, createdAt }
```

**Current PRD schema**:
```javascript
{ project, branchName, description, userStories: [{ id, title, description, acceptanceCriteria, priority, passes, notes }] }
```

### Key Discoveries

- No modular structure - all logic in single file
- `convertToPRDJson()` uses simple numbered-list regex (line 617)
- Story IDs hardcoded as `US-XXX` format (line 624)
- No git operations beyond branch name in PRD
- `generatePrompt()` tells agent to commit but no PR workflow

## Desired End State

After implementation:

1. **Config** includes `ticketPrefix` and `git` settings
2. **PRD stories** track `ticketId`, `githubIssue`, `dependsOn`, `branch`, `pullRequest`, `blocked`
3. **Init** prompts for git provider and auto-generates ticket prefix from project name
4. **New commands**: `ralph gh check`, `ralph gh import <n>`, `ralph gh sync`
5. **Agent prompt** instructs branch creation per story, PR creation on completion
6. **`/prd` skill** exists for interactive PRD creation

### Verification

- `ralph init` in new project prompts for git provider
- `ralph gh check` reports auth status
- `ralph gh import 42` creates story with `ticketId: 42`
- Agent creates branch `SND-042-description` and PR on story completion

## What We're NOT Doing

- Project board integration
- GitLab/Bitbucket provider implementations (placeholder only)
- AI-powered PRD-to-JSON conversion (keep regex, improve later)
- Automated merge (humans merge PRs)
- Multi-issue-per-story mapping

---

## Phase 1: Config Schema Extension

### Overview

Add git configuration to `.ralph/config.json` and prompt during init.

### Changes Required

#### 1. Add `generateTicketPrefix()` helper

**File**: `bin/ralph.js`
**Location**: After line 40 (after AGENTS const)

```javascript
function generateTicketPrefix(projectName) {
  // Extract consonants, uppercase, take first 3
  const consonants = projectName.replace(/[aeiou]/gi, '').toUpperCase();
  if (consonants.length >= 3) return consonants.slice(0, 3);
  // Fallback: first 3 chars uppercase
  return projectName.slice(0, 3).toUpperCase();
}
```

#### 2. Add git provider prompt in `initProject()`

**File**: `bin/ralph.js`
**Location**: After maxIterations prompt (around line 219), before sandy check

```javascript
// Step 5b: Git provider configuration
const projectName = process.cwd().split('/').pop();
const suggestedPrefix = generateTicketPrefix(projectName);

const { gitProvider } = await inquirer.prompt([{
  type: 'list',
  name: 'gitProvider',
  message: 'Git provider for PR integration:',
  choices: [
    { name: 'GitHub (recommended)', value: 'github' },
    { name: 'None (skip PR workflow)', value: 'none' }
  ]
}]);

let ticketPrefix = suggestedPrefix;
if (gitProvider !== 'none') {
  const { customPrefix } = await inquirer.prompt([{
    type: 'input',
    name: 'customPrefix',
    message: `Ticket prefix (suggested: ${suggestedPrefix}):`,
    default: suggestedPrefix,
    validate: (input) => /^[A-Z]{2,5}$/.test(input.toUpperCase()) || 'Use 2-5 uppercase letters'
  }]);
  ticketPrefix = customPrefix.toUpperCase();
}
```

#### 3. Add GitHub auth check during init (if github provider)

**File**: `bin/ralph.js`
**Location**: After git provider prompt

```javascript
// Check GitHub CLI auth if using github provider
if (gitProvider === 'github') {
  spinner.start('Checking GitHub CLI...');
  const ghInstalled = checkGitHubCLI();
  if (!ghInstalled) {
    spinner.fail('GitHub CLI (gh) not found');
    console.log(chalk.yellow('\n  Install: brew install gh'));
    console.log(chalk.yellow('  Then: gh auth login\n'));
    const { continueWithoutGH } = await inquirer.prompt([{
      type: 'confirm',
      name: 'continueWithoutGH',
      message: 'Continue without GitHub integration?',
      default: false
    }]);
    if (!continueWithoutGH) return;
    gitProvider = 'none';
  } else {
    const ghAuthed = await checkGitHubAuth();
    if (!ghAuthed) {
      spinner.warn('GitHub CLI not authenticated');
      console.log(chalk.yellow('\n  Run: gh auth login\n'));
    } else {
      spinner.succeed('GitHub CLI authenticated');
    }
  }
}
```

#### 4. Add helper functions for GH checks

**File**: `bin/ralph.js`
**Location**: After `checkAgentAuth()` (around line 448)

```javascript
function checkGitHubCLI() {
  try {
    execSync('which gh', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function checkGitHubAuth() {
  try {
    execSync('gh auth status', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkXgitAvailable() {
  try {
    execSync('which xgit', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
```

#### 5. Update config creation

**File**: `bin/ralph.js`
**Location**: Around line 287 (config creation)

```javascript
const config = {
  agent,
  maxIterations,
  createdAt: new Date().toISOString(),
  ticketPrefix,
  git: {
    provider: gitProvider,
    createPRs: gitProvider === 'github',
    usePRTemplate: true,
    waitForMerge: false,
    branchPrefix: '',
    useXgit: checkXgitAvailable()
  }
};
```

### Success Criteria

#### Automated Verification

- [x] `node bin/ralph.js --help` runs without error
- [x] Syntax check: `node --check bin/ralph.js`

#### Manual Verification

- [ ] `ralph init` prompts for git provider
- [ ] Suggested ticket prefix appears correctly (e.g., "ralphmode" → "RLP" or "RLPH")
- [ ] Config file contains `ticketPrefix` and `git` object
- [ ] GitHub auth check runs when github provider selected

---

## Phase 2: PRD Schema Extension

### Overview

Extend story schema with git-related fields and update story ID generation.

### Changes Required

#### 1. Update `convertToPRDJson()` to use ticket prefix

**File**: `bin/ralph.js`
**Location**: Replace lines 606-647

```javascript
function convertToPRDJson(content, ticketPrefix = 'US') {
  const lines = content.split('\n');
  const stories = [];
  let currentStory = null;
  let storyCount = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect numbered items as stories
    const match = trimmed.match(/^(\d+)\.\s+(.+)/);
    if (match) {
      if (currentStory) {
        stories.push(currentStory);
      }
      storyCount++;
      const ticketNum = String(storyCount).padStart(3, '0');
      currentStory = {
        id: `${ticketPrefix}-${ticketNum}`,
        ticketId: storyCount,
        title: match[2],
        description: match[2],
        acceptanceCriteria: [],
        priority: storyCount,
        passes: false,
        notes: '',
        // New git-related fields
        githubIssue: null,
        dependsOn: [],
        branch: null,
        pullRequest: null,
        blocked: false
      };
    } else if (currentStory && trimmed.startsWith('-')) {
      currentStory.acceptanceCriteria.push(trimmed.substring(1).trim());
    }
  }

  if (currentStory) {
    stories.push(currentStory);
  }

  return {
    project: 'MyProject',
    branchName: 'ralph/feature',
    description: 'Feature implementation',
    userStories: stories
  };
}
```

#### 2. Update `getEmptyPRD()`

**File**: `bin/ralph.js`
**Location**: Replace lines 649-656

```javascript
function getEmptyPRD(ticketPrefix = 'US') {
  return {
    project: 'MyProject',
    branchName: 'ralph/feature',
    description: 'Add your feature description here',
    userStories: []
  };
}
```

#### 3. Update init to pass ticketPrefix to converter

**File**: `bin/ralph.js`
**Location**: Around line 280 (prd.json creation)

```javascript
if (prdContent) {
  const prdJson = convertToPRDJson(prdContent, ticketPrefix);
  writeFileSync(join(ralphDir, 'prd.json'), JSON.stringify(prdJson, null, 2));
} else {
  writeFileSync(join(ralphDir, 'prd.json'), JSON.stringify(getEmptyPRD(ticketPrefix), null, 2));
}
```

#### 4. Update `showStatus()` to display new fields

**File**: `bin/ralph.js`
**Location**: Around line 406 (inside forEach)

```javascript
prd.userStories.forEach((story, i) => {
  const status = story.blocked
    ? chalk.red('⊘')
    : story.passes
      ? chalk.green('✓')
      : chalk.gray('○');
  const priority = chalk.gray(`[P${story.priority || i + 1}]`);
  const branch = story.branch ? chalk.gray(` → ${story.branch}`) : '';
  const pr = story.pullRequest ? chalk.cyan(` PR#${story.pullRequest}`) : '';
  console.log(`  ${status} ${priority} ${story.id}: ${story.title}${branch}${pr}`);
});
```

### Success Criteria

#### Automated Verification

- [x] `node --check bin/ralph.js` passes
- [x] Create test PRD content, verify JSON output has new fields

#### Manual Verification

- [ ] `ralph init` with example PRD creates stories with configured prefix
- [ ] `ralph status` shows branch/PR info when present
- [ ] Blocked stories show different icon

---

## Phase 3: Git Integration Core

### Overview

Add functions for branch creation (xgit or git fallback) and PR creation.

### Changes Required

#### 1. Add branch creation function

**File**: `bin/ralph.js`
**Location**: After GH check functions

```javascript
async function createStoryBranch(story, config, baseBranch = 'main') {
  const slug = story.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);

  const branchName = `${story.id}-${slug}`;

  if (config.git?.useXgit) {
    try {
      // xgit b <number> "<description>"
      const { execFileSync } = await import('child_process');
      execFileSync('xgit', ['b', String(story.ticketId), story.title], { stdio: 'pipe' });
      return branchName; // xgit creates its own naming
    } catch (err) {
      console.log(chalk.yellow('xgit failed, falling back to git'));
    }
  }

  // Fallback to git
  try {
    const { execFileSync } = await import('child_process');
    execFileSync('git', ['checkout', baseBranch], { stdio: 'pipe' });
    execFileSync('git', ['pull', 'origin', baseBranch], { stdio: 'pipe' });
    execFileSync('git', ['checkout', '-b', branchName], { stdio: 'pipe' });
    return branchName;
  } catch (err) {
    throw new Error(`Failed to create branch: ${err.message}`);
  }
}
```

#### 2. Add PR creation function

**File**: `bin/ralph.js`
**Location**: After `createStoryBranch()`

```javascript
async function createPullRequest(story, config) {
  if (config.git?.provider !== 'github' || !config.git?.createPRs) {
    return null;
  }

  const title = `${story.id}: ${story.title}`;
  const closesClause = story.githubIssue ? `Closes #${story.githubIssue}` : '';

  // Determine target branch
  let targetBranch = 'main';
  if (story.dependsOn?.length > 0) {
    // TODO: Look up the branch of the dependency
    // For now, default to main
  }

  const body = `${closesClause}

## Summary
${story.description}

## Acceptance Criteria
${story.acceptanceCriteria.map(ac => `- [ ] ${ac}`).join('\n')}
`;

  try {
    const { execFileSync } = await import('child_process');
    // Push branch first
    execFileSync('git', ['push', '-u', 'origin', 'HEAD'], { stdio: 'pipe' });

    // Create PR using gh CLI
    const result = execFileSync('gh', [
      'pr', 'create',
      '--title', title,
      '--body', body,
      '--base', targetBranch
    ], { stdio: 'pipe' }).toString().trim();

    // Extract PR number from URL
    const prMatch = result.match(/\/pull\/(\d+)/);
    return prMatch ? parseInt(prMatch[1]) : null;
  } catch (err) {
    console.log(chalk.yellow(`Failed to create PR: ${err.message}`));
    return null;
  }
}
```

#### 3. Add conflict resolution attempt function

**File**: `bin/ralph.js`
**Location**: After `createPullRequest()`

```javascript
async function attemptConflictResolution(story, config) {
  try {
    const { execFileSync } = await import('child_process');
    // Try to rebase on main
    execFileSync('git', ['fetch', 'origin', 'main'], { stdio: 'pipe' });
    execFileSync('git', ['rebase', 'origin/main'], { stdio: 'pipe' });
    return true;
  } catch {
    // Rebase failed - abort and mark blocked
    try {
      const { execFileSync } = await import('child_process');
      execFileSync('git', ['rebase', '--abort'], { stdio: 'pipe' });
    } catch {
      // Already aborted or not in rebase state
    }
    return false;
  }
}
```

### Success Criteria

#### Automated Verification

- [x] `node --check bin/ralph.js` passes

#### Manual Verification

- [ ] `createStoryBranch()` creates branch with correct naming
- [ ] `createPullRequest()` creates PR with correct title and body
- [ ] PR includes "Closes #XX" when githubIssue is set

---

## Phase 4: GitHub Commands

### Overview

Add `ralph gh check`, `ralph gh import`, `ralph gh sync` commands.

### Changes Required

#### 1. Add command routing in `main()`

**File**: `bin/ralph.js`
**Location**: Around line 59 (after existing command checks)

```javascript
} else if (command === 'gh') {
  const subcommand = args[1];
  if (subcommand === 'check') {
    await ghCheck();
  } else if (subcommand === 'import') {
    await ghImport(args[2]);
  } else if (subcommand === 'sync') {
    await ghSync();
  } else {
    console.log(chalk.yellow('Usage: ralph gh [check|import <number>|sync]'));
  }
```

#### 2. Add `ghCheck()` function

**File**: `bin/ralph.js`
**Location**: After conflict resolution function

```javascript
async function ghCheck() {
  const spinner = ora();

  spinner.start('Checking GitHub CLI installation...');
  if (!checkGitHubCLI()) {
    spinner.fail('GitHub CLI (gh) not installed');
    console.log(chalk.yellow('\n  Install: brew install gh\n'));
    return;
  }
  spinner.succeed('GitHub CLI installed');

  spinner.start('Checking authentication...');
  const authed = await checkGitHubAuth();
  if (authed) {
    spinner.succeed('Authenticated with GitHub');

    // Show current user
    try {
      const { execFileSync } = await import('child_process');
      const user = execFileSync('gh', ['api', 'user', '--jq', '.login'], { stdio: 'pipe' }).toString().trim();
      console.log(chalk.gray(`  Logged in as: ${user}`));
    } catch {}
  } else {
    spinner.fail('Not authenticated');
    console.log(chalk.yellow('\n  Run: gh auth login\n'));
  }
}
```

#### 3. Add `ghImport()` function

**File**: `bin/ralph.js`
**Location**: After `ghCheck()`

```javascript
async function ghImport(issueNumber) {
  if (!issueNumber) {
    console.log(chalk.red('Usage: ralph gh import <issue-number>'));
    return;
  }

  const ralphDir = join(process.cwd(), '.ralph');
  if (!existsSync(ralphDir)) {
    console.log(chalk.red('Ralph not initialized. Run `ralph init` first.'));
    return;
  }

  const configPath = join(ralphDir, 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  const prdPath = join(ralphDir, 'prd.json');
  const prd = JSON.parse(readFileSync(prdPath, 'utf-8'));

  const spinner = ora(`Fetching issue #${issueNumber}...`).start();

  try {
    const { execFileSync } = await import('child_process');
    const issueJson = execFileSync('gh', [
      'issue', 'view', String(issueNumber),
      '--json', 'number,title,body,labels'
    ], { stdio: 'pipe' }).toString();
    const issue = JSON.parse(issueJson);

    spinner.succeed(`Found: ${issue.title}`);

    // Determine next story number
    const existingIds = prd.userStories.map(s => s.ticketId).filter(Boolean);
    const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    const ticketNum = String(nextNum).padStart(3, '0');

    // Check for priority label
    const priorityLabel = issue.labels?.find(l => l.name.startsWith('priority:'));
    const priority = priorityLabel?.name === 'priority:high' ? 1 :
                     priorityLabel?.name === 'priority:low' ? 3 : 2;

    const newStory = {
      id: `${config.ticketPrefix}-${ticketNum}`,
      ticketId: nextNum,
      title: issue.title,
      description: issue.body || issue.title,
      acceptanceCriteria: [],
      priority,
      passes: false,
      notes: '',
      githubIssue: issue.number,
      dependsOn: [],
      branch: null,
      pullRequest: null,
      blocked: false
    };

    prd.userStories.push(newStory);
    writeFileSync(prdPath, JSON.stringify(prd, null, 2));

    console.log(chalk.green(`\nAdded story: ${newStory.id}`));
    console.log(chalk.gray(`  Title: ${newStory.title}`));
    console.log(chalk.gray(`  GitHub Issue: #${issue.number}`));
    console.log(chalk.gray(`  Priority: ${priority}`));
  } catch (err) {
    spinner.fail('Failed to fetch issue');
    console.log(chalk.red(`\n  ${err.message}`));
  }
}
```

#### 4. Add `ghSync()` function

**File**: `bin/ralph.js`
**Location**: After `ghImport()`

```javascript
async function ghSync() {
  const ralphDir = join(process.cwd(), '.ralph');
  if (!existsSync(ralphDir)) {
    console.log(chalk.red('Ralph not initialized. Run `ralph init` first.'));
    return;
  }

  const { labelFilter } = await inquirer.prompt([{
    type: 'input',
    name: 'labelFilter',
    message: 'Filter by label (leave empty for all open issues):',
    default: ''
  }]);

  const spinner = ora('Fetching issues...').start();

  try {
    const { execFileSync } = await import('child_process');
    const args = ['issue', 'list', '--state', 'open', '--json', 'number,title,body,labels', '--limit', '50'];
    if (labelFilter) {
      args.push('--label', labelFilter);
    }
    const issuesJson = execFileSync('gh', args, { stdio: 'pipe' }).toString();
    const issues = JSON.parse(issuesJson);

    spinner.succeed(`Found ${issues.length} issues`);

    if (issues.length === 0) {
      console.log(chalk.yellow('No issues to import.'));
      return;
    }

    // Show issues and confirm
    console.log(chalk.bold('\nIssues to import:'));
    issues.forEach(issue => {
      console.log(chalk.gray(`  #${issue.number}: ${issue.title}`));
    });

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Import ${issues.length} issues?`,
      default: true
    }]);

    if (!confirm) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }

    // Import each issue
    for (const issue of issues) {
      await ghImport(String(issue.number));
    }

    console.log(chalk.green(`\nImported ${issues.length} issues.`));
  } catch (err) {
    spinner.fail('Failed to fetch issues');
    console.log(chalk.red(`\n  ${err.message}`));
  }
}
```

#### 5. Update help text

**File**: `bin/ralph.js`
**Location**: In `showHelp()` around line 81

Add to Commands section:
```javascript
  ${chalk.cyan('gh check')}         Check GitHub CLI authentication
  ${chalk.cyan('gh import')} <n>    Import GitHub issue as story
  ${chalk.cyan('gh sync')}          Import all open GitHub issues
```

### Success Criteria

#### Automated Verification

- [x] `node --check bin/ralph.js` passes
- [x] `node bin/ralph.js help` shows gh commands

#### Manual Verification

- [ ] `ralph gh check` shows auth status
- [ ] `ralph gh import 1` imports issue #1 (if exists)
- [ ] `ralph gh sync` lists and imports open issues

---

## Phase 5: Branch+PR Workflow in Agent Prompt

### Overview

Update `generatePrompt()` to instruct agent to create branches and PRs per story.

### Changes Required

#### 1. Update `generatePrompt()` function

**File**: `bin/ralph.js`
**Location**: Replace lines 514-578

```javascript
function generatePrompt(agent, config = {}) {
  const gitInstructions = config.git?.provider === 'github' ? `
## Git Workflow (Branch per Story)

Before starting a story:
1. **Check story.branch** - if null, create a new branch
2. **Branch naming**: \`${config.ticketPrefix || 'US'}-XXX-kebab-title\`
3. **Base branch**:
   - If story.dependsOn is empty → branch from main
   - If story.dependsOn has values → branch from that story's branch

To create branch:
${config.git?.useXgit ? `\`xgit b <ticketId> "<title>"\` (preferred)` : `\`git checkout main && git pull && git checkout -b <branch-name>\``}

After completing a story:
1. **Commit** all changes
2. **Push** branch: \`git push -u origin HEAD\`
3. **Create PR**:
   \`\`\`bash
   gh pr create --title "${config.ticketPrefix || 'US'}-XXX: Story title" --body "Closes #<githubIssue if set>

   ## Summary
   <description>

   ## Changes
   <list files changed>"
   \`\`\`
4. **Update prd.json**:
   - Set \`branch\` to the branch name
   - Set \`pullRequest\` to the PR number
   - Set \`passes: true\`

If merge conflicts occur:
1. Try \`git fetch origin main && git rebase origin/main\`
2. If conflicts can't be resolved automatically:
   - \`git rebase --abort\`
   - Set \`blocked: true\` in prd.json
   - Move to next story without \`dependsOn\` pointing to blocked story
` : `
## Git Workflow

- Commit changes with: \`feat: [Story ID] - [Story Title]\`
- Keep all work on the configured branch
`;

  return `## Your Task

You are Ralph, an autonomous AI coding agent. Follow these steps precisely:

1. **Read the PRD** at \`.ralph/prd.json\`
2. **Read progress.txt** at \`.ralph/progress.txt\` - check Codebase Patterns section first
3. **Read config** at \`.ralph/config.json\` - note ticketPrefix and git settings
4. **Pick ONE story** - the highest priority story where \`passes: false\` and \`blocked: false\`
5. **Check dependencies** - if story.dependsOn has IDs, verify those stories have \`passes: true\`
${gitInstructions}
6. **Implement** that single user story completely
7. **Run quality checks** - typecheck, lint, test (whatever the project uses)
8. **Update prd.json** - set \`passes: true\`, update \`branch\` and \`pullRequest\` if applicable
9. **Append to progress.txt** using the format below

## Progress Report Format

APPEND to .ralph/progress.txt (never replace, always append):

\`\`\`
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- Branch: <branch name>
- PR: #<number> (if created)
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
---
\`\`\`

## Consolidate Patterns

If you discover a reusable pattern, add it to the \`## Codebase Patterns\` section at the TOP of progress.txt.

## Quality Requirements

- ALL commits must pass quality checks (typecheck, lint, test)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns
- Small, atomic commits

## Stop Condition

After completing a user story, check if ALL stories have \`passes: true\` (ignoring \`blocked: true\` stories).

If ALL non-blocked stories are complete: output \`<promise>COMPLETE</promise>\`

If stories remain with \`passes: false\` and \`blocked: false\`: end normally (next iteration will continue)

## Important Rules

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read Codebase Patterns before starting
- Each iteration is fresh context - progress.txt is your memory
`;
}
```

#### 2. Update prompt file creation in `initProject()`

**File**: `bin/ralph.js`
**Location**: Around line 262

The prompt generation already receives config. Ensure the call passes it:

```javascript
const promptContent = generatePrompt(agent, config);
```

### Success Criteria

#### Automated Verification

- [x] `node --check bin/ralph.js` passes

#### Manual Verification

- [ ] `ralph init` with github provider creates prompt with git workflow section
- [ ] Prompt includes branch naming, PR creation, conflict handling instructions
- [ ] Prompt includes xgit command when available

---

## Phase 6: `/prd` Skill

### Overview

Create a Claude Code skill for interactive PRD creation that outputs ralph-compatible JSON.

### Changes Required

#### 1. Create skill directory

**Path**: Create `skills/prd/` directory

#### 2. Create SKILL.md

**File**: `skills/prd/SKILL.md`

```markdown
---
name: prd
description: Create a PRD for ralph autonomous development through guided conversation
---

# PRD Creation Skill

You are helping create a Product Requirements Document (PRD) for ralph, an autonomous AI coding agent.

## Output Format

The PRD must output a `prd.json` file with this exact schema:

\`\`\`json
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
\`\`\`

## Discovery Process

Ask ONE question at a time:

1. **Project Context**
   - "What's the project name?"
   - "Brief description of what we're building?"

2. **Ticket Prefix**
   - "What prefix for story IDs? (e.g., PROJ, US, or I can generate one from project name)"

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

\`\`\`json
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
\`\`\`

## When Complete

After writing prd.json, inform the user:

"PRD created at `.ralph/prd.json` with X stories.

To start autonomous development:
\`\`\`
ralph run
\`\`\`

Or to review status:
\`\`\`
ralph status
\`\`\`"
```

### Success Criteria

#### Automated Verification

- [x] `skills/prd/SKILL.md` exists and is valid markdown

#### Manual Verification

- [ ] `/prd` skill guides through PRD creation
- [ ] Output matches ralph prd.json schema
- [ ] Stories have correct fields including new git-related ones

---

## Testing Strategy

### Unit Tests

None currently - project has no test framework. Consider adding in future.

### Integration Tests

Manual testing for each phase:

1. **Config**: Run `ralph init`, verify config.json
2. **PRD Schema**: Create PRD, check JSON structure
3. **Git Core**: Manually call branch/PR functions
4. **GH Commands**: Test each gh subcommand
5. **Prompt**: Check generated CLAUDE.md content
6. **Skill**: Test `/prd` conversation flow

### Manual Testing Steps

1. Fresh `ralph init` in test project
2. Select GitHub provider
3. Accept suggested ticket prefix
4. Use example PRD
5. Run `ralph status` - verify display
6. Run `ralph gh check` - verify auth check
7. Create GitHub issue, run `ralph gh import <n>`
8. Run `ralph run` briefly, verify branch created

---

## Performance Considerations

- GH CLI calls are synchronous - acceptable for interactive CLI
- No caching needed for current scope
- PRD.json reads are fast (small file)

---

## Migration Notes

Existing `.ralph/` directories won't have new config fields. The code should:
- Default `ticketPrefix` to 'US' if missing
- Default `git` to `{ provider: 'none' }` if missing
- Existing stories without new fields treated as having null/empty values

---

## References

- Research doc: `/docs/research/2026-02-02-prd-github-integration-features.md`
- Clarifications: `/CLARIFICATIONS.md`
- Current implementation: `bin/ralph.js`
- gh CLI docs: https://cli.github.com/manual/gh_issue
