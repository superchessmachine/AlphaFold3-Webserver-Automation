#!/usr/bin/env node
// Node.js helper that visits the AlphaFold page and clicks the download
// menu for every prediction row, mirroring the browser-console script.

const puppeteer = require('puppeteer');
const readline = require('readline');

const args = process.argv.slice(2);

function getArg(flag, fallback) {
    const index = args.indexOf(flag);
    if (index !== -1 && args[index + 1]) {
        return args[index + 1];
    }
    return fallback;
}

function parseNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function waitForEnter(promptText) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(promptText, () => {
            rl.close();
            resolve();
        });
    });
}

function askNumber(promptText, fallback) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
        rl.question(promptText, (answer) => {
            rl.close();
            const parsed = Number(answer);
            resolve(Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback);
        });
    });
}

// Pull the eligible (not-yet-downloaded) row keys from the page in DOM order.
function readRowKeys(page) {
    return page.$$eval('tr.mat-mdc-row', (rows) =>
        rows.map((row) => {
            const cell = row.querySelector('.cdk-column-name, .mat-column-name');
            const name = cell ? cell.textContent.trim() : '';
            return name || `__row:${(row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120)}`;
        })
    );
}

// Scroll the table so the next batch of rows loads into the DOM.
function revealMore(page) {
    return page.evaluate(() => {
        const rows = document.querySelectorAll('tr.mat-mdc-row');
        const lastRow = rows[rows.length - 1];
        if (lastRow && lastRow.scrollIntoView) {
            lastRow.scrollIntoView({ block: 'end' });
        }
        let container = document.querySelector('cdk-virtual-scroll-viewport');
        if (!container) {
            let node = document.querySelector('table.mat-mdc-table, .mat-mdc-table');
            while (node && node !== document.body) {
                const style = getComputedStyle(node);
                if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
                    container = node;
                    break;
                }
                node = node.parentElement;
            }
        }
        if (!container) {
            container = document.scrollingElement || document.documentElement;
        }
        container.scrollTop = container.scrollHeight;
    });
}

// Download rows from the top until `limit` are triggered (limit <= 0 = all),
// scrolling to reveal more rows when the visible ones run out.
async function downloadPredictionsFromPage(page, delayMs, limit) {
    await page.waitForSelector('tr.mat-mdc-row', { timeout: 30000 });

    const limited = Number.isFinite(limit) && limit > 0;
    const maxIdleCycles = 3;
    const idleDelayMs = 1500;
    const rowRetryLimit = 2;

    const downloaded = new Set();
    const failureCounts = new Map();
    const triggeredNames = [];
    let idleCycles = 0;

    while (!limited || triggeredNames.length < limit) {
        const keys = await readRowKeys(page);
        let index = -1;
        let key = null;
        for (let i = 0; i < keys.length; i += 1) {
            const candidate = keys[i];
            if (downloaded.has(candidate)) {
                continue;
            }
            if ((failureCounts.get(candidate) || 0) >= rowRetryLimit) {
                continue;
            }
            index = i;
            key = candidate;
            break;
        }

        if (index === -1) {
            idleCycles += 1;
            if (idleCycles > maxIdleCycles) {
                console.log('No more predictions to download. Stopping.');
                break;
            }
            console.log('No new rows visible. Scrolling to reveal more...');
            await revealMore(page);
            await page.waitForTimeout(idleDelayMs);
            continue;
        }
        idleCycles = 0;

        const rows = await page.$$('tr.mat-mdc-row');
        const row = rows[index];
        const menuButton = row ? await row.$('button.mat-mdc-menu-trigger') : null;
        if (!menuButton) {
            console.log(`Three dots button not found for ${key}.`);
            failureCounts.set(key, (failureCounts.get(key) || 0) + 1);
            continue;
        }

        console.log(`Opening menu for ${key}...`);
        await menuButton.click();
        await page.waitForTimeout(500);

        const menuItems = await page.$$('span.mat-mdc-menu-item-text');
        let clicked = false;
        for (const item of menuItems) {
            const text = await item.evaluate((el) => el.textContent.trim());
            if (text === 'Download') {
                await item.click();
                clicked = true;
                break;
            }
        }

        if (clicked) {
            downloaded.add(key);
            triggeredNames.push(key);
            console.log(`Triggered Download for ${key} (${triggeredNames.length}${limited ? `/${limit}` : ''}).`);
        } else {
            console.log(`Download button not found for ${key}.`);
            failureCounts.set(key, (failureCounts.get(key) || 0) + 1);
        }

        await page.waitForTimeout(delayMs);
    }

    if (triggeredNames.length === 0) {
        console.log('No predictions were downloaded.');
    } else {
        console.log(`Triggered ${triggeredNames.length} downloads: ${triggeredNames.join(', ')}`);
    }
}

async function main() {
    const targetUrl = getArg('--url', process.env.ALPHAFOLD_URL || '');
    const delayMs = parseNumber(getArg('--delay', 500), 500);
    const headless = args.includes('--headless');
    const autoStart = args.includes('--auto-start');
    const countArg = getArg('--count', null);
    let limit = countArg !== null ? parseNumber(countArg, 0) : null;

    if (!targetUrl) {
        console.error('Missing target URL. Provide via --url or ALPHAFOLD_URL.');
        process.exit(1);
    }

    console.log(`Launching browser${headless ? ' in headless mode' : ''}...`);
    const browser = await puppeteer.launch({ headless });
    const page = await browser.newPage();

    await page.goto(targetUrl, { waitUntil: 'networkidle2' });
    console.log('If login is required, complete it now.');
    console.log('Navigate to the predictions table before starting downloads.');

    if (limit === null) {
        // No --count given: ask interactively (or default to all when --auto-start).
        limit = autoStart
            ? 0
            : await askNumber('How many predictions to download? (0 = all) Type a number and press Enter to start: ', 0);
    } else if (!autoStart) {
        await waitForEnter(`Press Enter to start downloading ${limit > 0 ? limit : 'all'} prediction(s)...`);
    }

    await downloadPredictionsFromPage(page, delayMs, limit);
    await browser.close();
    console.log('Finished processing all rows.');
}

main().catch((error) => {
    console.error('Automation failed:', error);
    process.exit(1);
});
