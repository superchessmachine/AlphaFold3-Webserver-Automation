# AlphaFold3 Webserver Automation

Tools for automating AlphaFold3 webserver tasks: browser console scripts (`manual_console_scripts/`) and a JSON generator (`jsongeneration/`) for building screens and running predictions. There's also `node_automation.js` for Puppeteer-based automation, but it's experimental—use the console scripts for reliable results.

## What's inside
- `manual_console_scripts/startDraftRuns.js` – submits saved drafts automatically (forces the status filter to "Saved draft" only first)
- `manual_console_scripts/startDraftRunsFiltered.js` – same, but also asks for an optional search term and only runs drafts whose title contains it
- `manual_console_scripts/startDraftRunsExperimental.js` – same but waits for confirmation before counting submissions
- `manual_console_scripts/deleteSavedDraftsBySearch.js` – deletes saved drafts whose title contains a required search term
- `manual_console_scripts/downloadPredictions.js` – asks how many to download, then downloads from the top, scrolling to reveal more rows when it can't see enough (pass `0` for all)
- `jsongeneration/generate_screening_json_v1.py` – generates AlphaFold JSON files from your CSV
- `node_automation.js` – Puppeteer automation (experimental)

## How to use
1. Generate JSON files from your CSV
2. Upload to AlphaFold
3. Run console scripts to start predictions and download results

### 1. Generate JSON files

```bash
python jsongeneration/generate_screening_json_v1.py
```

The script prompts you for:
1. Screening chains (auto-named `Chain1`, `Chain2`, etc. if you skip labels)
2. Your CSV path and column names for target IDs and sequences
3. Output path (leave blank for stdout)
4. Entries per file (default is 100, or use smaller numbers like 30 for easier uploads)

Each entry gets a unique seed and is named `<target>_<screeningChain>`.

### 2. Run console scripts (recommended)
These scripts run directly in your browser console—no install needed.

#### `manual_console_scripts/startDraftRuns.js`
1. Open AlphaFold and zoom out to see all drafts you want to submit
2. Open DevTools → Console, paste the file, press Enter
3. Call `startDraftRuns()` with optional count (prompts if you don't specify)
4. Script clicks through **Open draft → Continue and preview job → Confirm and submit job** for each row
5. Increase delays in `options` object if needed for slow connections

#### `manual_console_scripts/startDraftRunsFiltered.js`
Same as `startDraftRuns.js`, but after asking how many to run it asks for an optional search term. Only drafts whose title contains that term get run (leave blank to run any). Call `startDraftRunsFiltered(count, "searchTerm")` to skip the prompts.

#### `manual_console_scripts/startDraftRunsExperimental.js`
Same as above but waits for success/error messages before counting submissions. Stops if AlphaFold reports quota errors.

#### `manual_console_scripts/deleteSavedDraftsBySearch.js`
Paste the script, enter a title search term, and confirm. It forces the table to **Saved draft** only, then deletes matching draft rows. Call `deleteSavedDraftsBySearch("searchTerm")` to skip the prompt.

#### `manual_console_scripts/downloadPredictions.js`
1. Open the predictions table (no need to zoom out—it scrolls for you)
2. Open DevTools → Console, paste the script, press Enter
3. A prompt asks how many to download from the top (pass `0` for all). Or call `downloadPredictions(count, { delayMs })` to skip the prompt and tune the per-row delay (default 500ms)
4. Script clicks **Download** and—like the run scripts—scrolls to reveal more rows when it can't see enough, remembering what it grabbed so reruns pull the next batch

### 3. Node.js automation (experimental)
Puppeteer-based automation. Still in testing—expect bugs.

Usage (Node.js v18+):
1. `npm install puppeteer`
2. `node node_automation.js --url "https://alphafold3.example.com/predictions" --delay 500`
3. Log in if prompted. It asks how many to download (or pass `--count 25`; `--count 0` means all) and scrolls to reveal more rows. Use `--auto-start` to skip the prompt (defaults to all), `--headless` to hide the browser

## Notes
- `downloadPredictions.js` scrolls to reveal more rows on its own; the start-draft scripts still work best with rows already on screen
- Increase delays (750-1000ms) if you have a slow connection
- JSON generator defaults to 100 entries per file, adjust as needed
