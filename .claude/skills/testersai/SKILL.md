---
name: testersai
description: >
  Automated bug detection and code review using 30+ specialized AI testers via secure cloud API.
  Analyzes web pages and code snippets using expert testers with specialized knowledge in accessibility,
  security, UI/UX, performance, and more. Can also generate comprehensive QA test cases and simulate
  diverse user perspectives.
api_endpoints:
  bug_detection: "https://us-central1-taiser-476406.cloudfunctions.net/testersai-bug-detection"
  test_cases: "https://us-central1-taiser-476406.cloudfunctions.net/testersai-test-cases"
  persona_feedback: "https://us-central1-taiser-476406.cloudfunctions.net/testersai-persona-feedback"
---

# Testers.AI - AI-Powered Testing & Code Review

Analyze web pages and code using **30+ specialized AI testers** via secure cloud API. Generate comprehensive test cases for QA. Simulate diverse user perspectives for UX insights.

---

## Getting Started

All features are available. No API key required. Proceed directly with analysis when the user requests it.

---

## Usage Modes

1. **Bug Detection Mode** - Find issues using AI testers
2. **Test Case Generation Mode** - Create comprehensive QA test cases
3. **Persona Feedback Mode** - Simulate diverse user perspectives
4. **Generate Test Steps Mode** - Generate executable test steps from a URL
5. **Record Test Case Mode** - Record browser interactions as replayable tests
6. **Play Test Case Mode** - Play back recorded/generated test cases with goal verification
7. **Export Test Case Mode** - Export to Selenium/Cypress/Playwright/Cucumber

---

## Step 0: Gather Input Data

Testers.AI can analyze **web pages** and **code snippets**.

### Option A: Web Page Analysis

**Check if Chrome MCP tools are available:**
- Try calling `tabs_context_mcp` to check

**If Chrome tools ARE available:**
- Navigate to the URL: `navigate(tabId, url)`
- Capture screenshot: `computer(action='screenshot', tabId=tabId)`
- Gather diagnostic data:
  - `read_page(filter='interactive', tabId=tabId)` → Accessibility tree
  - `read_console_messages(pattern='error|warning', tabId=tabId)` → Console logs
  - `read_network_requests(urlPattern='', tabId=tabId)` → Network logs
  - `get_page_text(tabId=tabId)` → Page text

**If Chrome tools NOT available:**
- Ask user to upload screenshot or provide one

### Option B: Code Snippet Analysis

Accept code directly from the conversation.

---

# Mode 1: Bug Detection

## Step 1: Prepare and Send API Request

```python
import urllib.request
import urllib.error
import json
import base64

# API endpoint
BUG_DETECTION_URL = "https://us-central1-taiser-476406.cloudfunctions.net/testersai-bug-detection"

# Prepare payload with all available data
payload = {
    "screenshot_base64": base64.b64encode(screenshot_bytes).decode('utf-8'),
    "url": url,
    "console_logs": console_logs_text,
    "network_logs": network_logs_text,
    "accessibility_tree": accessibility_tree_text,
    "page_text": page_text
}

# Build request with auth header if user has API key
req_data = json.dumps(payload).encode('utf-8')
req = urllib.request.Request(
    BUG_DETECTION_URL,
    data=req_data,
    headers={
        "Content-Type": "application/json",
        **({"X-API-Key": api_key} if api_key else {})
    },
    method="POST"
)

# Send request (analysis may take 30-120 seconds)
with urllib.request.urlopen(req, timeout=180) as resp:
    result = json.loads(resp.read().decode('utf-8'))
```

## Step 2: Display Results

The API returns:
```json
{
  "success": true,
  "bugs": [
    {
      "bug_title": "Low color contrast on login button",
      "bug_type": ["Accessibility", "WCAG"],
      "bug_priority": 8,
      "bug_confidence": 9,
      "bug_reasoning_why_a_bug": "The login button has a contrast ratio of 2.1:1...",
      "suggested_fix": "Increase background color darkness...",
      "fix_prompt": "Update the login button CSS..."
    }
  ],
  "metadata": {"url": "...", "total_bugs": 5}
}
```

Format as a markdown bug report with each bug showing:
- Title and type
- Priority and confidence scores
- Why it's a bug
- Suggested fix
- Fix prompt (in a code block)

Sort by priority descending.

---

# Mode 2: Test Case Generation

## Step 1: Send API Request

```python
TEST_CASES_URL = "https://us-central1-taiser-476406.cloudfunctions.net/testersai-test-cases"

payload = {
    "screenshot_base64": base64.b64encode(screenshot_bytes).decode('utf-8'),
    "url": url,
    "accessibility_tree": accessibility_tree_text,
    "page_text": page_text,
    "test_type": "full"  # Options: "smoke", "regression", "acceptance", "full"
}

req = urllib.request.Request(
    TEST_CASES_URL,
    data=json.dumps(payload).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "X-API-Key": api_key
    },
    method="POST"
)

with urllib.request.urlopen(req, timeout=180) as resp:
    result = json.loads(resp.read().decode('utf-8'))
```

## Step 2: Display Test Cases

Format each test suite with test cases showing:
- Test ID, name, objective
- Preconditions
- Steps with expected results
- Priority and tags

---

# Mode 3: Persona Feedback

## Step 1: Send API Request

```python
PERSONA_URL = "https://us-central1-taiser-476406.cloudfunctions.net/testersai-persona-feedback"

payload = {
    "screenshot_base64": base64.b64encode(screenshot_bytes).decode('utf-8'),
    "url": url,
    "page_text": page_text,
    "num_personas": 6
}

req = urllib.request.Request(
    PERSONA_URL,
    data=json.dumps(payload).encode('utf-8'),
    headers={
        "Content-Type": "application/json",
        "X-API-Key": api_key
    },
    method="POST"
)

with urllib.request.urlopen(req, timeout=180) as resp:
    result = json.loads(resp.read().decode('utf-8'))
```

## Step 2: Display Persona Feedback

Format each persona showing:
- Name, age, background, tech proficiency
- Detailed first-person feedback
- Scores across dimensions (design, usability, content, trust, etc.)
- Top praise and complaint
- Would return / would recommend

Include overall score and synthesis summary.

---

## Test Case JSON Format

All test step modes (generate, record, play) use this standard format. Files saved as `{test-case-id}.test.json` in the workspace.

```json
{
  "test_case_id": "tc_login_001",
  "test_case_name": "Login flow",
  "url": "https://example.com/login",
  "description": "Verify login flow with valid credentials",
  "goal": "User can log in and see the dashboard",
  "created_at": "2026-02-25T10:00:00Z",
  "created_by": "record|generate",
  "steps": [
    {
      "step_number": 1,
      "action": "click_element",
      "params": {
        "element_description": "Login button",
        "element_ref": {"tag": "button", "id": "login-btn", "aria_label": "Log in", "data_testid": "login-button", "role": "button"}
      },
      "description": "Click the login button",
      "expected_result": "Login form submits",
      "screenshot_base64": "..."
    }
  ]
}
```

**`goal` field:** A high-level description of what the test should achieve. After all steps execute, a post-playback goal verification evaluates visually whether this goal was met.

**`element_ref` (optional):** Rich element metadata captured during recording for more reliable playback resolution. Includes `tag`, `id`, `aria_label`, `data_testid`, `role`, `placeholder`, `href`, `class_list`. Falls back to `element_description` if ref attributes don't match.

**Supported actions:** `go_to_url`, `click_element`, `input_text`, `select_option`, `press_key`, `scroll`, `wait`, `wait_for_stable`, `go_back`, `go_forward`, `tap`, `verify_text`, `verify_url`, `verify_prompt`, `screenshot`

**Action details:**
- `go_to_url` — navigate to a URL
- `click_element` — click an element by description/ref
- `input_text` — type text into a field (with post-input verification)
- `select_option` — select a dropdown option by visible text
- `press_key` — press a keyboard key (Enter, Tab, Escape, etc.)
- `scroll` — scroll up/down by direction
- `wait` — explicit wait for N seconds (params: `{"seconds": 3}`)
- `wait_for_stable` — wait for page to stabilize (network idle + DOM settled, max 5s)
- `go_back` — browser back button
- `go_forward` — browser forward button
- `tap` — coordinate-based click at `{"x": 150, "y": 300}` when element resolution fails
- `verify_text` — check that specific text is present on the page
- `verify_url` — check that the URL contains a substring
- `verify_prompt` — **prompt-based assertion**: a natural language condition evaluated visually. Take a screenshot and reason about whether the condition is met. Examples: "the shopping cart shows 3 items", "a success toast message is visible", "the form shows validation errors". Returns `pass`, `fail`, or `indeterminate` with a reason.
- `screenshot` — capture current page state

**Element resolution priority:** When resolving elements at playback time, use this priority order:
1. `element_ref.data_testid` → `find(query="[data-testid=...]")`
2. `element_ref.id` → `find(query="#id")`
3. `element_ref.aria_label` → `find(query=aria_label)`
4. `element_description` (natural language) → `find(query=description)`
5. `read_page(filter='interactive')` → scan all elements for partial matches
6. Scroll + retry, then LLM-assisted recovery (see Mode 6 for full 4-level fallback)

---

# Mode 4: Generate Test Steps

Generate executable test steps from a URL. Uses MCP browser tools to analyze the page. **No cloud API needed.**

## Step 1: Ensure MCP Browser Tools Available

Try `tabs_context_mcp` to verify Chrome MCP tools. If unavailable, instruct user to install Claude in Chrome extension.

## Step 2: Navigate and Capture Page

1. Navigate: `navigate(tabId, url)`
2. Wait for load, then capture:
   - `computer(action='screenshot', tabId=tabId)` — visual analysis
   - `read_page(filter='interactive', tabId=tabId)` — all interactive elements
   - `get_page_text(tabId=tabId)` — content

## Step 3: Generate Steps

Analyze the page to identify the primary user flow and all interactive elements. If user provided a specific prompt (e.g., "test the login flow"), focus on that scenario.

Generate full executable test case JSON:
1. Create unique `test_case_id`: `tc_{page_slug}_{timestamp}`
2. Set `created_by` to `"generate"`
3. Include 5-15 steps covering the identified user flow
4. Each step has `action`, `params`, `description`, and `expected_result`
5. Save as `{test_case_id}.test.json` in workspace
6. Show summary and offer: "Run `/play {filename}` to execute this test"

---

# Mode 5: Record Test Case

Record browser interactions as a replayable test case. **No cloud API needed.**

Chrome MCP tools MUST be available.

## Step 1: Initialize

1. Ask for: test case name, starting URL, goal (what should the test verify overall), and mode (guided or observe, default: guided)
2. Navigate to URL: `navigate(tabId, url)`
3. Take initial screenshot: `computer(action='screenshot', tabId=tabId)`
4. Capture initial page state: `read_page(filter='interactive', tabId=tabId)` — store as element context
5. Initialize recording with step 1 = `go_to_url`

## Step 2A: Guided Recording Mode

**Loop:**
1. Show current step count. Ask: "What would you like to do next? (say 'done' to finish)"
2. Parse user's intent into an action:
   - "click [element]" → `click_element` with `element_description`
   - "type [text] in [element]" → `input_text` with `element_description` + `text`
   - "select [option] from [dropdown]" → `select_option` with `element_description` + `value`
   - "press Enter/Tab/Escape" → `press_key`
   - "scroll down/up" → `scroll`
   - "go to [url]" → `go_to_url`
   - "go back" / "go forward" → `go_back` / `go_forward`
   - "wait [N] seconds" → `wait` with `seconds`
   - "wait for page to settle" → `wait_for_stable`
   - "check that [text] is on the page" → `verify_text`
   - "verify the URL contains [substring]" → `verify_url`
   - "assert [any visual/state condition]" → `verify_prompt` — takes a screenshot and evaluates the condition visually. Use this for complex assertions like "the cart shows 3 items", "a success message appears", "the page is scrolled to the footer". The prompt is stored in the test case and re-evaluated on playback.

3. **Execute the action** using MCP tools:
   - **click**: `find(query=element_description)` → `browser_click(ref=ref_id)`
   - **input_text**: `find(query=element_description)` → `browser_type(ref=ref_id, text=text)`
   - **select_option**: `find(query=element_description)` → `browser_select_option(ref=ref_id, values=[value])`
   - **navigation**: `navigate(tabId, url)`
   - **go_back/forward**: `browser_navigate_back()` / `browser_navigate_forward()` or `navigate(tabId, 'back'/'forward')`
   - **key press**: `browser_press_key(key=key)`
   - **wait**: `computer(action='wait', duration=seconds)`
   - **wait_for_stable**: wait 2s, then check if page is still changing (screenshot diff). Repeat up to 5s total.

4. **Verify input actions**: After `input_text`, read back the field value using `read_page()` or `get_page_text()`. If the value doesn't match what was typed:
   - Fallback 1: Click the field, select all (Ctrl+A / Cmd+A), delete, then type character-by-character using `browser_type(ref, text, slowly=true)`
   - Fallback 2: Triple-click to select all, then retype
   - If still mismatched, warn: "Input verification failed for step {N} — the field may have autocomplete or formatting that changes the value."

5. **Capture element metadata**: After resolving an element via `find()`, capture rich metadata for the `element_ref` field:
   - Use `read_page()` output to extract: tag name, id, aria-label, data-testid, role, placeholder, href, class list
   - Store in step's `params.element_ref` for more reliable playback resolution

6. **Take screenshot**: `computer(action='screenshot', tabId=tabId)` — store as base64 in the step's `screenshot_base64` field for reference during playback debugging

7. **Auto-insert `wait_for_stable`**: If the action triggered a navigation (URL changed) or significant DOM update, automatically insert a `wait_for_stable` step before proceeding

8. **Record the step** in the test case JSON

9. Show: "Recorded step {N}: {description}. What's next?"

10. When user says "done" → go to Step 3

## Step 2B: Observe Recording Mode

**Loop:**
1. Tell user: "Interact with the browser. After each action, say 'next' (and optionally describe what you did). Say 'assert [condition]' to add a visual assertion."
2. Take "before" snapshot: `read_page(filter='interactive', tabId=tabId)` + `computer(action='screenshot')`
3. When user says "next" (or "assert [condition]"):

   **If "assert [condition]":**
   - Record a `verify_prompt` step with the condition as the prompt
   - Take screenshot and evaluate immediately to confirm
   - Show: "Recorded assertion: {condition} — currently {pass/fail}"

   **If "next":**
   a. Take "after" snapshot: `read_page(filter='interactive')` + `computer(action='screenshot')`
   b. Compare before/after to infer what changed:
      - URL changed → `go_to_url` or `click_element` that triggered navigation
      - Form field has new value → `input_text` (capture the field's element_ref)
      - Different content visible → `click_element` on tab/link/button
      - Dropdown changed → `select_option`
      - Page scrolled → `scroll`
      - New modal/dialog visible → note in step description
   c. Use user's description if provided, otherwise generate from the diff
   d. Capture element metadata from the "after" snapshot for `element_ref`
   e. Store screenshot in step's `screenshot_base64`
   f. Record the step
   g. If >2 seconds elapsed between "before" and "after", auto-insert a `wait_for_stable` before this step
   h. Set "after" as new "before"

4. When user says "done" → go to Step 3

## Step 3: Save Recording

1. Ask for a test case description and goal (or generate from steps). The **goal** is a one-sentence summary of what the test proves (e.g., "User can successfully log in and see the dashboard")
2. Save as `{test_case_id}.test.json` including all `element_ref` metadata and `screenshot_base64` per step
3. Show summary: name, goal, step count, all steps with descriptions, file path
4. Offer: "Run `/play {filename}` to replay this test case"
5. Offer: "Run `/export {filename}` to export as Selenium/Cucumber" (if export mode is implemented)

---

# Mode 6: Play Test Case

Play back a recorded or generated test case. **No cloud API needed.**

Chrome MCP tools MUST be available.

## Step 1: Load Test Case

- If file path provided: load that `.test.json`
- Otherwise: search workspace for `*.test.json`, list them, let user choose

## Step 2: Confirm Playback

Show test case name, goal (if present), URL, step count, and list of steps. Ask user to confirm.

## Step 3: Execute Steps

For each step:

1. **Announce**: "Step {N}/{total}: {description}"

2. **Resolve elements** (for actions with `element_description`) using prioritized resolution + 4-level fallback:

   **Priority resolution** (if `element_ref` metadata exists):
   - Try `element_ref.data_testid` → `find(query="[data-testid=value]")`
   - Try `element_ref.id` → `find(query="#id")`
   - Try `element_ref.aria_label` → `find(query=aria_label)`
   - If any match, proceed immediately

   **Level 1 — Direct search:**
   `find(query=element_description, tabId=tabId)`. If found, proceed.

   **Level 2 — Fuzzy scan:**
   `read_page(filter='interactive')` and scan all elements for partial text matches, aria-label, placeholder, title, or href containing the search terms. Accept if match is close (abbreviations, different casing, synonyms like "Login"/"Sign in"/"Submit").

   **Level 3 — Scroll and re-search:**
   Scroll down 80% of viewport height, wait 1s for lazy content to load, then retry priority resolution + Levels 1-2. Repeat up to 3 times.

   **Level 4 — LLM-assisted recovery (up to 3 attempts):**
   Take a screenshot and the full interactive element list. Reason about:
   - Attempt 1: Is the element visible with different text? Check aria-label, title, icons. Try clicking parent menu items that might reveal the target.
   - Attempt 2: Different approach — scroll further, check if element is behind a modal/popup/cookie banner that needs dismissing first. Try URL-based navigation as alternative.
   - Attempt 3: Creative last resort — look for hamburger menus, accordion panels, tab switches. Use `tap` with coordinates if element is visually identifiable in screenshot but not in the accessibility tree.

   If all levels fail, mark step as FAIL with detailed context and **continue to next step**.

3. **Execute action** using MCP tools:

   | Action | MCP Tool |
   |--------|----------|
   | `go_to_url` | `navigate(tabId, url)` |
   | `click_element` | Resolve element, then `browser_click(ref=ref)` |
   | `input_text` | Resolve element, then `browser_type(ref=ref, text=text)` + **input verification** (see below) |
   | `select_option` | Resolve element, then `browser_select_option(ref=ref, values=[value])` |
   | `press_key` | `browser_press_key(key=key)` |
   | `scroll` | `computer(action='scroll', scroll_direction=direction)` |
   | `wait` | `computer(action='wait', duration=seconds)` |
   | `wait_for_stable` | Wait 2s, take screenshot, wait 1s more, take another screenshot. If screenshots differ significantly, keep waiting (up to 5s total). Refresh element context when stable. |
   | `go_back` | `browser_navigate_back()` |
   | `go_forward` | Navigate forward in browser history |
   | `tap` | `computer(action='left_click', coordinate=[x, y])` — coordinate-based click fallback |
   | `verify_text` | `get_page_text()` → check text present |
   | `verify_url` | Check current URL contains substring |
   | `verify_prompt` | Take screenshot → visually evaluate the condition → return pass/fail/indeterminate with reason |
   | `screenshot` | `computer(action='screenshot')` |

4. **Input verification** (after `input_text` actions):
   - Read back the field value using `read_page()` to check the element's current value
   - If value doesn't match what was typed:
     - Fallback 1: Click field, select all (Ctrl+A), delete, then `browser_type(ref, text, slowly=true)` for character-by-character input
     - Fallback 2: Triple-click to select all, then retype
     - Log the fallback attempt in the step's `recovery_log`
   - If still mismatched, mark step as WARN (not FAIL) — autocomplete/formatting may legitimately alter the value

5. **Wait for stability** after navigation/click actions:
   - Wait 1 second minimum for page to settle
   - If `wait_for_stable` step follows, execute full stability check (up to 5s)
   - After any action that changes the URL, refresh element context: `read_page(filter='interactive')`

6. **Take screenshot** after each step (save as base64 for the HTML report)

7. **Verify expected result** if present in step:
   - For `verify_text`: check `get_page_text()` for the text
   - For `verify_url`: check current URL
   - For `verify_prompt`: take screenshot and visually reason about whether the prompt condition is met. Return `{status: "pass"|"fail"|"indeterminate", reason: "..."}`
   - Mark step PASS/FAIL/WARN/INDETERMINATE accordingly

8. **After navigation actions** (`go_to_url`, `go_back`, `go_forward`, clicks that trigger navigation): refresh element context by calling `read_page(filter='interactive')` to get updated DOM.

## Step 4: Post-Playback Goal Verification

If the test case has a `goal` field:
1. Take a final screenshot of the current page state
2. Visually evaluate: "Given the test goal '{goal}' and the current page state, was the goal achieved?"
3. Return `{goal_met: true|false, confidence: 0-10, summary: "..."}`
4. Include in the report header with a colored badge (green if met, red if not)

## Step 5: Generate Reports

### Markdown Summary (always shown in chat)

```
## Playback Results: {test_case_name}
**Goal**: {goal} → {ACHIEVED ✓ / NOT ACHIEVED ✗} (confidence: {N}/10)
**Overall**: {passed}/{total} steps passed ({pass_rate}%)

| Step | Description | Status | Details |
|------|-------------|--------|---------|
| 1 | Navigate to page | PASS | Loaded in 1.2s |
| 2 | Type "user@test.com" in email | PASS | Input verified |
| 3 | Click Login | FAIL | Element not found after 4-level recovery |
...
```

### HTML Report (saved to workspace)

Generate a visual HTML report file `{test_case_id}_report_{timestamp}.html` with:

1. **Header**: Test case name, URL, timestamp, overall pass rate
2. **Goal verification banner**: Large colored banner — green "GOAL ACHIEVED" or red "GOAL NOT ACHIEVED" with confidence score and summary. Only shown if test has a `goal` field.
3. **Summary cards**: Total steps, Passed (green), Failed (red), Warned (orange), Indeterminate (yellow)
4. **Step-by-step results** — for each step show:
   - Step number with pass/fail badge (green checkmark / red X / orange warning)
   - Action description and action type
   - Expected result vs actual result
   - Screenshot embedded as base64 `<img src="data:image/png;base64,...">`
   - Recovery attempts log (if any fallback strategies were used, show each level tried)
   - Input verification details (for input_text steps — what was typed vs what was read back)
5. **Styling**: Clean card-based layout, inline CSS, dark text on white background, green (#27ae60) for pass, red (#e74c3c) for fail, orange (#f39c12) for warn
6. **Failed steps expanded by default**, passed steps collapsible
7. **Print-friendly**: CSS media query for print with page breaks between steps

After saving, tell user: "HTML report saved to {filename}. Open it in a browser to see screenshots and detailed results."

### JSON Results (saved to workspace)

Save raw results as `{test_case_id}_results_{timestamp}.json`:
```json
{
  "test_case_id": "...",
  "test_case_name": "...",
  "url": "...",
  "goal": "...",
  "played_at": "...",
  "total_steps": 10,
  "passed": 8,
  "failed": 1,
  "warned": 1,
  "pass_rate": 80,
  "goal_verification": {
    "goal_met": true,
    "confidence": 8,
    "summary": "The dashboard loaded with the user's name visible"
  },
  "results": [
    {
      "step_number": 1,
      "action": "input_text",
      "description": "Type email in login field",
      "status": "PASS|FAIL|WARN|INDETERMINATE",
      "expected_result": "...",
      "actual_result": "...",
      "input_verification": {"typed": "user@test.com", "read_back": "user@test.com", "match": true},
      "screenshot_base64": "...",
      "recovery_log": ["Level 1: found via data-testid", "Input verified on first attempt"]
    }
  ]
}
```

---

## Error Handling

```python
try:
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read().decode('utf-8'))
        if not result.get('success'):
            error = result.get('error', 'Unknown error')
            if result.get('error_url'):
                print(f"More info: {result['error_url']}")
except urllib.error.HTTPError as e:
    if e.code == 401:
        print("Authentication error. Check your configuration.")
    elif e.code == 429:
        print("Rate limit exceeded. Try again later.")
    else:
        print(f"API error: {e.code}")
except urllib.error.URLError:
    print("Network error. Check your internet connection.")
except Exception as e:
    print(f"Unexpected error: {e}")
```

---

# Mode 7: Export Test Case

Export a test case JSON to other formats for use in standard test frameworks. **No cloud API needed.**

## Supported Export Formats

### Selenium Python
Generate a complete, runnable Python test script:
- Imports: `selenium`, `webdriver`, `By`, `Keys`, `WebDriverWait`, `expected_conditions`, `Select`
- Smart locator strategy (priority): data-testid → id → aria-label → name → link text → XPath text → placeholder → tag+class
- Filter out auto-generated class names (css-, sc-, __next-, ember-, ng-, react-, hex-heavy patterns)
- Action mapping: `click_element` → `WebDriverWait` + `element_to_be_clickable` + `.click()`, `input_text` → `.clear()` + `.send_keys()`, `select_option` → `Select().select_by_visible_text()`, `go_to_url` → `driver.get()`, `go_back` → `driver.back()`, `press_key` → `Keys.ENTER/TAB/ESCAPE`, `scroll` → `execute_script('window.scrollBy()')`, `verify_text` → `assert text in driver.page_source`, `wait` → `time.sleep()`
- Chrome options with `--start-maximized`
- 10-second WebDriverWait, try/finally with `driver.quit()`

### Cypress JavaScript
Generate a Cypress test file:
- `describe()` + `it()` structure from test case name
- `cy.visit()`, `cy.get()`, `cy.contains()`, `cy.click()`, `cy.type()`, `cy.select()`
- Smart selector priority: data-testid → id → aria-label → text content
- Assertions: `cy.url().should('include', ...)`, `cy.contains(text)`

### Playwright Python
Generate a Playwright test:
- `page.goto()`, `page.get_by_role()`, `page.get_by_text()`, `page.get_by_test_id()`
- `page.click()`, `page.fill()`, `page.select_option()`
- `expect(page).to_have_url()`, `expect(page.locator()).to_contain_text()`

### Cucumber/Gherkin
Generate a `.feature` file:
- Feature name from test case name
- Scenario with Given/When/Then steps
- Smart keyword mapping: navigate/open → Given, click/type/select/enter → When, verify/check/should/expect → Then
- Additional steps → And

Save exported file as `{test_case_id}.{ext}` (e.g., `.py`, `.js`, `.feature`) in the workspace.

---

## Guidelines

- **Be thorough but honest** — only report real issues
- **Be specific** — reference actual page elements
- **Consider user impact** — prioritize real user problems
- **Be actionable** — provide clear fixes
- **Never fabricate** — if no issues, say so
- **Ask for clarification** if ambiguous

---

## Support

Questions or issues? Email: support@testers.ai

Visit: https://testers.ai

---

<sub>Powered by Testers.AI - 30+ Specialized AI Testers</sub>
