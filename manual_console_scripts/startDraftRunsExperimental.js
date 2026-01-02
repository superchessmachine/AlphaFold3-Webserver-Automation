// Experimental browser-console helper that keeps going until N jobs
// report a successful submission. Paste into the AlphaFold drafts page
// DevTools console and call startDraftRunsExperimental(desiredCount?).
async function startDraftRunsExperimental(desiredRuns, options = {}) {
    const defaultOptions = {
        rowDelayMs: 1200,
        menuDelayMs: 400,
        dialogDelayMs: 600,
        overlayTimeoutMs: 10000,
        overlayPollMs: 120,
        resultTimeoutMs: 8000,
        idleDelayMs: 1500,
        maxIdleCycles: 2,
        rowRetryLimit: 2
    };
    const config = { ...defaultOptions, ...options };

    const normalize = (text = '') => text.replace(/\s+/g, ' ').trim().toLowerCase();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const labelOpenDraft = 'Open draft';
    const labelContinue = 'Continue and preview job';
    const labelConfirm = 'Confirm and submit job';

    let runLimit = Number(desiredRuns);
    if (!Number.isFinite(runLimit) || runLimit <= 0) {
        const response = prompt('How many drafts should be started successfully?', '1');
        runLimit = Number(response);
    }
    if (!Number.isFinite(runLimit) || runLimit <= 0) {
        console.log('No runs requested. Aborting.');
        return;
    }

    const rowsExist = () => document.querySelectorAll('tr.mat-mdc-row').length > 0;
    if (!rowsExist()) {
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
    const failureCounts = new Map();
    const successfulNames = [];

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

    const gatherLiveMessages = () => {
        const candidates = [
            ...document.querySelectorAll('.mat-mdc-snack-bar-container .mdc-snackbar__label'),
            ...document.querySelectorAll('[role="alert"]'),
            ...document.querySelectorAll('[aria-live="assertive"], [aria-live="polite"]')
        ];
        return candidates
            .map((node) => normalize(node.textContent))
            .filter((text) => text && !text.includes('confirm and submit job'));
    };

    const classifyMessage = (message) => {
        const successTokens = ['job submitted', 'prediction submitted', 'prediction started', 'successfully submitted', 'queued'];
        const fatalTokens = ['quota', 'limit', 'not allowed', 'exceeded', 'too many', 'max number'];
        const failureTokens = ['failed', 'error', 'try again', 'unable', 'duplicate', 'already running', 'conflict'];
        if (successTokens.some((token) => message.includes(token))) {
            return 'success';
        }
        if (fatalTokens.some((token) => message.includes(token))) {
            return 'fatal';
        }
        if (failureTokens.some((token) => message.includes(token))) {
            return 'failure';
        }
        return 'unknown';
    };

    const waitForSubmissionOutcome = async (jobName) => {
        const start = performance.now();
        const seenMessages = new Set();
        let dialogClosed = false;

        while (performance.now() - start < config.resultTimeoutMs) {
            const hasDialog = Boolean(document.querySelector('.mat-mdc-dialog-container'));
            if (!hasDialog) {
                dialogClosed = true;
            }

            const messages = gatherLiveMessages();
            for (const message of messages) {
                if (seenMessages.has(message)) {
                    continue;
                }
                seenMessages.add(message);
                const classification = classifyMessage(message);
                if (classification === 'success') {
                    return { success: true, message };
                }
                if (classification === 'fatal') {
                    return { success: false, fatal: true, message };
                }
                if (classification === 'failure') {
                    return { success: false, fatal: false, message };
                }
            }

            if (dialogClosed && messages.length === 0) {
                // Give snackbars time to appear even after the dialog disappears.
            }

            await wait(config.overlayPollMs);
        }

        if (!dialogClosed) {
            return { success: false, fatal: false, message: 'Confirmation dialog never closed.' };
        }
        return { success: true, message: 'No failure message detected; assuming success.' };
    };

    const readJobName = (row) => {
        const cell = row.querySelector('.cdk-column-name, .mat-column-name');
        const raw = cell ? cell.textContent.trim() : '';
        return raw || null;
    };

    const nextEligibleRow = () => {
        const rows = Array.from(document.querySelectorAll('tr.mat-mdc-row'));
        for (const row of rows) {
            const jobName = readJobName(row);
            if (!jobName) {
                continue;
            }
            if (startedNames.has(jobName)) {
                continue;
            }
            const failures = failureCounts.get(jobName) ?? 0;
            if (failures >= config.rowRetryLimit) {
                continue;
            }
            return { row, jobName };
        }
        return null;
    };

    let startedRuns = 0;
    let idleCycles = 0;

    while (startedRuns < runLimit) {
        const selection = nextEligibleRow();
        if (!selection) {
            idleCycles += 1;
            if (idleCycles > config.maxIdleCycles) {
                console.log('No eligible drafts remain. Stopping early.');
                break;
            }
            console.log('No eligible drafts found. Waiting briefly in case the table updates...');
            await wait(config.idleDelayMs);
            continue;
        }
        idleCycles = 0;

        const { row, jobName } = selection;
        const menuButton = row.querySelector('button.mat-mdc-menu-trigger');
        if (!menuButton) {
            console.log(`Skipping ${jobName}: menu trigger not found.`);
            failureCounts.set(jobName, (failureCounts.get(jobName) ?? 0) + 1);
            continue;
        }

        console.log(`Opening draft menu for ${jobName}...`);
        menuButton.click();
        await wait(config.menuDelayMs);

        const openDraftButton = findMenuButtonByLabel(labelOpenDraft);
        if (!openDraftButton) {
            console.log(`Open draft action not found for ${jobName}.`);
            failureCounts.set(jobName, (failureCounts.get(jobName) ?? 0) + 1);
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
            failureCounts.set(jobName, (failureCounts.get(jobName) ?? 0) + 1);
            continue;
        }

        let hitConfirm = false;
        try {
            const confirmButton = await waitForElement(
                () => document.querySelector('button.confirm') || findButtonByLabel(labelConfirm)
            );
            confirmButton.click();
            hitConfirm = true;
        } catch (error) {
            console.log(`Failed to click "${labelConfirm}" for ${jobName}: ${error.message}`);
            failureCounts.set(jobName, (failureCounts.get(jobName) ?? 0) + 1);
            continue;
        }

        if (!hitConfirm) {
            failureCounts.set(jobName, (failureCounts.get(jobName) ?? 0) + 1);
            continue;
        }

        const outcome = await waitForSubmissionOutcome(jobName);
        if (outcome.success) {
            startedRuns += 1;
            startedNames.add(jobName);
            successfulNames.push(jobName);
            console.log(
                `Submission reported success for ${jobName} (${startedRuns}/${runLimit}). ${outcome.message}`
            );
        } else {
            const failureCount = (failureCounts.get(jobName) ?? 0) + 1;
            failureCounts.set(jobName, failureCount);
            console.log(
                `Submission failed for ${jobName} (${failureCount} attempts): ${outcome.message || 'No error text provided.'}`
            );
            if (outcome.fatal) {
                console.log('Stopping after a fatal/quota error.');
                break;
            }
        }

        await wait(config.rowDelayMs);
    }

    if (successfulNames.length === 0) {
        console.log('No jobs were reported as submitted successfully.');
    } else {
        console.log(`Successfully started ${successfulNames.length} jobs: ${successfulNames.join(', ')}`);
    }
}

startDraftRunsExperimental();
