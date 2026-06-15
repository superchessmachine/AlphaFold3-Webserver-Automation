// Browser-console helper for downloading predictions from the current page.
// Like startDraftRuns, it asks how many you want and keeps going until it has
// triggered that many downloads, scrolling to reveal more rows when the visible
// ones run out. Job names it already downloaded are remembered for the page
// session, so you can rerun it to grab the next batch without repeats.
// Usage: paste into the AlphaFold page DevTools console, then call
// downloadPredictions(desiredCount?). If no count is provided a prompt asks.
// Pass 0 (or call downloadPredictions(0)) to download everything it can reach.
async function downloadPredictions(desiredDownloads, options = {}) {
    const defaultOptions = {
        delayMs: 500,
        menuDelayMs: 500,
        idleDelayMs: 1500,
        maxIdleCycles: 3,
        rowRetryLimit: 2
    };
    const config = { ...defaultOptions, ...options };
    const normalize = (text = '') => text.replace(/\s+/g, ' ').trim().toLowerCase();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    let runLimit = Number(desiredDownloads);
    if (desiredDownloads === undefined || desiredDownloads === null || Number.isNaN(runLimit)) {
        const response = prompt('How many predictions should be downloaded from the top? (0 = all)', '10');
        if (response === null) {
            console.log('No downloads requested. Aborting.');
            return;
        }
        runLimit = Number(response);
    }
    if (!Number.isFinite(runLimit) || runLimit < 0) {
        console.log('Invalid download count. Aborting.');
        return;
    }
    // runLimit === 0 means "download everything it can reach".
    const limited = runLimit > 0;

    if (document.querySelectorAll('tr.mat-mdc-row').length === 0) {
        console.log('No prediction rows found on the page.');
        return;
    }

    const initializeGlobalNameSet = () => {
        const existing = window.__afDownloadedPredictions;
        if (existing instanceof Set) {
            return existing;
        }
        const hydrated = Array.isArray(existing) ? new Set(existing) : new Set();
        window.__afDownloadedPredictions = hydrated;
        return hydrated;
    };

    const downloadedNames = initializeGlobalNameSet();
    const failureCounts = new Map();
    const downloadedThisRun = [];

    const rowKey = (row) => {
        const cell = row.querySelector('.cdk-column-name, .mat-column-name');
        const name = cell ? cell.textContent.trim() : '';
        return name || `__row:${normalize(row.textContent).slice(0, 120)}`;
    };

    const nextEligibleRow = () => {
        const rows = Array.from(document.querySelectorAll('tr.mat-mdc-row'));
        for (const row of rows) {
            const key = rowKey(row);
            if (downloadedNames.has(key)) {
                continue;
            }
            if ((failureCounts.get(key) ?? 0) >= config.rowRetryLimit) {
                continue;
            }
            return { row, key };
        }
        return null;
    };

    // Scroll the table to coax the next batch of rows into the DOM.
    const getScrollContainer = () => {
        const viewport = document.querySelector('cdk-virtual-scroll-viewport');
        if (viewport) {
            return viewport;
        }
        let node = document.querySelector('table.mat-mdc-table, .mat-mdc-table');
        while (node && node !== document.body) {
            const style = getComputedStyle(node);
            if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
                return node;
            }
            node = node.parentElement;
        }
        return document.scrollingElement || document.documentElement;
    };

    const revealMore = async () => {
        const rows = document.querySelectorAll('tr.mat-mdc-row');
        const lastRow = rows[rows.length - 1];
        if (lastRow && lastRow.scrollIntoView) {
            lastRow.scrollIntoView({ block: 'end' });
        }
        const container = getScrollContainer();
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
        await wait(config.idleDelayMs);
    };

    let triggered = 0;
    let idleCycles = 0;

    while (!limited || triggered < runLimit) {
        const selection = nextEligibleRow();
        if (!selection) {
            idleCycles += 1;
            if (idleCycles > config.maxIdleCycles) {
                console.log('No more predictions to download. Stopping.');
                break;
            }
            console.log('No new rows visible. Scrolling to reveal more...');
            await revealMore();
            continue;
        }
        idleCycles = 0;

        const { row, key } = selection;
        const menuButton = row.querySelector('button.mat-mdc-menu-trigger');
        if (!menuButton) {
            console.log(`Three dots button not found for ${key}.`);
            failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
            continue;
        }

        console.log(`Opening menu for ${key}...`);
        menuButton.click();
        await wait(config.menuDelayMs);

        const downloadButtons = document.querySelectorAll('span.mat-mdc-menu-item-text');
        const downloadButton = [...downloadButtons].find((el) => el.textContent.trim() === 'Download');
        if (downloadButton) {
            downloadButton.click();
            triggered += 1;
            downloadedNames.add(key);
            downloadedThisRun.push(key);
            console.log(`Triggered Download for ${key} (${triggered}${limited ? `/${runLimit}` : ''}).`);
        } else {
            console.log(`Download button not found for ${key}.`);
            failureCounts.set(key, (failureCounts.get(key) ?? 0) + 1);
            const backdrop = document.querySelector('.cdk-overlay-backdrop');
            if (backdrop) {
                backdrop.click();
            }
        }

        await wait(config.delayMs);
    }

    if (downloadedThisRun.length === 0) {
        console.log('No predictions were downloaded during this run.');
    } else {
        console.log(`Triggered ${downloadedThisRun.length} downloads: ${downloadedThisRun.join(', ')}`);
    }
}

downloadPredictions();
