# AlphaFold3 Webserver Automation Suite

Two lightweight ways to trigger AlphaFold3 downloads automatically. The browser-console snippet keeps the original copy/paste workflow, and the Node.js helper opens the page and clicks through every row for you.

## What this suite is for
- Generate AlphaFold JSON files from UniProt IDs or sequences (suite scope)
- Upload jobs automatically (suite scope)
- Schedule daily quotas or fixed batch runs (suite scope)
- Download all completed predictions at once (implemented here)

## Method 1: Browser console (no install)
1. Open the AlphaFold page that lists your predictions and zoom out so every target you want is visible.
2. Open DevTools → Console and paste the contents of `manual_console_scripts/downloadPredictions.js`.
3. Optionally change the `delayMs` argument in `downloadPredictions(delayMs)` if downloads are skipped; default is `500` ms between rows.
4. Press Enter. The script opens the three-dot menu for each row and clicks **Download**.

## Method 2: Node.js automation (go to URL and run)
1. Install Node.js (v18+) and then install Puppeteer once: `npm install puppeteer`.
2. Run the helper, pointing at the page that lists your predictions:
   - `node node_automation.js --url "https://alphafold3.example.com/predictions" --delay 500`
3. Log in if prompted and navigate to the predictions table.
4. Press Enter when prompted to start downloads. Use `--auto-start` to skip the prompt or `--headless` to hide the browser.

## JSON generation helper
Use `jsongeneration/generate_screening_json.py` to build AlphaFold-ready JSON payloads that pair your fixed screening chains with every target sequence in a CSV.

1. Run the script with Python 3.9+: `python jsongeneration/generate_screening_json.py`.
2. Paste each screening chain sequence when prompted. Provide an optional label (default `Chain1`, `Chain2`, ...). Press Enter on an empty prompt to finish entering chains.
3. Provide the CSV path plus the column headers that contain the target names and sequences. The script validates headers and skips rows with empty sequences.
4. Choose whether to print the JSON to stdout (press Enter) or save it to a file by entering a destination path. Every JSON entry uses a random 9-digit model seed and is named `<csv name>_<chain name>`.

## Notes
- Both methods operate only on the currently visible prediction table and click the existing **Download** action—no extra steps are performed.
- If downloads stall on slower connections, increase the delay (e.g., `750`–`1000` ms).
- Manual console scripts in `manual_console_scripts/` are exercised and verified today; the Node.js runner is provided for convenience but not yet fully tested.
- Keep this repository handy as more automation (JSON generation, uploads, scheduling) gets added to round out the full suite.
