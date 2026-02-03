# PRD Management System Implementation Plan

## Overview

Add multi-PRD support to ralph, allowing users to create, store, list, and switch between multiple PRDs over a project's lifecycle.

## Current State Analysis

Currently, ralph stores a single PRD at `.ralph/prd.json`:

- `ralph prd create` → outputs to `.ralph/prd.json`
- `ralph prd load <file>` → overwrites `.ralph/prd.json`
- `ralph status` → reads from `.ralph/prd.json`
- `ralph run` → uses `.ralph/prd.json`
- No history, no naming, no way to manage multiple PRDs

### Key Files:

- `bin/ralph.js:989-1086` - prdCreate/prdLoad functions
- `bin/ralph.js:619-663` - showStatus reads prd.json
- `bin/ralph.js:497-504` - init creates prd.json

## Desired End State

```
.ralph/
  config.json
  progress.txt
  prds/
    dark-mode.json        # Named PRDs
    auth-system.json
    api-refactor.json
  prd.json                # Active PRD (copy of selected)
```

### Commands:

- `ralph prd create` → prompts for name, saves to `.ralph/prds/<name>.json`, sets as active
- `ralph prd load <file>` → prompts for name, saves to `.ralph/prds/<name>.json`, sets as active
- `ralph prd list` → shows all PRDs with status (active, progress)
- `ralph prd use <name>` → switches active PRD
- `ralph prd archive <name>` → moves completed PRD to `.ralph/prds/archive/`

### Verification:

- `ralph prd list` shows multiple PRDs
- `ralph prd use` switches active and `ralph status` reflects change
- Old workflow (`ralph run`, `ralph status`) works unchanged

## What We're NOT Doing

- PRD versioning/history within a single PRD
- PRD templates
- PRD diffing/comparison
- Automatic archival on completion

---

## Phase 1: Directory Structure & Core Functions

### Overview

Set up the prds directory and add helper functions for PRD management.

### Changes Required:

#### 1. Add PRD helper functions

**File**: `bin/ralph.js`
**Location**: After `prdLoad()` function

```javascript
function ensurePrdsDir() {
  const prdsDir = join(process.cwd(), ".ralph", "prds");
  mkdirSync(prdsDir, { recursive: true });
  return prdsDir;
}

function getActivePrdName() {
  const configPath = join(process.cwd(), ".ralph", "config.json");
  if (!existsSync(configPath)) return null;
  const config = JSON.parse(readFileSync(configPath, "utf-8"));
  return config.activePrd || null;
}

function setActivePrd(name) {
  const configPath = join(process.cwd(), ".ralph", "config.json");
  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf-8"))
    : {};
  config.activePrd = name;
  writeFileSync(configPath, JSON.stringify(config, null, 2));

  // Copy to .ralph/prd.json for backwards compatibility
  const prdsDir = join(process.cwd(), ".ralph", "prds");
  const sourcePath = join(prdsDir, `${name}.json`);
  const destPath = join(process.cwd(), ".ralph", "prd.json");
  if (existsSync(sourcePath)) {
    writeFileSync(destPath, readFileSync(sourcePath, "utf-8"));
  }
}

function listPrds() {
  const prdsDir = join(process.cwd(), ".ralph", "prds");
  if (!existsSync(prdsDir)) return [];

  return readdirSync(prdsDir)
    .filter((f) => f.endsWith(".json") && !f.startsWith("."))
    .map((f) => f.replace(".json", ""));
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
```

#### 2. Add `readdirSync` to imports

**File**: `bin/ralph.js`
**Location**: Line 5

```javascript
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  chmodSync,
  readdirSync,
} from "fs";
```

### Success Criteria:

#### Automated Verification:

- [x] `node --check bin/ralph.js` passes

#### Manual Verification:

- [x] N/A - internal functions only

---

## Phase 2: Update prdCreate and prdLoad

### Overview

Modify existing functions to save to prds directory with user-provided names.

### Changes Required:

#### 1. Update `prdCreate()`

**File**: `bin/ralph.js`
**Replace**: Current prdCreate function

```javascript
async function prdCreate() {
  const ralphDir = join(process.cwd(), ".ralph");

  // Check if ralph is initialized
  if (!existsSync(ralphDir)) {
    console.log(chalk.yellow("Ralph not initialized. Initializing first...\n"));
    mkdirSync(ralphDir, { recursive: true });

    const projectName = process.cwd().split("/").pop();
    const ticketPrefix = generateTicketPrefix(projectName);
    const config = {
      agent: "claude",
      maxIterations: 30,
      createdAt: new Date().toISOString(),
      ticketPrefix,
      git: { provider: "none", createPRs: false },
    };
    writeFileSync(
      join(ralphDir, "config.json"),
      JSON.stringify(config, null, 2),
    );
  }

  // Ask for PRD name
  const { prdName } = await inquirer.prompt([
    {
      type: "input",
      name: "prdName",
      message: "PRD name (e.g., dark-mode, auth-system):",
      validate: (input) => input.trim().length > 0 || "Name required",
    },
  ]);

  const slug = slugify(prdName);
  const prdsDir = ensurePrdsDir();
  const prdPath = join(prdsDir, `${slug}.json`);

  // Check if exists
  if (existsSync(prdPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: `PRD "${slug}" already exists. Overwrite?`,
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.yellow("Aborted."));
      return;
    }
  }

  console.log(chalk.cyan(`\nCreating PRD: ${slug}`));
  console.log(chalk.cyan("Launching Claude...\n"));

  // Set as active before launching Claude
  setActivePrd(slug);

  const claudeProcess = spawn(
    "claude",
    [
      "--print",
      `Use the /prd skill to help me create a PRD called "${prdName}". Save it to .ralph/prds/${slug}.json. Guide me through the process step by step.`,
    ],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: true,
    },
  );

  claudeProcess.on("close", (code) => {
    if (code === 0) {
      console.log(chalk.green(`\nPRD "${slug}" created and set as active!`));
      console.log(chalk.gray("  Run `ralph status` to see your stories"));
      console.log(chalk.gray("  Run `ralph prd list` to see all PRDs"));
    }
  });
}
```

#### 2. Update `prdLoad()`

**File**: `bin/ralph.js`
**Replace**: Current prdLoad function

```javascript
async function prdLoad(filePath) {
  if (!filePath) {
    console.log(chalk.red("Usage: ralph prd load <file.md>"));
    return;
  }

  if (!existsSync(filePath)) {
    console.log(chalk.red(`File not found: ${filePath}`));
    return;
  }

  const ralphDir = join(process.cwd(), ".ralph");
  if (!existsSync(ralphDir)) {
    console.log(chalk.yellow("Ralph not initialized. Run `ralph init` first."));
    return;
  }

  // Ask for PRD name
  const defaultName = filePath
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "");
  const { prdName } = await inquirer.prompt([
    {
      type: "input",
      name: "prdName",
      message: "PRD name:",
      default: slugify(defaultName),
      validate: (input) => input.trim().length > 0 || "Name required",
    },
  ]);

  const slug = slugify(prdName);
  const prdsDir = ensurePrdsDir();
  const prdPath = join(prdsDir, `${slug}.json`);

  // Check if exists
  if (existsSync(prdPath)) {
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: `PRD "${slug}" already exists. Overwrite?`,
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log(chalk.yellow("Aborted."));
      return;
    }
  }

  const configPath = join(ralphDir, "config.json");
  const config = existsSync(configPath)
    ? JSON.parse(readFileSync(configPath, "utf-8"))
    : { ticketPrefix: "US" };

  const spinner = ora("Converting PRD to JSON...").start();

  try {
    const content = readFileSync(filePath, "utf-8");
    const prdJson = convertToPRDJson(content, config.ticketPrefix || "US");

    writeFileSync(prdPath, JSON.stringify(prdJson, null, 2));
    setActivePrd(slug);

    spinner.succeed(
      `Loaded ${prdJson.userStories.length} stories as "${slug}"`,
    );

    console.log(chalk.bold("\nStories loaded:"));
    prdJson.userStories.forEach((story) => {
      console.log(chalk.gray(`  ${story.id}: ${story.title}`));
    });

    console.log(chalk.cyan(`\nPRD "${slug}" set as active`));
    console.log(chalk.cyan("Run `ralph status` to see full details"));
  } catch (err) {
    spinner.fail("Failed to convert PRD");
    console.log(chalk.red(`\n  ${err.message}`));
  }
}
```

### Success Criteria:

#### Automated Verification:

- [x] `node --check bin/ralph.js` passes

#### Manual Verification:

- [ ] `ralph prd create` prompts for name and creates in prds/
- [ ] `ralph prd load file.md` prompts for name and creates in prds/
- [ ] Active PRD is set and copied to prd.json

---

## Phase 3: Add prd list and prd use Commands

### Overview

Add commands to list all PRDs and switch between them.

### Changes Required:

#### 1. Add command routing

**File**: `bin/ralph.js`
**Location**: In the prd command routing section

```javascript
  } else if (command === "prd") {
    const subcommand = args[1];
    if (subcommand === "create") {
      await prdCreate();
    } else if (subcommand === "load") {
      await prdLoad(args[2]);
    } else if (subcommand === "list" || subcommand === "ls") {
      await prdList();
    } else if (subcommand === "use") {
      await prdUse(args[2]);
    } else {
      console.log(chalk.yellow("Usage: ralph prd [create|load <file>|list|use <name>]"));
    }
  }
```

#### 2. Add `prdList()` function

**File**: `bin/ralph.js`
**Location**: After prdLoad function

```javascript
async function prdList() {
  const ralphDir = join(process.cwd(), ".ralph");
  if (!existsSync(ralphDir)) {
    console.log(chalk.red("Ralph not initialized. Run `ralph init` first."));
    return;
  }

  const prds = listPrds();
  const activePrd = getActivePrdName();

  if (prds.length === 0) {
    console.log(chalk.yellow("\nNo PRDs found."));
    console.log(chalk.gray("  Create one with: ralph prd create"));
    return;
  }

  console.log(chalk.bold("\n PRDs:\n"));

  for (const prdName of prds) {
    const isActive = prdName === activePrd;
    const prdPath = join(ralphDir, "prds", `${prdName}.json`);
    const prd = JSON.parse(readFileSync(prdPath, "utf-8"));

    const total = prd.userStories?.length || 0;
    const done = prd.userStories?.filter((s) => s.passes).length || 0;
    const progress = total > 0 ? `${done}/${total}` : "empty";

    const marker = isActive ? chalk.green("▶") : " ";
    const name = isActive ? chalk.green.bold(prdName) : prdName;
    const stats = chalk.gray(`[${progress}]`);

    console.log(`  ${marker} ${name} ${stats}`);
  }

  console.log(chalk.gray("\n  Use `ralph prd use <name>` to switch\n"));
}
```

#### 3. Add `prdUse()` function

**File**: `bin/ralph.js`
**Location**: After prdList function

```javascript
async function prdUse(name) {
  if (!name) {
    console.log(chalk.red("Usage: ralph prd use <name>"));
    return;
  }

  const ralphDir = join(process.cwd(), ".ralph");
  if (!existsSync(ralphDir)) {
    console.log(chalk.red("Ralph not initialized. Run `ralph init` first."));
    return;
  }

  const prdsDir = join(ralphDir, "prds");
  const prdPath = join(prdsDir, `${name}.json`);

  if (!existsSync(prdPath)) {
    console.log(chalk.red(`PRD "${name}" not found.`));
    console.log(chalk.gray("  Run `ralph prd list` to see available PRDs"));
    return;
  }

  setActivePrd(name);
  console.log(chalk.green(`\nSwitched to PRD: ${name}`));
  console.log(chalk.gray("  Run `ralph status` to see stories"));
}
```

#### 4. Update help text

**File**: `bin/ralph.js`
**Location**: In showHelp function

```javascript
  ${chalk.cyan("prd create")}        Create PRD interactively (launches Claude)
  ${chalk.cyan("prd load")} <file>   Load PRD from markdown file
  ${chalk.cyan("prd list")}          List all PRDs
  ${chalk.cyan("prd use")} <name>    Switch active PRD
```

### Success Criteria:

#### Automated Verification:

- [x] `node --check bin/ralph.js` passes
- [x] `node bin/ralph.js help` shows new prd commands

#### Manual Verification:

- [ ] `ralph prd list` shows all PRDs with active marker
- [ ] `ralph prd use <name>` switches active PRD
- [ ] `ralph status` shows the newly active PRD's stories

---

## Phase 4: Sync Active PRD on Changes

### Overview

Ensure that when the active PRD is modified (stories marked complete), changes are saved back to the prds directory.

### Changes Required:

#### 1. Update the /prd skill instructions

**File**: `skills/prd/SKILL.md`
**Update**: The output section to use prds directory

Change references from `.ralph/prd.json` to `.ralph/prds/<name>.json` and note to also update `.ralph/prd.json`.

#### 2. Update generatePrompt to reference prds

**File**: `bin/ralph.js`
**In generatePrompt function**: Update instructions to maintain both files

Add note that ralph maintains prd.json as active copy, but the source of truth is in prds/.

### Success Criteria:

#### Automated Verification:

- [x] `node --check bin/ralph.js` passes

#### Manual Verification:

- [ ] Running `ralph run` and completing a story updates both prd.json and prds/<active>.json
- [ ] `ralph prd list` shows updated progress

---

## Testing Strategy

### Manual Testing Steps:

1. `ralph init` in fresh project
2. `ralph prd create` → name it "feature-one" → creates `.ralph/prds/feature-one.json`
3. `ralph prd create` → name it "feature-two" → creates `.ralph/prds/feature-two.json`
4. `ralph prd list` → shows both, feature-two active
5. `ralph prd use feature-one` → switches active
6. `ralph status` → shows feature-one stories
7. `ralph prd list` → shows feature-one as active

---

## Migration Notes

Existing projects with `.ralph/prd.json`:

- Will continue to work (backwards compatible)
- On first `ralph prd create`, the prds/ dir is created
- Existing prd.json could be migrated with `ralph prd load .ralph/prd.json`

---

## References

- Current prd functions: `bin/ralph.js:989-1086`
- Status display: `bin/ralph.js:619-663`
- PRD skill: `skills/prd/SKILL.md`
