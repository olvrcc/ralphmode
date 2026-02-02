#!/usr/bin/env node

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from 'fs';
import chalk from 'chalk';
import inquirer from 'inquirer';
import ora from 'ora';
import { execSync, spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, '..', 'templates');

const AGENTS = {
  claude: {
    name: 'Claude Code',
    command: 'claude',
    authCheck: 'claude --version',
    authCommand: 'claude',
    dangerousFlag: '--dangerously-skip-permissions',
    printFlag: '--print'
  },
  codex: {
    name: 'OpenAI Codex CLI',
    command: 'codex',
    authCheck: 'codex --version',
    authCommand: 'codex',
    dangerousFlag: '--full-auto',
    printFlag: ''
  },
  gemini: {
    name: 'Gemini CLI',
    command: 'gemini',
    authCheck: 'gemini --version',
    authCommand: 'gemini',
    dangerousFlag: '-y',
    printFlag: ''
  }
};

async function main() {
  console.log(chalk.yellow.bold(`
  ╦═╗╔═╗╦  ╔═╗╦ ╦  ╦ ╦╦╔═╗╔═╗╦ ╦╔╦╗
  ╠╦╝╠═╣║  ╠═╝╠═╣  ║║║║║ ╦║ ╦║ ║║║║
  ╩╚═╩ ╩╩═╝╩  ╩ ╩  ╚╩╝╩╚═╝╚═╝╚═╝╩ ╩
  `));
  console.log(chalk.gray('  Autonomous AI Coding Agent Loop\n'));

  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'init') {
    await initProject();
  } else if (command === 'run' || command === 'start') {
    await runRalph(args.slice(1));
  } else if (command === 'status') {
    await showStatus();
  } else if (command === 'compound') {
    await runCompoundReview();
  } else if (command === 'schedule') {
    await setupSchedule();
  } else if (command === 'help' || command === '--help' || command === '-h') {
    showHelp();
  } else {
    // Default: run init if no ralph files, otherwise run
    const hasRalphSetup = existsSync(join(process.cwd(), '.ralph', 'ralph.sh'));
    if (hasRalphSetup) {
      await runRalph(args);
    } else {
      await initProject();
    }
  }
}

function showHelp() {
  console.log(`
${chalk.bold('Usage:')} ralph [command] [options]

${chalk.bold('Commands:')}
  ${chalk.cyan('init')}              Initialize Ralph mode in current project
  ${chalk.cyan('run')} [iterations]  Start Ralph loop (default: 10 iterations)
  ${chalk.cyan('status')}            Show current PRD and progress status
  ${chalk.cyan('compound')}          Extract learnings from recent sessions
  ${chalk.cyan('schedule')}          Set up nightly automated runs (launchd)
  ${chalk.cyan('help')}              Show this help message

${chalk.bold('Aliases:')}
  ${chalk.cyan('rw')}                Same as ralph

${chalk.bold('Examples:')}
  ralph init          # Set up Ralph in your project
  ralph run 50        # Run with max 50 iterations
  ralph compound      # Extract learnings from today's work
  ralph schedule      # Set up nightly runs
  ralph               # Auto-detect: init or run
  rw run              # Use the alias
  `);
}

async function initProject() {
  const spinner = ora();

  // Check if already initialized
  if (existsSync(join(process.cwd(), '.ralph'))) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'Ralph is already set up. Reinitialize?',
      default: false
    }]);
    if (!overwrite) {
      console.log(chalk.yellow('Aborted.'));
      return;
    }
  }

  // Step 1: Select agent
  const { agent } = await inquirer.prompt([{
    type: 'list',
    name: 'agent',
    message: 'Select your AI coding agent:',
    choices: [
      { name: `${chalk.cyan('Claude Code')} - Anthropic's CLI (recommended)`, value: 'claude' },
      { name: `${chalk.green('Codex CLI')} - OpenAI's CLI`, value: 'codex' },
      { name: `${chalk.blue('Gemini CLI')} - Google's CLI`, value: 'gemini' }
    ]
  }]);

  // Step 2: Check agent authentication
  spinner.start(`Checking ${AGENTS[agent].name} installation...`);

  const isInstalled = checkAgentInstalled(agent);
  if (!isInstalled) {
    spinner.fail(`${AGENTS[agent].name} not found`);
    console.log(chalk.yellow(`\nPlease install ${AGENTS[agent].name} first:`));
    if (agent === 'claude') {
      console.log(chalk.gray('  npm install -g @anthropic-ai/claude-code'));
    } else if (agent === 'codex') {
      console.log(chalk.gray('  npm install -g @openai/codex'));
    } else {
      console.log(chalk.gray('  npm install -g @anthropic-ai/gemini-cli'));
    }
    return;
  }
  spinner.succeed(`${AGENTS[agent].name} installed`);

  // Step 3: Check authentication
  spinner.start('Checking authentication...');
  const isAuthed = await checkAgentAuth(agent);

  if (!isAuthed) {
    spinner.warn('Not authenticated');
    const { authenticate } = await inquirer.prompt([{
      type: 'confirm',
      name: 'authenticate',
      message: `Would you like to authenticate ${AGENTS[agent].name} now?`,
      default: true
    }]);

    if (authenticate) {
      console.log(chalk.cyan(`\nLaunching ${AGENTS[agent].name} for authentication...\n`));
      try {
        execSync(AGENTS[agent].authCommand, { stdio: 'inherit' });
      } catch {
        console.log(chalk.yellow('\nAuthentication may have been cancelled. Continuing anyway...'));
      }
    }
  } else {
    spinner.succeed('Authenticated');
  }

  // Step 4: Get PRD
  const { prdSource } = await inquirer.prompt([{
    type: 'list',
    name: 'prdSource',
    message: 'How would you like to provide your PRD?',
    choices: [
      { name: 'Paste/type PRD content', value: 'paste' },
      { name: 'Load from file', value: 'file' },
      { name: 'Start with example PRD', value: 'example' },
      { name: 'Skip (create PRD later)', value: 'skip' }
    ]
  }]);

  let prdContent = null;

  if (prdSource === 'paste') {
    const { prd } = await inquirer.prompt([{
      type: 'editor',
      name: 'prd',
      message: 'Enter your PRD (opens editor):',
    }]);
    prdContent = prd;
  } else if (prdSource === 'file') {
    const { filePath } = await inquirer.prompt([{
      type: 'input',
      name: 'filePath',
      message: 'Path to PRD file:',
      validate: (input) => existsSync(input) || 'File not found'
    }]);
    prdContent = readFileSync(filePath, 'utf-8');
  } else if (prdSource === 'example') {
    prdContent = getExamplePRD();
  }

  // Step 5: Get max iterations
  const { maxIterations } = await inquirer.prompt([{
    type: 'number',
    name: 'maxIterations',
    message: 'Default max iterations (recommended 10-50):',
    default: 30
  }]);

  // Step 6: Set up sandy (required for AFK Ralph)
  spinner.start('Checking sandy...');
  let sandyInstalled = false;
  try {
    execSync('sandy --version', { stdio: 'pipe' });
    sandyInstalled = true;
    spinner.succeed('Sandy installed');
  } catch {
    spinner.fail('Sandy not installed');
    console.log(chalk.yellow('\n  Sandy is required for AFK Ralph mode.'));
    console.log(chalk.gray('  Install: https://github.com/anthropics/sandy\n'));
    return;
  }

  // Run sandy init if no sandy.json
  const sandyJsonPath = join(process.cwd(), 'sandy.json');
  if (!existsSync(sandyJsonPath)) {
    spinner.start('Running sandy init...');
    try {
      execSync('sandy init', { cwd: process.cwd(), stdio: 'pipe' });
      spinner.succeed('sandy init complete');
    } catch {
      spinner.warn('sandy.json already exists');
    }
  } else {
    console.log(chalk.gray('  sandy.json already exists'));
  }

  // Step 7: Create ralph directory and files
  spinner.start('Creating Ralph files...');

  const ralphDir = join(process.cwd(), '.ralph');
  mkdirSync(ralphDir, { recursive: true });

  // Create ralph.sh
  const ralphScript = generateRalphScript(agent, maxIterations);
  writeFileSync(join(ralphDir, 'ralph.sh'), ralphScript);
  chmodSync(join(ralphDir, 'ralph.sh'), '755');

  // Create prompt file
  const promptFile = agent === 'claude' ? 'CLAUDE.md' : 'prompt.md';
  const promptContent = generatePrompt(agent);
  writeFileSync(join(ralphDir, promptFile), promptContent);

  // Create progress.txt
  const progressContent = `## Codebase Patterns
(Patterns discovered during implementation will be added here)

---

# Ralph Progress Log
Started: ${new Date().toISOString()}

---
`;
  writeFileSync(join(ralphDir, 'progress.txt'), progressContent);

  // Create prd.json
  if (prdContent) {
    const prdJson = convertToPRDJson(prdContent);
    writeFileSync(join(ralphDir, 'prd.json'), JSON.stringify(prdJson, null, 2));
  } else {
    writeFileSync(join(ralphDir, 'prd.json'), JSON.stringify(getEmptyPRD(), null, 2));
  }

  // Create config
  const config = {
    agent,
    maxIterations,
    createdAt: new Date().toISOString()
  };
  writeFileSync(join(ralphDir, 'config.json'), JSON.stringify(config, null, 2));

  spinner.succeed('Ralph files created');

  // Step 8: Offer to start sandbox
  console.log('\n' + chalk.green.bold('Ralph initialized successfully!'));
  console.log(chalk.gray('\nFiles created:'));
  console.log(chalk.gray(`  .ralph/ralph.sh      - Main loop script`));
  console.log(chalk.gray(`  .ralph/${promptFile}  - Prompt template`));
  console.log(chalk.gray(`  .ralph/progress.txt  - Progress tracking`));
  console.log(chalk.gray(`  .ralph/prd.json      - PRD tasks`));
  console.log(chalk.gray(`  .ralph/config.json   - Configuration`));

  const { startNow } = await inquirer.prompt([{
    type: 'confirm',
    name: 'startNow',
    message: 'Start Ralph now (in sandy sandbox)?',
    default: true
  }]);

  if (startNow) {
    await runRalph([]);
  } else {
    console.log(chalk.cyan('\nTo start Ralph later, run:'));
    console.log(chalk.white('  ralph run'));
    console.log(chalk.gray('  or'));
    console.log(chalk.white('  rw run\n'));
  }
}

async function runRalph(args) {
  const ralphDir = join(process.cwd(), '.ralph');

  if (!existsSync(ralphDir)) {
    console.log(chalk.red('Ralph not initialized. Run `ralph init` first.'));
    return;
  }

  // Load config
  const configPath = join(ralphDir, 'config.json');
  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf-8'))
    : { agent: 'claude', maxIterations: 30 };

  const iterations = args[0] ? parseInt(args[0]) : config.maxIterations;

  console.log(chalk.cyan(`\nStarting Ralph with ${AGENTS[config.agent].name}`));
  console.log(chalk.gray(`Max iterations: ${iterations}`));
  console.log(chalk.gray(`Working directory: ${process.cwd()}\n`));

  // Check PRD status
  const prdPath = join(ralphDir, 'prd.json');
  if (existsSync(prdPath)) {
    const prd = JSON.parse(readFileSync(prdPath, 'utf-8'));
    const total = prd.userStories?.length || 0;
    const done = prd.userStories?.filter(s => s.passes).length || 0;
    console.log(chalk.yellow(`PRD Status: ${done}/${total} stories complete\n`));

    if (total > 0 && done === total) {
      console.log(chalk.green.bold('All stories already complete!'));
      const { continueAnyway } = await inquirer.prompt([{
        type: 'confirm',
        name: 'continueAnyway',
        message: 'Continue anyway?',
        default: false
      }]);
      if (!continueAnyway) return;
    }
  }

  // Check sandy
  const spinner = ora('Checking sandy...').start();
  try {
    execSync('sandy --version', { stdio: 'pipe' });
    spinner.succeed('Sandy available');
  } catch {
    spinner.fail('Sandy not found');
    console.log(chalk.yellow('\nSandy is required. Install: https://github.com/anthropics/sandy'));
    return;
  }

  console.log(chalk.cyan('\nLaunching in sandy sandbox...\n'));

  const sandyProcess = spawn('sandy', ['run', `./.ralph/ralph.sh ${iterations}`], {
    cwd: process.cwd(),
    stdio: 'inherit',
    shell: true
  });

  sandyProcess.on('close', (code) => {
    if (code === 0) {
      console.log(chalk.green.bold('\nRalph completed successfully!'));
    } else {
      console.log(chalk.yellow(`\nRalph exited with code ${code}`));
    }
    showStatus();
  });
}

async function showStatus() {
  const ralphDir = join(process.cwd(), '.ralph');

  if (!existsSync(ralphDir)) {
    console.log(chalk.red('Ralph not initialized.'));
    return;
  }

  console.log(chalk.bold('\n PRD Status:\n'));

  const prdPath = join(ralphDir, 'prd.json');
  if (existsSync(prdPath)) {
    const prd = JSON.parse(readFileSync(prdPath, 'utf-8'));

    if (prd.userStories && prd.userStories.length > 0) {
      prd.userStories.forEach((story, i) => {
        const status = story.passes
          ? chalk.green('✓')
          : chalk.gray('○');
        const priority = chalk.gray(`[P${story.priority || i + 1}]`);
        console.log(`  ${status} ${priority} ${story.id}: ${story.title}`);
      });

      const total = prd.userStories.length;
      const done = prd.userStories.filter(s => s.passes).length;
      console.log(chalk.bold(`\n  Progress: ${done}/${total} (${Math.round(done/total*100)}%)\n`));
    } else {
      console.log(chalk.yellow('  No stories in PRD yet.'));
    }
  } else {
    console.log(chalk.yellow('  prd.json not found.'));
  }
}

function checkAgentInstalled(agent) {
  try {
    execSync(`which ${AGENTS[agent].command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

async function checkAgentAuth(agent) {
  // Basic check - most agents will prompt if not authed
  try {
    if (agent === 'claude') {
      execSync('claude --version', { stdio: 'pipe' });
    } else if (agent === 'codex') {
      execSync('codex --version', { stdio: 'pipe' });
    } else if (agent === 'gemini') {
      execSync('gemini --version', { stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

function generateRalphScript(agent, maxIterations) {
  const agentConfig = AGENTS[agent];
  const promptFile = agent === 'claude' ? 'CLAUDE.md' : 'prompt.md';

  return `#!/bin/bash
# Ralph Wiggum - Autonomous AI Coding Agent Loop
# Generated by ralph CLI
# Agent: ${agentConfig.name}

set -e

SCRIPT_DIR="$(cd "$(dirname "\${BASH_SOURCE[0]}")" && pwd)"
PRD_FILE="$SCRIPT_DIR/prd.json"
PROGRESS_FILE="$SCRIPT_DIR/progress.txt"
PROMPT_FILE="$SCRIPT_DIR/${promptFile}"
MAX_ITERATIONS=\${1:-${maxIterations}}

echo ""
echo "╦═╗╔═╗╦  ╔═╗╦ ╦  ╦ ╦╦╔═╗╔═╗╦ ╦╔╦╗"
echo "╠╦╝╠═╣║  ╠═╝╠═╣  ║║║║║ ╦║ ╦║ ║║║║"
echo "╩╚═╩ ╩╩═╝╩  ╩ ╩  ╚╩╝╩╚═╝╚═╝╚═╝╩ ╩"
echo ""
echo "Agent: ${agentConfig.name}"
echo "Max iterations: $MAX_ITERATIONS"
echo "Started: $(date)"
echo ""

for i in $(seq 1 $MAX_ITERATIONS); do
  echo ""
  echo "═══════════════════════════════════════════════════════"
  echo "  Iteration $i of $MAX_ITERATIONS"
  echo "═══════════════════════════════════════════════════════"
  echo ""

  # Run the agent
  ${agent === 'claude'
    ? `OUTPUT=$(claude ${agentConfig.dangerousFlag} ${agentConfig.printFlag} < "$PROMPT_FILE" 2>&1 | tee /dev/stderr) || true`
    : agent === 'codex'
    ? `OUTPUT=$(codex ${agentConfig.dangerousFlag} -q "$(cat $PROMPT_FILE)" 2>&1 | tee /dev/stderr) || true`
    : `OUTPUT=$(gemini ${agentConfig.dangerousFlag} -p "$(cat $PROMPT_FILE)" 2>&1 | tee /dev/stderr) || true`
  }

  # Check for completion signal
  if echo "$OUTPUT" | grep -q "<promise>COMPLETE</promise>"; then
    echo ""
    echo "════════════════════════════════════════════════════"
    echo "  RALPH COMPLETED ALL TASKS!"
    echo "  Finished at iteration $i of $MAX_ITERATIONS"
    echo "════════════════════════════════════════════════════"
    exit 0
  fi

  echo ""
  echo "Iteration $i complete. Continuing in 3 seconds..."
  sleep 3
done

echo ""
echo "Ralph reached max iterations ($MAX_ITERATIONS) without completing."
echo "Check progress.txt for status."
exit 1
`;
}

function generatePrompt(agent) {
  return `## Your Task

You are Ralph, an autonomous AI coding agent. Follow these steps precisely:

1. **Read the PRD** at \`.ralph/prd.json\`
2. **Read progress.txt** at \`.ralph/progress.txt\` - check Codebase Patterns section first
3. **Check branch** - ensure you're on the correct branch from PRD \`branchName\`. Create from main if needed.
4. **Pick ONE story** - the highest priority story where \`passes: false\`
5. **Implement** that single user story completely
6. **Run quality checks** - typecheck, lint, test (whatever the project uses)
7. **Commit** if checks pass: \`feat: [Story ID] - [Story Title]\`
8. **Update prd.json** - set \`passes: true\` for the completed story
9. **Append to progress.txt** using the format below

## Progress Report Format

APPEND to .ralph/progress.txt (never replace, always append):

\`\`\`
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
\`\`\`

## Consolidate Patterns

If you discover a reusable pattern, add it to the \`## Codebase Patterns\` section at the TOP of progress.txt:

\`\`\`
## Codebase Patterns
- Pattern: description
- Pattern: description
\`\`\`

## Quality Requirements

- ALL commits must pass quality checks (typecheck, lint, test)
- Do NOT commit broken code
- Keep changes focused and minimal
- Follow existing code patterns
- Small, atomic commits

## Stop Condition

After completing a user story, check if ALL stories have \`passes: true\`.

If ALL stories are complete: output \`<promise>COMPLETE</promise>\`

If stories remain with \`passes: false\`: end normally (next iteration will continue)

## Important Rules

- Work on ONE story per iteration
- Commit frequently
- Keep CI green
- Read Codebase Patterns before starting
- Each iteration is fresh context - progress.txt is your memory
`;
}

function getExamplePRD() {
  return `# Example Feature: Task Priority System

Add priority levels (high/medium/low) to tasks.

## Stories

1. Add priority field to database
   - Add priority column to tasks table
   - Values: high, medium, low (default: medium)
   - Run migration

2. Display priority on task cards
   - Show colored badge (red=high, yellow=medium, gray=low)
   - Visible without hover

3. Add priority selector to task edit
   - Dropdown in edit modal
   - Save on selection change

4. Filter tasks by priority
   - Filter dropdown: All, High, Medium, Low
   - Persist filter in URL
`;
}

function convertToPRDJson(content) {
  // Simple conversion - in practice, AI would do better
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
      currentStory = {
        id: `US-${String(storyCount).padStart(3, '0')}`,
        title: match[2],
        description: match[2],
        acceptanceCriteria: [],
        priority: storyCount,
        passes: false,
        notes: ''
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

function getEmptyPRD() {
  return {
    project: 'MyProject',
    branchName: 'ralph/feature',
    description: 'Add your feature description here',
    userStories: []
  };
}

async function runCompoundReview() {
  const ralphDir = join(process.cwd(), '.ralph');
  const configPath = join(ralphDir, 'config.json');

  if (!existsSync(ralphDir)) {
    console.log(chalk.red('Ralph not initialized. Run `ralph init` first.'));
    return;
  }

  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, 'utf-8'))
    : { agent: 'claude' };

  const agent = config.agent;
  const agentConfig = AGENTS[agent];

  console.log(chalk.cyan('\nRunning Compound Review...'));
  console.log(chalk.gray('Extracting learnings from recent sessions\n'));

  const compoundPrompt = `You are reviewing recent work to extract learnings.

1. Look at the git log for recent commits in the last 24 hours
2. Review what was implemented and any patterns discovered
3. Update .ralph/progress.txt with any new patterns in the "## Codebase Patterns" section
4. If there are project-level CLAUDE.md or AGENTS.md files, update them with relevant learnings

Focus on:
- Patterns that help future work go faster
- Gotchas to avoid
- File locations and conventions discovered
- API patterns or quirks

Commit any changes with: "chore: compound learnings from recent sessions"
`;

  // Run compound review
  try {
    if (agent === 'claude') {
      execSync(`echo '${compoundPrompt.replace(/'/g, "\\'")}' | claude --dangerously-skip-permissions --print`, {
        cwd: process.cwd(),
        stdio: 'inherit'
      });
    } else if (agent === 'codex') {
      execSync(`codex --full-auto -q "${compoundPrompt}"`, {
        cwd: process.cwd(),
        stdio: 'inherit'
      });
    } else {
      execSync(`gemini -y -p "${compoundPrompt}"`, {
        cwd: process.cwd(),
        stdio: 'inherit'
      });
    }
    console.log(chalk.green('\nCompound review complete!'));
  } catch (err) {
    console.log(chalk.yellow('\nCompound review finished (check output above)'));
  }
}

async function setupSchedule() {
  console.log(chalk.cyan('\nSetting up nightly automation...\n'));

  const { scheduleType } = await inquirer.prompt([{
    type: 'list',
    name: 'scheduleType',
    message: 'What would you like to schedule?',
    choices: [
      { name: 'Full nightly loop (compound + run)', value: 'full' },
      { name: 'Compound review only (extract learnings)', value: 'compound' },
      { name: 'Run only (execute PRD tasks)', value: 'run' },
      { name: 'View generated plist files only', value: 'view' }
    ]
  }]);

  const { runTime } = await inquirer.prompt([{
    type: 'input',
    name: 'runTime',
    message: 'What time should it run? (HH:MM, 24h format)',
    default: '23:00',
    validate: (input) => /^\d{2}:\d{2}$/.test(input) || 'Use HH:MM format'
  }]);

  const [hour, minute] = runTime.split(':').map(Number);
  const projectPath = process.cwd();
  const projectName = projectPath.split('/').pop();

  // Generate plist content
  const compoundPlist = generateLaunchdPlist(
    `com.ralph.${projectName}.compound`,
    join(projectPath, 'ralph', 'compound-review.sh'),
    projectPath,
    hour,
    minute,
    'compound'
  );

  const runPlist = generateLaunchdPlist(
    `com.ralph.${projectName}.run`,
    join(projectPath, 'ralph', 'ralph.sh'),
    projectPath,
    hour,
    minute + 30, // Run 30 mins after compound
    'run'
  );

  const caffeinatePlist = generateCaffeinatePlist(
    `com.ralph.${projectName}.caffeinate`,
    Math.max(0, hour - 1) // Start 1 hour before
  );

  // Create compound-review.sh script
  const compoundScript = `#!/bin/bash
# Compound Review - Extract learnings from recent sessions
cd "${projectPath}"
ralph compound
`;

  const ralphDir = join(projectPath, 'ralph');
  writeFileSync(join(ralphDir, 'compound-review.sh'), compoundScript);
  chmodSync(join(ralphDir, 'compound-review.sh'), '755');

  // Create logs directory
  mkdirSync(join(projectPath, 'logs'), { recursive: true });

  if (scheduleType === 'view') {
    console.log(chalk.bold('\nGenerated plist files:\n'));
    console.log(chalk.cyan('=== Compound Review ==='));
    console.log(compoundPlist);
    console.log(chalk.cyan('\n=== Run ==='));
    console.log(runPlist);
    console.log(chalk.cyan('\n=== Caffeinate ==='));
    console.log(caffeinatePlist);
    return;
  }

  // Write plist files
  const launchAgentsDir = join(process.env.HOME, 'Library', 'LaunchAgents');
  mkdirSync(launchAgentsDir, { recursive: true });

  const files = [];

  if (scheduleType === 'full' || scheduleType === 'compound') {
    const compoundPath = join(launchAgentsDir, `com.ralph.${projectName}.compound.plist`);
    writeFileSync(compoundPath, compoundPlist);
    files.push(compoundPath);
  }

  if (scheduleType === 'full' || scheduleType === 'run') {
    const runPath = join(launchAgentsDir, `com.ralph.${projectName}.run.plist`);
    writeFileSync(runPath, runPlist);
    files.push(runPath);
  }

  // Always add caffeinate
  const caffeinatePath = join(launchAgentsDir, `com.ralph.${projectName}.caffeinate.plist`);
  writeFileSync(caffeinatePath, caffeinatePlist);
  files.push(caffeinatePath);

  console.log(chalk.green('\nPlist files created:'));
  files.forEach(f => console.log(chalk.gray(`  ${f}`)));

  const { loadNow } = await inquirer.prompt([{
    type: 'confirm',
    name: 'loadNow',
    message: 'Load these schedules now?',
    default: true
  }]);

  if (loadNow) {
    for (const file of files) {
      try {
        execSync(`launchctl load "${file}"`, { stdio: 'pipe' });
        console.log(chalk.green(`  Loaded: ${file.split('/').pop()}`));
      } catch {
        console.log(chalk.yellow(`  Already loaded or error: ${file.split('/').pop()}`));
      }
    }
  }

  console.log(chalk.cyan('\nSchedule set! Your agent will run nightly.'));
  console.log(chalk.gray('\nTo check status: launchctl list | grep ralph'));
  console.log(chalk.gray('To unload: launchctl unload <plist-path>'));
}

function generateLaunchdPlist(label, scriptPath, workDir, hour, minute, type) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${scriptPath}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${workDir}</string>

  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute % 60}</integer>
  </dict>

  <key>StandardOutPath</key>
  <string>${workDir}/logs/ralph-${type}.log</string>

  <key>StandardErrorPath</key>
  <string>${workDir}/logs/ralph-${type}.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>`;
}

function generateCaffeinatePlist(label, startHour) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/caffeinate</string>
    <string>-i</string>
    <string>-t</string>
    <string>14400</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${startHour}</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
</dict>
</plist>`;
}

main().catch(console.error);
