// Browser-console helper for opening saved drafts and submitting jobs.
// Usage: paste into the AlphaFold page DevTools console, then call
// startDraftRuns(desiredRunCount?). If no count is provided a prompt will ask.
async function startDraftRuns(desiredRuns, options = {}) {
    const defaultOptions = {
        rowDelayMs: 1200,
        menuDelayMs: 400,
        dialogDelayMs: 600,
        overlayTimeoutMs: 10000,
        overlayPollMs: 120
    };
    const config = { ...defaultOptions, ...options };
    const normalize = (text = '') => text.replace(/\s+/g, ' ').trim().toLowerCase();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const labelOpenDraft = 'Open draft';
    const labelContinue = 'Continue and preview job';
    const labelConfirm = 'Confirm and submit job';

    let runLimit = Number(desiredRuns);
    if (!Number.isFinite(runLimit) || runLimit <= 0) {
        const response = prompt('How many drafts should be started from the top?', '1');
        runLimit = Number(response);
    }
    if (!Number.isFinite(runLimit) || runLimit <= 0) {
        console.log('No runs requested. Aborting.');
        return;
    }

    const rows = Array.from(document.querySelectorAll('tr.mat-mdc-row'));
    if (rows.length === 0) {
        console.log('No prediction rows found on the page.');
        return;
    }

    const initializeGlobalNameSet = () => {
        const existing = window.__afStartedPredictions;
        if (existing instanceof Set) {
            return existing;
        }
        const hydrated = Array.isArray(existing) ? new Set(existing) : new Set();
        window.__afStartedPredictions = hydrated;
        return hydrated;
    };

    const startedNames = initializeGlobalNameSet();
    const startedThisRun = [];

    const waitForElement = (resolver) => new Promise((resolve, reject) => {
        const start = performance.now();
        const lookup = () => {
            const element = typeof resolver === 'string' ? document.querySelector(resolver) : resolver();
            if (element) {
                resolve(element);
                return;
            }
            if (performance.now() - start > config.overlayTimeoutMs) {
                reject(new Error('Timed out waiting for element.'));
                return;
            }
            setTimeout(lookup, config.overlayPollMs);
        };
        lookup();
    });

    const findMenuButtonByLabel = (label) => {
        const target = normalize(label);
        const menuButtons = Array.from(document.querySelectorAll('button.mat-mdc-menu-item'));
        const buttonMatch = menuButtons.find((btn) => normalize(btn.textContent) === target);
        if (buttonMatch) {
            return buttonMatch;
        }
        const spans = Array.from(document.querySelectorAll('span.mat-mdc-menu-item-text'));
        const spanMatch = spans.find((span) => normalize(span.textContent) === target);
        return spanMatch ? spanMatch.closest('button') ?? spanMatch : null;
    };

    const findButtonByLabel = (label) => {
        const target = normalize(label);
        return Array.from(document.querySelectorAll('button')).find(
            (btn) => normalize(btn.textContent) === target && !btn.disabled
        );
    };

    let startedRuns = 0;
    for (let index = 0; index < rows.length && startedRuns < runLimit; index += 1) {
        const row = rows[index];
        const nameCell = row.querySelector('.cdk-column-name, .mat-column-name');
        const jobName = nameCell ? nameCell.textContent.trim() : `Row ${index + 1}`;

        if (!jobName) {
            console.log(`Skipping row ${index + 1}: no job name.`);
            continue;
        }
        if (startedNames.has(jobName)) {
            console.log(`Skipping ${jobName} because it was already started earlier.`);
            continue;
        }

        const menuButton = row.querySelector('button.mat-mdc-menu-trigger');
        if (!menuButton) {
            console.log(`Skipping ${jobName}: menu trigger not found.`);
            continue;
        }

        console.log(`Opening draft menu for ${jobName}...`);
        menuButton.click();
        await wait(config.menuDelayMs);

        const openDraftButton = findMenuButtonByLabel(labelOpenDraft);
        if (!openDraftButton) {
            console.log(`Open draft action not found for ${jobName}.`);
            continue;
        }

        openDraftButton.click();
        await wait(config.dialogDelayMs);

        try {
            const continueButton = await waitForElement(
                () => document.querySelector('button.create-request') || findButtonByLabel(labelContinue)
            );
            continueButton.click();
            await wait(config.dialogDelayMs);
        } catch (error) {
            console.log(`Failed to click "${labelContinue}" for ${jobName}: ${error.message}`);
            continue;
        }

        try {
            const confirmButton = await waitForElement(
                () => document.querySelector('button.confirm') || findButtonByLabel(labelConfirm)
            );
            confirmButton.click();
            startedRuns += 1;
            startedNames.add(jobName);
            startedThisRun.push(jobName);
            console.log(`Submitted ${jobName} (${startedRuns}/${runLimit}).`);
        } catch (error) {
            console.log(`Failed to click "${labelConfirm}" for ${jobName}: ${error.message}`);
            continue;
        }

        await wait(config.rowDelayMs);
    }

    if (startedThisRun.length === 0) {
        console.log('No jobs were submitted during this run.');
    } else {
        console.log(`Started ${startedThisRun.length} jobs: ${startedThisRun.join(', ')}`);
    }
}

startDraftRuns();
