# AlphaFold3 Webserver Automation Suite

The pieces in this repo are the battle-tested workflow we rely on today: paste-in browser helpers (`manual_console_scripts/`) and the screening JSON generator (`jsongeneration/`). They cover everything from building a screen, to generating upload-ready JSON, to kicking off as many predictions as your daily quota allows. `node_automation.js` is available too, but it is still experimental—stick to the manual scripts if you need something that already works end-to-end.

## Repository map
- `manual_console_scripts/startDraftRuns.js` – submits saved drafts so you can chew through daily quotas hands-free.
- `manual_console_scripts/startDraftRunsExperimental.js` – experimental variant that only counts confirmed submissions toward the requested total.
- `manual_console_scripts/downloadPredictions.js` – clicks **Download** for every visible prediction row.
- `jsongeneration/generate_screening_json_v1.py` – interactive helper that builds AlphaFold-ready JSON (and can auto-split into multiple files).
- `node_automation.js` – Puppeteer runner that opens the prediction table and downloads rows for you; use only if you are exploring experimental automation.

## Typical workflow
1. Generate JSON for your screen (`jsongeneration/`).
2. Upload the batches to AlphaFold.
3. Use the manual console helpers to start new predictions each day and download the results.

### 1. Generate screening JSON
Use Python 3.9+ to run the helper:

```bash
python jsongeneration/generate_screening_json_v1.py
```

The script walks you through:
1. Pasting one or more screening chains (it validates that at least one is provided and auto-names them `Chain1`, `Chain2`, ... if you skip the label).
2. Pointing at your CSV plus the header names that hold the target identifiers and sequences. Empty sequence rows are skipped automatically.
3. Picking where the output should go (leave blank to print to stdout, or give a file path to create JSON files).
4. Choosing how many entries should live in each JSON file. Press Enter to keep the proven `100`-entry default, or type a different number (for example `30`) if you want smaller batches for the web uploader.

Each entry gets a unique nine-digit model seed and is named `<target>_<screeningChain>`, which keeps things predictable once you start the jobs.

### 2. Run jobs with the manual console scripts (recommended path)
These scripts are what we use daily and they are exercised regularly. They work entirely inside the AlphaFold web UI—no install required beyond your browser.

#### `manual_console_scripts/startDraftRuns.js`
1. Open the AlphaFold page that lists your drafts/predictions and zoom out so the rows you care about are visible.
2. Open DevTools → Console, paste the entire file, and press Enter.
3. Call `startDraftRuns()` (optionally pass the number of drafts to start). If you omit the count, a prompt asks how many runs to submit from the top.
4. The helper opens each row’s menu, walks through **Open draft → Continue and preview job → Confirm and submit job**, and tracks jobs it already started this session so you can rerun it to keep chewing through the queue every day.
5. Adjust the delay options in the `options` object if your connection is slow (e.g., higher `rowDelayMs` to respect rate limits).

#### `manual_console_scripts/startDraftRunsExperimental.js`
This variant is opt-in for when you want to make sure “10” means *ten actual submissions*. It uses the same flow as the proven helper but keeps looping until it observes the requested number of successful starts (it looks for success/error snackbars instead of assuming the click worked). If AlphaFold reports a quota/limit error the script stops early so you can decide what to do next.

#### `manual_console_scripts/downloadPredictions.js`
1. Stay on the AlphaFold predictions table with every job you want already visible (zoom out if needed).
2. Open DevTools → Console, paste the script, and press Enter.
3. Optionally call `downloadPredictions(delayMs)` with a custom delay (defaults to `500` ms between rows) if some downloads are skipped.
4. The helper opens each three-dot menu and clicks **Download** so you can grab everything that finished in one pass.

### 3. Experimental Node.js automation
`node_automation.js` uses Puppeteer to click through the prediction table outside the browser console flow. It is still experimental and not part of the proven daily runbook yet—expect to debug it yourself.

Usage (Node.js v18+):
1. Install dependencies once: `npm install puppeteer`.
2. Run `node node_automation.js --url "https://alphafold3.example.com/predictions" --delay 500`.
3. Log in manually if prompted, then press Enter when ready. `--auto-start` skips the Enter prompt, and `--headless` hides Chrome.

## Notes
- All helpers operate only on the rows currently visible in the AlphaFold UI. Make sure you scroll/zoom so everything you want to touch is on screen.
- If the UI feels sluggish, increase the delays in the scripts (750–1000 ms usually works well on slower machines).
- The JSON generator now prompts for the chunk size after you pick an output path—press Enter to keep the 100-entry default, or type any positive integer to split into smaller files that upload faster.
