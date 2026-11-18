---
description: Play back a recorded or generated test case
argument-hint: [test-case-file.test.json]
---

Run Testers.AI in Play Test Case mode. Load the testersai skill first.

Chrome MCP browser tools are required. If not available, instruct user to install Claude in Chrome.

If $ARGUMENTS specifies a file path, load that test case JSON. Otherwise, search the workspace for *.test.json files and list them for the user to choose from.

Execute each step, take screenshots, verify results, and report pass/fail summary.
