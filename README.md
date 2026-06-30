# AlphaFold3 Webserver Automation

The AlphaFold3 server is fine until you have a hundred predictions to set up and submit by hand. These scripts do the clicking for you.

There are two pieces: a Python script that turns a CSV into AlphaFold JSON files, and a few browser console scripts that drive the website itself (start drafts, download results, clean up). There's also a Puppeteer version, `node_automation.js`, but it's flaky and I mostly use the console scripts. Stick with those.

## The workflow

1. Make JSON files from your CSV.
2. Upload them to AlphaFold and save as drafts.
3. Run the console scripts to submit the drafts, then later to download the results.

## Generating JSON

```bash
python jsongeneration/generate_screening_json_v1.py
```

It asks a few questions: which screening chains to include (skip the labels and they become Chain1, Chain2, and so on), the path to your CSV plus which columns hold the target IDs and sequences, where to write the output (blank just prints to the terminal), and how many entries to pack into each file. The default is 100 per file; if uploads keep choking, drop it to 30 or so.

Every entry gets its own random seed and is named `<target>_<screeningChain>`.

## The console scripts

These run straight in the browser, nothing to install. The routine is the same for all of them: open the AlphaFold tab, open DevTools and go to the Console, paste a script, hit Enter, then call its function.

### startDraftRuns.js

Submits your saved drafts one after another. It first flips the status filter to show only "Saved draft", then for each row it clicks through Open draft, Continue and preview job, and Confirm and submit job.

Zoom out first so all the drafts you want are on screen, then call `startDraftRuns()`. It'll ask how many to submit if you don't pass a number. On a slow connection, bump up the delays in the options object.

### startDraftRunsFiltered.js

Same idea, but it also asks for a search term and only submits drafts whose title contains it. Useful when your list is a mix and you only want to run part of it. Call `startDraftRunsFiltered(count, "searchTerm")` to skip both prompts; leave the term blank to run everything.

### startDraftRunsExperimental.js

Same again, except it waits for the success or error message before counting a submission, and it stops if AlphaFold starts complaining about quota. Slower, but less likely to overshoot.

### deleteSavedDraftsBySearch.js

Cleanup. Give it a title search term, confirm, and it deletes every saved draft that matches. It forces the table to Saved draft only first, so you won't touch anything you've already submitted. `deleteSavedDraftsBySearch("searchTerm")` skips the prompt. The search term is required here on purpose, so you don't wipe the whole list by accident.

### downloadPredictions.js

Downloads finished predictions from the top of the list. No need to zoom out; it scrolls the table itself as it goes and remembers what it already grabbed, so running it again picks up where it left off. It asks how many to download (0 means all), or call `downloadPredictions(count, { delayMs })` to set the count and the per-row delay (500ms by default).

## The Puppeteer script (experimental)

If you really want headless automation, `node_automation.js` is there. It's still rough.

```bash
npm install puppeteer
node node_automation.js --url "https://alphafold3.example.com/predictions" --delay 500
```

Log in when the browser pops up. It asks how many predictions to download, or pass `--count 25` (`--count 0` for all). `--auto-start` skips the prompt and grabs everything, `--headless` hides the window. Needs Node 18 or newer.

## A few things worth knowing

- The download script scrolls on its own. The start-draft scripts don't, so get your draft rows on screen before running them.
- Slow connection? Push the delays up to 750-1000ms.
- The JSON generator defaults to 100 entries per file. Smaller files upload more reliably.
