---
description: Find bugs on a web page or in code using 30+ AI testers
argument-hint: [url-or-description]
---

Run TestersAI in Bug Detection mode. Load the testersai skill first.

If $ARGUMENTS contains a URL, navigate to that URL using Chrome MCP tools, capture a screenshot, and gather diagnostic data (console logs, network requests, accessibility tree). Then run all applicable specialized testers against the page.

If $ARGUMENTS contains code or a file path, analyze the code directly with the relevant testers.

If no arguments are provided, ask the user what they want to check.

Generate a prioritized bug report with findings from each tester, sorted by severity. Include fix prompts for each issue found.
