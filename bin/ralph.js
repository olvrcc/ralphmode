#!/usr/bin/env node

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
} from "fs";
import chalk from "chalk";
import inquirer from "inquirer";
import ora from "ora";
import { execSync, spawn } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = join(__dirname, "..", "templates");

// Get version from package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf-8"),
);
const VERSION = packageJson.version;

const AGENTS = {
  claude: {
    name: "Claude Code",
    command: "claude",
    authCheck: "claude --version",
    authCommand: "claude",
    dangerousFlag: "--dangerously-skip-permissions",
    printFlag: "--print",
  },
  codex: {
    name: "OpenAI Codex CLI",
    command: "codex",
    authCheck: "codex --version",
    authCommand: "codex",
    dangerousFlag: "--full-auto",
    printFlag: "",
  },
  gemini: {
    name: "Gemini CLI",
    command: "gemini",
    authCheck: "gemini --version",
    authCommand: "gemini",
    dangerousFlag: "-y",
    printFlag: "",
  },
};

// Gradient text helpers
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function interpolateColor(color1, color2, factor) {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * factor),
    g: Math.round(color1.g + (color2.g - color1.g) * factor),
    b: Math.round(color1.b + (color2.b - color1.b) * factor),
  };
}

function gradientText(text, colors) {
  const rgbColors = colors.map(hexToRgb);
  const chars = text.split("");
  const nonSpaceIndices = chars
    .map((c, i) => (c !== " " ? i : -1))
    .filter((i) => i !== -1);
  const totalNonSpace = nonSpaceIndices.length;

  return chars
    .map((char, i) => {
      if (char === " " || char === "\n") return char;

      const posInGradient = nonSpaceIndices.indexOf(i);
      const progress =
        totalNonSpace > 1 ? posInGradient / (totalNonSpace - 1) : 0;

      // Map progress to color segments
      const segment = progress * (rgbColors.length - 1);
      const colorIndex = Math.min(Math.floor(segment), rgbColors.length - 2);
      const segmentProgress = segment - colorIndex;

      const color = interpolateColor(
        rgbColors[colorIndex],
        rgbColors[colorIndex + 1],
        segmentProgress,
      );
      return chalk.rgb(color.r, color.g, color.b).bold(char);
    })
    .join("");
}

function printBanner() {
  const banner = `  ╦═╗╔═╗╦  ╔═╗╦ ╦  ╦ ╦╦╔═╗╔═╗╦ ╦╔╦╗
  ╠╦╝╠═╣║  ╠═╝╠═╣  ║║║║║ ╦║ ╦║ ║║║║
  ╩╚═╩ ╩╩═╝╩  ╩ ╩  ╚╩╝╩╚═╝╚═╝╚═╝╩ ╩`;

  // Warm sunset gradient: gold → orange → coral → hot pink → orchid
  const colors = ["#FFD700", "#FF8C00", "#FF6B6B", "#FF1493", "#DA70D6"];

  console.log("\n" + gradientText(banner, colors) + "\n");
}

function generateTicketPrefix(projectName) {
  // Extract consonants, uppercase, take first 3
  const consonants = projectName.replace(/[aeiou]/gi, "").toUpperCase();
  if (consonants.length >= 3) return consonants.slice(0, 3);
  // Fallback: first 3 chars uppercase
  return projectName.slice(0, 3).toUpperCase();
}

async function main() {
  printBanner();
  console.log(chalk.gray("  Autonomous AI Coding Agent Loop\n"));

  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "init") {
    await initProject();
  } else if (command === "run" || command === "start") {
    await runRalph(args.slice(1));
  } else if (command === "status") {
    await showStatus();
  } else if (command === "compound") {
    await runCompoundReview();
  } else if (command === "schedule") {
    await setupSchedule();
  } else if (command === "gh") {
    const subcommand = args[1];
    if (subcommand === "check") {
      await ghCheck();
    } else if (subcommand === "import") {
      await ghImport(args[2]);
    } else if (subcommand === "sync") {
      await ghSync();
    } else {
      console.log(chalk.yellow("Usage: ralph gh [check|import <number>|sync]"));
    }
  } else if (
    command === "version" ||
    command === "--version" ||
    command === "-v"
  ) {
    console.log(`ralph v${VERSION}`);
  } else if (command === "help" || command === "--help" || command === "-h") {
    showHelp();
  } else {
    // Default: run init if no ralph files, otherwise run
    const hasRalphSetup = existsSync(join(process.cwd(), ".ralph", "ralph.sh"));
    if (hasRalphSetup) {
      await runRalph(args);
    } else {
      await initProject();
    }
  }
}

function showHelp() {
  console.log(`
${chalk.bold("Usage:")} ralph [command] [options]

${chalk.bold("Commands:")}
  ${chalk.cyan("init")}              Initialize Ralph mode in current project
  ${chalk.cyan("run")} [iterations]  Start Ralph loop (default: 10 iterations)
  ${chalk.cyan("status")}            Show current PRD and progress status
  ${chalk.cyan("compound")}          Extract learnings from recent sessions
  ${chalk.cyan("schedule")}          Set up nightly automated runs (launchd)
  ${chalk.cyan("gh check")}          Check GitHub CLI authentication
  ${chalk.cyan("gh import")} <n>     Import GitHub issue as story
  ${chalk.cyan("gh sync")}           Import all open GitHub issues
  ${chalk.cyan("help")}              Show this help message
  ${chalk.cyan("version")}           Show version number

${chalk.bold("Aliases:")}
  ${chalk.cyan("rw")}                Same as ralph

${chalk.bold("Examples:")}
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
  if (existsSync(join(process.cwd(), ".ralph"))) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: "Ralph is already set up. Reinitialize?",
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.yellow("Aborted."));
      return;
    }
  }

  // Step 1: Select agent
  const { agent } = await inquirer.prompt([
    {
      type: "list",
      name: "agent",
      message: "Select your AI coding agent:",
      choices: [
        {
          name: `${chalk.cyan("Claude Code")} - Anthropic's CLI (recommended)`,
          value: "claude",
        },
        { name: `${chalk.green("Codex CLI")} - OpenAI's CLI`, value: "codex" },
        { name: `${chalk.blue("Gemini CLI")} - Google's CLI`, value: "gemini" },
      ],
    },
  ]);

  // Step 2: Check agent authentication
  spinner.start(`Checking ${AGENTS[agent].name} installation...`);

  const isInstalled = checkAgentInstalled(agent);
  if (!isInstalled) {
    spinner.fail(`${AGENTS[agent].name} not found`);
    console.log(
      chalk.yellow(`\nPlease install ${AGENTS[agent].name} first:\n`),
    );
    if (agent === "claude") {
      console.log(
        chalk.white("  curl -fsSL https://claude.ai/install.sh | bash"),
      );
      console.log(
        chalk.gray("\n  Docs: https://code.claude.com/docs/en/quickstart"),
      );
    } else if (agent === "codex") {
      console.log(chalk.white("  npm i -g @openai/codex"));
      console.log(chalk.gray("  # or"));
      console.log(chalk.white("  brew install --cask codex"));
      console.log(
        chalk.gray("\n  Docs: https://developers.openai.com/codex/quickstart/"),
      );
    } else {
      console.log(chalk.white("  npm install -g @google/gemini-cli"));
      console.log(
        chalk.gray("\n  Docs: https://github.com/google-gemini/gemini-cli"),
      );
    }
    console.log("");
    return;
  }
  spinner.succeed(`${AGENTS[agent].name} installed`);

  // Step 3: Check authentication
  spinner.start("Checking authentication...");
  const isAuthed = await checkAgentAuth(agent);

  if (!isAuthed) {
    spinner.warn("Not authenticated");
    const { authenticate } = await inquirer.prompt([
      {
        type: "confirm",
        name: "authenticate",
        message: `Would you like to authenticate ${AGENTS[agent].name} now?`,
        default: true,
      },
    ]);

    if (authenticate) {
      console.log(
        chalk.cyan(`\nLaunching ${AGENTS[agent].name} for authentication...\n`),
      );
      try {
        execSync(AGENTS[agent].authCommand, { stdio: "inherit" });
      } catch {
        console.log(
          chalk.yellow(
            "\nAuthentication may have been cancelled. Continuing anyway...",
          ),
        );
      }
    }
  } else {
    spinner.succeed("Authenticated");
  }

  // Step 4: Get PRD
  const { prdSource } = await inquirer.prompt([
    {
      type: "list",
      name: "prdSource",
      message: "How would you like to provide your PRD?",
      choices: [
        { name: "Paste/type PRD content", value: "paste" },
        { name: "Load from file", value: "file" },
        { name: "Start with example PRD", value: "example" },
        { name: "Skip (create PRD later)", value: "skip" },
      ],
    },
  ]);

  let prdContent = null;

  if (prdSource === "paste") {
    const { prd } = await inquirer.prompt([
      {
        type: "editor",
        name: "prd",
        message: "Enter your PRD (opens editor):",
      },
    ]);
    prdContent = prd;
  } else if (prdSource === "file") {
    const { filePath } = await inquirer.prompt([
      {
        type: "input",
        name: "filePath",
        message: "Path to PRD file:",
        validate: (input) => existsSync(input) || "File not found",
      },
    ]);
    prdContent = readFileSync(filePath, "utf-8");
  } else if (prdSource === "example") {
    prdContent = getExamplePRD();
  }

  // Step 5: Get max iterations
  const { maxIterations } = await inquirer.prompt([
    {
      type: "number",
      name: "maxIterations",
      message: "Default max iterations (recommended 10-50):",
      default: 30,
    },
  ]);

  // Step 5b: Git provider configuration
  const projectName = process.cwd().split("/").pop();
  const suggestedPrefix = generateTicketPrefix(projectName);

  let { gitProvider } = await inquirer.prompt([
    {
      type: "list",
      name: "gitProvider",
      message: "Git provider for PR integration:",
      choices: [
        { name: "GitHub (recommended)", value: "github" },
        { name: "None (skip PR workflow)", value: "none" },
      ],
    },
  ]);

  let ticketPrefix = suggestedPrefix;
  if (gitProvider !== "none") {
    const { customPrefix } = await inquirer.prompt([
      {
        type: "input",
        name: "customPrefix",
        message: `Ticket prefix (suggested: ${suggestedPrefix}):`,
        default: suggestedPrefix,
        validate: (input) => /^[A-Z]{2,5}$/i.test(input) || "Use 2-5 letters",
      },
    ]);
    ticketPrefix = customPrefix.toUpperCase();
  }

  // Check GitHub CLI auth if using github provider
  if (gitProvider === "github") {
    spinner.start("Checking GitHub CLI...");
    const ghInstalled = checkGitHubCLI();
    if (!ghInstalled) {
      spinner.fail("GitHub CLI (gh) not found");
      console.log(chalk.yellow("\n  Install: brew install gh"));
      console.log(chalk.yellow("  Then: gh auth login\n"));
      const { continueWithoutGH } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueWithoutGH",
          message: "Continue without GitHub integration?",
          default: false,
        },
      ]);
      if (!continueWithoutGH) return;
      gitProvider = "none";
    } else {
      const ghAuthed = await checkGitHubAuth();
      if (!ghAuthed) {
        spinner.warn("GitHub CLI not authenticated");
        console.log(chalk.yellow("\n  Run: gh auth login\n"));
      } else {
        spinner.succeed("GitHub CLI authenticated");
      }
    }
  }

  // Step 6: Set up sandy (required for AFK Ralph)
  spinner.start("Checking sandy...");
  let sandyInstalled = false;
  try {
    execSync("sandy --version", { stdio: "pipe" });
    sandyInstalled = true;
    spinner.succeed("Sandy installed");
  } catch {
    spinner.fail("Sandy not installed");
    console.log(chalk.yellow("\n  Sandy is required for AFK Ralph mode."));
    console.log(chalk.gray("  Install: https://github.com/anthropics/sandy\n"));
    return;
  }

  // Run sandy init if no sandy.json
  const sandyJsonPath = join(process.cwd(), "sandy.json");
  if (!existsSync(sandyJsonPath)) {
    spinner.start("Running sandy init...");
    try {
      execSync("sandy init", { cwd: process.cwd(), stdio: "pipe" });
      spinner.succeed("sandy init complete");
    } catch {
      spinner.warn("sandy.json already exists");
    }
  } else {
    console.log(chalk.gray("  sandy.json already exists"));
  }

  // Step 7: Create ralph directory and files
  spinner.start("Creating Ralph files...");

  const ralphDir = join(process.cwd(), ".ralph");
  mkdirSync(ralphDir, { recursive: true });

  // Create config first (needed for prompt generation)
  const config = {
    agent,
    maxIterations,
    createdAt: new Date().toISOString(),
    ticketPrefix,
    git: {
      provider: gitProvider,
      createPRs: gitProvider === "github",
      usePRTemplate: true,
      waitForMerge: false,
      branchPrefix: "",
      useXgit: checkXgitAvailable(),
    },
  };
  writeFileSync(join(ralphDir, "config.json"), JSON.stringify(config, null, 2));

  // Create ralph.sh
  const ralphScript = generateRalphScript(agent, maxIterations);
  writeFileSync(join(ralphDir, "ralph.sh"), ralphScript);
  chmodSync(join(ralphDir, "ralph.sh"), "755");

  // Create prompt file (pass config for git workflow instructions)
  const promptFile = agent === "claude" ? "CLAUDE.md" : "prompt.md";
  const promptContent = generatePrompt(agent, config);
  writeFileSync(join(ralphDir, promptFile), promptContent);

  // Create progress.txt
  const progressContent = `## Codebase Patterns
(Patterns discovered during implementation will be added here)

---

# Ralph Progress Log
Started: ${new Date().toISOString()}

---
`;
  writeFileSync(join(ralphDir, "progress.txt"), progressContent);

  // Create prd.json
  if (prdContent) {
    const prdJson = convertToPRDJson(prdContent, ticketPrefix);
    writeFileSync(join(ralphDir, "prd.json"), JSON.stringify(prdJson, null, 2));
  } else {
    writeFileSync(
      join(ralphDir, "prd.json"),
      JSON.stringify(getEmptyPRD(ticketPrefix), null, 2),
    );
  }

  spinner.succeed("Ralph files created");

  // Step 8: Offer to start sandbox
  console.log("\n" + chalk.green.bold("Ralph initialized successfully!"));
  console.log(chalk.gray("\nFiles created:"));
  console.log(chalk.gray(`  .ralph/ralph.sh      - Main loop script`));
  console.log(chalk.gray(`  .ralph/${promptFile}  - Prompt template`));
  console.log(chalk.gray(`  .ralph/progress.txt  - Progress tracking`));
  console.log(chalk.gray(`  .ralph/prd.json      - PRD tasks`));
  console.log(chalk.gray(`  .ralph/config.json   - Configuration`));

  const { startNow } = await inquirer.prompt([
    {
      type: "confirm",
      name: "startNow",
      message: "Start Ralph now (in sandy sandbox)?",
      default: true,
    },
  ]);

  if (startNow) {
    await runRalph([]);
  } else {
    console.log(chalk.cyan("\nTo start Ralph later, run:"));
    console.log(chalk.white("  ralph run"));
    console.log(chalk.gray("  or"));
    console.log(chalk.white("  rw run\n"));
  }
}

async function runRalph(args) {
  const ralphDir = join(process.cwd(), ".ralph");

  if (!existsSync(ralphDir)) {
    console.log(chalk.red("Ralph not initialized. Run `ralph init` first."));
    return;
  }

  // Load config
  const configPath = join(ralphDir, "config.json");
  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf-8"))
    : { agent: "claude", maxIterations: 30 };

  const iterations = args[0] ? parseInt(args[0]) : config.maxIterations;

  console.log(chalk.cyan(`\nStarting Ralph with ${AGENTS[config.agent].name}`));
  console.log(chalk.gray(`Max iterations: ${iterations}`));
  console.log(chalk.gray(`Working directory: ${process.cwd()}\n`));

  // Check PRD status
  const prdPath = join(ralphDir, "prd.json");
  if (existsSync(prdPath)) {
    const prd = JSON.parse(readFileSync(prdPath, "utf-8"));
    const total = prd.userStories?.length || 0;
    const done = prd.userStories?.filter((s) => s.passes).length || 0;
    console.log(
      chalk.yellow(`PRD Status: ${done}/${total} stories complete\n`),
    );

    if (total > 0 && done === total) {
      console.log(chalk.green.bold("All stories already complete!"));
      const { continueAnyway } = await inquirer.prompt([
        {
          type: "confirm",
          name: "continueAnyway",
          message: "Continue anyway?",
          default: false,
        },
      ]);
      if (!continueAnyway) return;
    }
  }

  // Check sandy
  const spinner = ora("Checking sandy...").start();
  try {
    execSync("sandy --version", { stdio: "pipe" });
    spinner.succeed("Sandy available");
  } catch {
    spinner.fail("Sandy not found");
    console.log(
      chalk.yellow(
        "\nSandy is required. Install: https://github.com/anthropics/sandy",
      ),
    );
    return;
  }

  console.log(chalk.cyan("\nLaunching in sandy sandbox...\n"));

  const sandyProcess = spawn(
    "sandy",
    ["run", `./.ralph/ralph.sh ${iterations}`],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: true,
    },
  );

  sandyProcess.on("close", (code) => {
    if (code === 0) {
      console.log(chalk.green.bold("\nRalph completed successfully!"));
    } else {
      console.log(chalk.yellow(`\nRalph exited with code ${code}`));
    }
    showStatus();
  });
}

async function showStatus() {
  const ralphDir = join(process.cwd(), ".ralph");

  if (!existsSync(ralphDir)) {
    console.log(chalk.red("Ralph not initialized."));
    return;
  }

  console.log(chalk.bold("\n PRD Status:\n"));

  const prdPath = join(ralphDir, "prd.json");
  if (existsSync(prdPath)) {
    const prd = JSON.parse(readFileSync(prdPath, "utf-8"));

    if (prd.userStories && prd.userStories.length > 0) {
      prd.userStories.forEach((story, i) => {
        const status = story.blocked
          ? chalk.red("⊘")
          : story.passes
            ? chalk.green("✓")
            : chalk.gray("○");
        const priority = chalk.gray(`[P${story.priority || i + 1}]`);
        const branch = story.branch ? chalk.gray(` → ${story.branch}`) : "";
        const pr = story.pullRequest
          ? chalk.cyan(` PR#${story.pullRequest}`)
          : "";
        console.log(
          `  ${status} ${priority} ${story.id}: ${story.title}${branch}${pr}`,
        );
      });

      const total = prd.userStories.length;
      const done = prd.userStories.filter((s) => s.passes).length;
      console.log(
        chalk.bold(
          `\n  Progress: ${done}/${total} (${Math.round((done / total) * 100)}%)\n`,
        ),
      );
    } else {
      console.log(chalk.yellow("  No stories in PRD yet."));
    }
  } else {
    console.log(chalk.yellow("  prd.json not found."));
  }
}

function checkAgentInstalled(agent) {
  try {
    execSync(`which ${AGENTS[agent].command}`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function checkAgentAuth(agent) {
  // Basic check - most agents will prompt if not authed
  try {
    if (agent === "claude") {
      execSync("claude --version", { stdio: "pipe" });
    } else if (agent === "codex") {
      execSync("codex --version", { stdio: "pipe" });
    } else if (agent === "gemini") {
      execSync("gemini --version", { stdio: "pipe" });
    }
    return true;
  } catch {
    return false;
  }
}

function checkGitHubCLI() {
  try {
    execSync("which gh", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function checkGitHubAuth() {
  try {
    execSync("gh auth status", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function checkXgitAvailable() {
  try {
    execSync("which xgit", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

async function createStoryBranch(story, config, baseBranch = "main") {
  const slug = story.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30);

  const branchName = `${story.id}-${slug}`;

  if (config.git?.useXgit) {
    try {
      // xgit b <number> "<description>"
      execSync(`xgit b ${story.ticketId} "${story.title}"`, { stdio: "pipe" });
      return branchName; // xgit creates its own naming
    } catch (err) {
      console.log(chalk.yellow("xgit failed, falling back to git"));
    }
  }

  // Fallback to git
  try {
    execSync(`git checkout ${baseBranch}`, { stdio: "pipe" });
    execSync(`git pull origin ${baseBranch}`, { stdio: "pipe" });
    execSync(`git checkout -b ${branchName}`, { stdio: "pipe" });
    return branchName;
  } catch (err) {
    throw new Error(`Failed to create branch: ${err.message}`);
  }
}

async function createPullRequest(story, config) {
  if (config.git?.provider !== "github" || !config.git?.createPRs) {
    return null;
  }

  const title = `${story.id}: ${story.title}`;
  const closesClause = story.githubIssue ? `Closes #${story.githubIssue}` : "";

  // Determine target branch - if story has dependencies, target their branch
  let targetBranch = "main";
  if (story.dependsOn?.length > 0) {
    // For stacked PRs, target the dependency's branch if available
    // This will be updated by the agent when it has PRD context
  }

  const body = `${closesClause}

## Summary
${story.description}

## Acceptance Criteria
${story.acceptanceCriteria.map((ac) => `- [ ] ${ac}`).join("\n")}
`;

  try {
    // Push branch first
    execSync("git push -u origin HEAD", { stdio: "pipe" });

    // Create PR using gh CLI
    const result = execSync(
      `gh pr create --title "${title.replace(/"/g, '\\"')}" --body "${body.replace(/"/g, '\\"')}" --base ${targetBranch}`,
      { stdio: "pipe" },
    )
      .toString()
      .trim();

    // Extract PR number from URL
    const prMatch = result.match(/\/pull\/(\d+)/);
    return prMatch ? parseInt(prMatch[1]) : null;
  } catch (err) {
    console.log(chalk.yellow(`Failed to create PR: ${err.message}`));
    return null;
  }
}

async function attemptConflictResolution(story, config) {
  try {
    // Try to rebase on main
    execSync("git fetch origin main", { stdio: "pipe" });
    execSync("git rebase origin/main", { stdio: "pipe" });
    return true;
  } catch {
    // Rebase failed - abort and mark blocked
    try {
      execSync("git rebase --abort", { stdio: "pipe" });
    } catch {
      // Already aborted or not in rebase state
    }
    return false;
  }
}

async function ghCheck() {
  const spinner = ora();

  spinner.start("Checking GitHub CLI installation...");
  if (!checkGitHubCLI()) {
    spinner.fail("GitHub CLI (gh) not installed");
    console.log(chalk.yellow("\n  Install: brew install gh\n"));
    return;
  }
  spinner.succeed("GitHub CLI installed");

  spinner.start("Checking authentication...");
  const authed = await checkGitHubAuth();
  if (authed) {
    spinner.succeed("Authenticated with GitHub");

    // Show current user
    try {
      const user = execSync("gh api user --jq .login", { stdio: "pipe" })
        .toString()
        .trim();
      console.log(chalk.gray(`  Logged in as: ${user}`));
    } catch {
      // Ignore errors fetching user info
    }
  } else {
    spinner.fail("Not authenticated");
    console.log(chalk.yellow("\n  Run: gh auth login\n"));
  }
}

async function ghImport(issueNumber) {
  if (!issueNumber) {
    console.log(chalk.red("Usage: ralph gh import <issue-number>"));
    return;
  }

  const ralphDir = join(process.cwd(), ".ralph");
  if (!existsSync(ralphDir)) {
    console.log(chalk.red("Ralph not initialized. Run `ralph init` first."));
    return;
  }

  const configPath = join(ralphDir, "config.json");
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  const prdPath = join(ralphDir, "prd.json");
  const prd = JSON.parse(readFileSync(prdPath, "utf-8"));

  const spinner = ora(`Fetching issue #${issueNumber}...`).start();

  try {
    const issueJson = execSync(
      `gh issue view ${issueNumber} --json number,title,body,labels`,
      { stdio: "pipe" },
    ).toString();
    const issue = JSON.parse(issueJson);

    spinner.succeed(`Found: ${issue.title}`);

    // Determine next story number
    const existingIds = prd.userStories.map((s) => s.ticketId).filter(Boolean);
    const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    const ticketNum = String(nextNum).padStart(3, "0");

    // Check for priority label
    const priorityLabel = issue.labels?.find((l) =>
      l.name.startsWith("priority:"),
    );
    const priority =
      priorityLabel?.name === "priority:high"
        ? 1
        : priorityLabel?.name === "priority:low"
          ? 3
          : 2;

    const newStory = {
      id: `${config.ticketPrefix || "US"}-${ticketNum}`,
      ticketId: nextNum,
      title: issue.title,
      description: issue.body || issue.title,
      acceptanceCriteria: [],
      priority,
      passes: false,
      notes: "",
      githubIssue: issue.number,
      dependsOn: [],
      branch: null,
      pullRequest: null,
      blocked: false,
    };

    prd.userStories.push(newStory);
    writeFileSync(prdPath, JSON.stringify(prd, null, 2));

    console.log(chalk.green(`\nAdded story: ${newStory.id}`));
    console.log(chalk.gray(`  Title: ${newStory.title}`));
    console.log(chalk.gray(`  GitHub Issue: #${issue.number}`));
    console.log(chalk.gray(`  Priority: ${priority}`));
  } catch (err) {
    spinner.fail("Failed to fetch issue");
    console.log(chalk.red(`\n  ${err.message}`));
  }
}

async function ghSync() {
  const ralphDir = join(process.cwd(), ".ralph");
  if (!existsSync(ralphDir)) {
    console.log(chalk.red("Ralph not initialized. Run `ralph init` first."));
    return;
  }

  const { labelFilter } = await inquirer.prompt([
    {
      type: "input",
      name: "labelFilter",
      message: "Filter by label (leave empty for all open issues):",
      default: "",
    },
  ]);

  const spinner = ora("Fetching issues...").start();

  try {
    const args = [
      "issue",
      "list",
      "--state",
      "open",
      "--json",
      "number,title,body,labels",
      "--limit",
      "50",
    ];
    if (labelFilter) {
      args.push("--label", labelFilter);
    }
    const issuesJson = execSync(`gh ${args.join(" ")}`, {
      stdio: "pipe",
    }).toString();
    const issues = JSON.parse(issuesJson);

    spinner.succeed(`Found ${issues.length} issues`);

    if (issues.length === 0) {
      console.log(chalk.yellow("No issues to import."));
      return;
    }

    // Show issues and confirm
    console.log(chalk.bold("\nIssues to import:"));
    issues.forEach((issue) => {
      console.log(chalk.gray(`  #${issue.number}: ${issue.title}`));
    });

    const { confirm } = await inquirer.prompt([
      {
        type: "confirm",
        name: "confirm",
        message: `Import ${issues.length} issues?`,
        default: true,
      },
    ]);

    if (!confirm) {
      console.log(chalk.yellow("Aborted."));
      return;
    }

    // Import each issue
    for (const issue of issues) {
      await ghImport(String(issue.number));
    }

    console.log(chalk.green(`\nImported ${issues.length} issues.`));
  } catch (err) {
    spinner.fail("Failed to fetch issues");
    console.log(chalk.red(`\n  ${err.message}`));
  }
}

function generateRalphScript(agent, maxIterations) {
  const agentConfig = AGENTS[agent];
  const promptFile = agent === "claude" ? "CLAUDE.md" : "prompt.md";

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
  ${
    agent === "claude"
      ? `OUTPUT=$(claude ${agentConfig.dangerousFlag} ${agentConfig.printFlag} < "$PROMPT_FILE" 2>&1 | tee /dev/stderr) || true`
      : agent === "codex"
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

function generatePrompt(agent, config = {}) {
  const gitInstructions =
    config.git?.provider === "github"
      ? `
## Git Workflow (Branch per Story)

Before starting a story:
1. **Check story.branch** - if null, create a new branch
2. **Branch naming**: \`${config.ticketPrefix || "US"}-XXX-kebab-title\`
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
   gh pr create --title "${config.ticketPrefix || "US"}-XXX: Story title" --body "Closes #<githubIssue if set>

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
`
      : `
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

function convertToPRDJson(content, ticketPrefix = "US") {
  const lines = content.split("\n");
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
      const ticketNum = String(storyCount).padStart(3, "0");
      currentStory = {
        id: `${ticketPrefix}-${ticketNum}`,
        ticketId: storyCount,
        title: match[2],
        description: match[2],
        acceptanceCriteria: [],
        priority: storyCount,
        passes: false,
        notes: "",
        // Git-related fields
        githubIssue: null,
        dependsOn: [],
        branch: null,
        pullRequest: null,
        blocked: false,
      };
    } else if (currentStory && trimmed.startsWith("-")) {
      currentStory.acceptanceCriteria.push(trimmed.substring(1).trim());
    }
  }

  if (currentStory) {
    stories.push(currentStory);
  }

  return {
    project: "MyProject",
    branchName: "ralph/feature",
    description: "Feature implementation",
    userStories: stories,
  };
}

function getEmptyPRD(ticketPrefix = "US") {
  return {
    project: "MyProject",
    branchName: "ralph/feature",
    description: "Add your feature description here",
    userStories: [],
  };
}

async function runCompoundReview() {
  const ralphDir = join(process.cwd(), ".ralph");
  const configPath = join(ralphDir, "config.json");

  if (!existsSync(ralphDir)) {
    console.log(chalk.red("Ralph not initialized. Run `ralph init` first."));
    return;
  }

  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf-8"))
    : { agent: "claude" };

  const agent = config.agent;
  const agentConfig = AGENTS[agent];

  console.log(chalk.cyan("\nRunning Compound Review..."));
  console.log(chalk.gray("Extracting learnings from recent sessions\n"));

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
    if (agent === "claude") {
      execSync(
        `echo '${compoundPrompt.replace(/'/g, "\\'")}' | claude --dangerously-skip-permissions --print`,
        {
          cwd: process.cwd(),
          stdio: "inherit",
        },
      );
    } else if (agent === "codex") {
      execSync(`codex --full-auto -q "${compoundPrompt}"`, {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    } else {
      execSync(`gemini -y -p "${compoundPrompt}"`, {
        cwd: process.cwd(),
        stdio: "inherit",
      });
    }
    console.log(chalk.green("\nCompound review complete!"));
  } catch (err) {
    console.log(
      chalk.yellow("\nCompound review finished (check output above)"),
    );
  }
}

async function setupSchedule() {
  console.log(chalk.cyan("\nSetting up nightly automation...\n"));

  const { scheduleType } = await inquirer.prompt([
    {
      type: "list",
      name: "scheduleType",
      message: "What would you like to schedule?",
      choices: [
        { name: "Full nightly loop (compound + run)", value: "full" },
        { name: "Compound review only (extract learnings)", value: "compound" },
        { name: "Run only (execute PRD tasks)", value: "run" },
        { name: "View generated plist files only", value: "view" },
      ],
    },
  ]);

  const { runTime } = await inquirer.prompt([
    {
      type: "input",
      name: "runTime",
      message: "What time should it run? (HH:MM, 24h format)",
      default: "23:00",
      validate: (input) => /^\d{2}:\d{2}$/.test(input) || "Use HH:MM format",
    },
  ]);

  const [hour, minute] = runTime.split(":").map(Number);
  const projectPath = process.cwd();
  const projectName = projectPath.split("/").pop();

  // Generate plist content
  const compoundPlist = generateLaunchdPlist(
    `com.ralph.${projectName}.compound`,
    join(projectPath, "ralph", "compound-review.sh"),
    projectPath,
    hour,
    minute,
    "compound",
  );

  const runPlist = generateLaunchdPlist(
    `com.ralph.${projectName}.run`,
    join(projectPath, "ralph", "ralph.sh"),
    projectPath,
    hour,
    minute + 30, // Run 30 mins after compound
    "run",
  );

  const caffeinatePlist = generateCaffeinatePlist(
    `com.ralph.${projectName}.caffeinate`,
    Math.max(0, hour - 1), // Start 1 hour before
  );

  // Create compound-review.sh script
  const compoundScript = `#!/bin/bash
# Compound Review - Extract learnings from recent sessions
cd "${projectPath}"
ralph compound
`;

  const ralphDir = join(projectPath, "ralph");
  writeFileSync(join(ralphDir, "compound-review.sh"), compoundScript);
  chmodSync(join(ralphDir, "compound-review.sh"), "755");

  // Create logs directory
  mkdirSync(join(projectPath, "logs"), { recursive: true });

  if (scheduleType === "view") {
    console.log(chalk.bold("\nGenerated plist files:\n"));
    console.log(chalk.cyan("=== Compound Review ==="));
    console.log(compoundPlist);
    console.log(chalk.cyan("\n=== Run ==="));
    console.log(runPlist);
    console.log(chalk.cyan("\n=== Caffeinate ==="));
    console.log(caffeinatePlist);
    return;
  }

  // Write plist files
  const launchAgentsDir = join(process.env.HOME, "Library", "LaunchAgents");
  mkdirSync(launchAgentsDir, { recursive: true });

  const files = [];

  if (scheduleType === "full" || scheduleType === "compound") {
    const compoundPath = join(
      launchAgentsDir,
      `com.ralph.${projectName}.compound.plist`,
    );
    writeFileSync(compoundPath, compoundPlist);
    files.push(compoundPath);
  }

  if (scheduleType === "full" || scheduleType === "run") {
    const runPath = join(launchAgentsDir, `com.ralph.${projectName}.run.plist`);
    writeFileSync(runPath, runPlist);
    files.push(runPath);
  }

  // Always add caffeinate
  const caffeinatePath = join(
    launchAgentsDir,
    `com.ralph.${projectName}.caffeinate.plist`,
  );
  writeFileSync(caffeinatePath, caffeinatePlist);
  files.push(caffeinatePath);

  console.log(chalk.green("\nPlist files created:"));
  files.forEach((f) => console.log(chalk.gray(`  ${f}`)));

  const { loadNow } = await inquirer.prompt([
    {
      type: "confirm",
      name: "loadNow",
      message: "Load these schedules now?",
      default: true,
    },
  ]);

  if (loadNow) {
    for (const file of files) {
      try {
        execSync(`launchctl load "${file}"`, { stdio: "pipe" });
        console.log(chalk.green(`  Loaded: ${file.split("/").pop()}`));
      } catch {
        console.log(
          chalk.yellow(`  Already loaded or error: ${file.split("/").pop()}`),
        );
      }
    }
  }

  console.log(chalk.cyan("\nSchedule set! Your agent will run nightly."));
  console.log(chalk.gray("\nTo check status: launchctl list | grep ralph"));
  console.log(chalk.gray("To unload: launchctl unload <plist-path>"));
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
