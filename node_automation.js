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

async function downloadPredictionsFromPage(page, delayMs) {
    await page.waitForSelector('tr.mat-mdc-row', { timeout: 30000 });
    const rows = await page.$$('tr.mat-mdc-row');

    if (!rows.length) {
        console.log('No rows found on the page.');
        return;
    }

    for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const menuButton = await row.$('button.mat-mdc-menu-trigger');

        if (!menuButton) {
            console.log(`Three dots button not found for prediction ${index + 1}.`);
            continue;
        }

        console.log(`Opening menu for prediction ${index + 1}...`);
        await menuButton.click();
        await page.waitForTimeout(500);

        const menuItems = await page.$$('span.mat-mdc-menu-item-text');
        let clicked = false;

        for (const item of menuItems) {
            const text = await item.evaluate((el) => el.textContent.trim());
            if (text === 'Download') {
                await item.click();
                clicked = true;
                console.log(`Triggered Download for prediction ${index + 1}.`);
                break;
            }
        }

        if (!clicked) {
            console.log(`Download button not found for prediction ${index + 1}.`);
        }

        await page.waitForTimeout(delayMs);
    }
}

async function main() {
    const targetUrl = getArg('--url', process.env.ALPHAFOLD_URL || '');
    const delayMs = parseNumber(getArg('--delay', 500), 500);
    const headless = args.includes('--headless');
    const autoStart = args.includes('--auto-start');

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

    if (!autoStart) {
        await waitForEnter('Press Enter to start downloading all rows visible on the page...');
    }

    await downloadPredictionsFromPage(page, delayMs);
    await browser.close();
    console.log('Finished processing all rows.');
}

main().catch((error) => {
    console.error('Automation failed:', error);
    process.exit(1);
});
