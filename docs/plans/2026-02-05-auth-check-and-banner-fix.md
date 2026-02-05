# Auth Check, Streaming Output & Banner Color Fix

## Overview

Three fixes for `ralph run`:

1. Add auth check before launching the sandy loop so we don't waste iterations on auth failures
2. Stream Claude's output so the user can see what's happening during each iteration
3. Fix the banner appearing white in sandy's terminal (no ANSI true color support)

## Current State Analysis

### Auth issue:

- `runRalph()` at `bin/ralph.js:559` checks sandy but NOT agent auth
- `generateRalphScript()` at `bin/ralph.js:1319` generates `ralph.sh` which loops and calls `claude --dangerously-skip-permissions --print`
- If Claude isn't authenticated inside sandy, every iteration fails with "Invalid API key" and the loop keeps going
- The `|| true` on line 1356 means auth failures never break the loop

### No visible output issue:

- In `ralph.sh` line 1356, the claude command runs as:
  `OUTPUT=$(claude --dangerously-skip-permissions --print < "$PROMPT_FILE" 2>&1 | tee /dev/stderr) || true`
- The `$()` subshell captures stdout. `tee /dev/stderr` should stream to stderr, but `--print` mode may buffer until completion
- Result: user sees a blank screen with a cursor for potentially minutes with zero feedback
- The user has no way to know if Ralph is working, stuck, or erroring

### Banner issue:

- `ralph.sh` uses plain `echo` for the banner (line 1337-1339) - no color at all, so it's white
- The Node banner uses `chalk.rgb()` true color which may also not work in sandy's pty

## Desired End State

### Auth:

- Before launching sandy loop, verify agent auth works
- If not authed, show clear instructions and exit
- Don't retry in a loop burning iterations

### Output:

- Claude's output streams in real-time so the user can see what's happening
- Output is still captured for the completion signal check

### Banner:

- `ralph.sh` banner should have color using basic ANSI escape codes (widely supported)

## What We're NOT Doing

- Auto-authenticating Claude inside sandy (the user needs to do this themselves outside sandy)
- Changing the Node-side gradient banner (that works fine in normal terminals)
- Adding a full TUI/progress bar (just stream the raw agent output)

---

## Phase 1: Add Auth Check in runRalph

### Overview

Check agent authentication before launching the sandy loop. If auth fails, show instructions and bail out.

### Changes Required:

#### 1. Add auth check before sandy launch

**File**: `bin/ralph.js`
**Location**: In `runRalph()`, after the sandy check (~line 607) and before "Launching in sandy sandbox..."

```javascript
// Check agent auth before launching loop
spinner.start(`Checking ${AGENTS[config.agent].name} authentication...`);
const isAuthed = await checkAgentAuth(config.agent);
if (!isAuthed) {
  spinner.fail(`${AGENTS[config.agent].name} not authenticated`);
  console.log(chalk.yellow(`\n  Please authenticate first:`));
  if (config.agent === "claude") {
    console.log(chalk.white("  claude /login"));
  } else if (config.agent === "codex") {
    console.log(chalk.white("  codex auth"));
  } else {
    console.log(chalk.white("  gemini auth"));
  }
  console.log(chalk.gray("\n  Then retry: ralph run\n"));
  return;
}
spinner.succeed(`${AGENTS[config.agent].name} authenticated`);
```

#### 2. Add auth failure detection in ralph.sh

**File**: `bin/ralph.js`
**Location**: In `generateRalphScript()`, after the agent run command, before the completion check

Add a check in the bash loop so that if the output contains auth error indicators, the script exits instead of retrying:

```bash
  # Check for auth errors - don't retry
  if echo "$OUTPUT" | grep -qi "invalid api key\|please run /login\|not authenticated\|unauthorized"; then
    echo ""
    echo "Authentication failed. Please authenticate your agent first:"
    echo "  claude /login"
    echo ""
    echo "Then retry: ralph run"
    exit 1
  fi
```

### Success Criteria:

#### Automated Verification:

- [x] `node --check bin/ralph.js` passes

#### Manual Verification:

- [ ] `ralph run` with unauthenticated Claude shows error and exits
- [ ] `ralph run` with authenticated Claude proceeds normally

---

## Phase 2: Fix Banner Colors in ralph.sh

### Overview

Add ANSI color codes to the banner in `ralph.sh` so it's not plain white in sandy.

### Changes Required:

#### 1. Use ANSI escape codes for banner

**File**: `bin/ralph.js`
**Location**: In `generateRalphScript()`, replace the plain echo banner

Use basic ANSI color codes (256-color mode, widely supported) instead of plain echo:

```bash
echo ""
echo -e "\\033[1;33m╦═╗╔═╗╦  ╔═╗╦ ╦\\033[0m  \\033[1;31m╦ ╦╦╔═╗╔═╗╦ ╦╔╦╗\\033[0m"
echo -e "\\033[1;33m╠╦╝╠═╣║  ╠═╝╠═╣\\033[0m  \\033[1;31m║║║║║ ╦║ ╦║ ║║║║\\033[0m"
echo -e "\\033[1;33m╩╚═╩ ╩╩═╝╩  ╩ ╩\\033[0m  \\033[1;31m╚╩╝╩╚═╝╚═╝╚═╝╩ ╩\\033[0m"
echo ""
```

Uses yellow (33) for RALPH and red (31) for WIGGUM - basic ANSI that works everywhere.

### Success Criteria:

#### Automated Verification:

- [x] `node --check bin/ralph.js` passes

#### Manual Verification:

- [ ] `ralph run` inside sandy shows colored banner (yellow + red)

---

## Phase 3: Stream Agent Output During Iterations

### Overview

Change the bash script so Claude's output streams to the terminal in real-time instead of being silently captured until completion.

### Problem

Current command:

```bash
OUTPUT=$(claude --dangerously-skip-permissions --print < "$PROMPT_FILE" 2>&1 | tee /dev/stderr) || true
```

The `$()` subshell captures stdout. The `tee /dev/stderr` attempts to stream via stderr, but in practice the user sees nothing - just a blinking cursor for minutes.

### Changes Required:

#### 1. Write output to a temp file while streaming to terminal

**File**: `bin/ralph.js`
**Location**: In `generateRalphScript()`, replace the agent run command

Instead of capturing in a subshell, write to a temp file while streaming directly to stdout:

```bash
  # Run the agent - stream output live, capture to file for checks
  OUTPUT_FILE=$(mktemp)
  claude ${agentConfig.dangerousFlag} ${agentConfig.printFlag} < "$PROMPT_FILE" 2>&1 | tee "$OUTPUT_FILE" || true
  OUTPUT=$(cat "$OUTPUT_FILE")
  rm -f "$OUTPUT_FILE"
```

This way:

- `tee "$OUTPUT_FILE"` writes to the file AND streams to stdout (visible to user)
- After completion, read the file into `$OUTPUT` for the completion/auth checks
- Clean up the temp file

Do the same pattern for codex and gemini agents.

### Success Criteria:

#### Automated Verification:

- [x] `node --check bin/ralph.js` passes

#### Manual Verification:

- [ ] `ralph run` shows Claude's output streaming in real-time
- [ ] Completion signal (`<promise>COMPLETE</promise>`) still detected
- [ ] Auth error detection from Phase 1 still works

---

## References

- `runRalph()`: `bin/ralph.js:559-630`
- `checkAgentAuth()`: `bin/ralph.js:686-700`
- `generateRalphScript()`: `bin/ralph.js:1319-1380`
