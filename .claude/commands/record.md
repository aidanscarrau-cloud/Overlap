---
description: Record browser interactions as a replayable test case
argument-hint: <url> [guided|observe]
---

Run Testers.AI in Record Test Case mode. Load the testersai skill first.

Chrome MCP browser tools are required. If not available, instruct user to install Claude in Chrome.

Two recording modes:
- **guided** (default): Claude asks what to do next, user describes each step, Claude executes and records
- **observe**: User interacts with browser directly, says "next" after each action, Claude infers and records

If $ARGUMENTS contains a URL, navigate to it. If a mode is specified (guided/observe), use it.
