// Browser-console helper for deleting saved drafts whose title contains a term.
// Usage: paste into the AlphaFold predictions page DevTools console, then call
// deleteSavedDraftsBySearch(searchTerm?). A blank term aborts by default.
async function deleteSavedDraftsBySearch(searchTerm, options = {}) {
    const config = {
        menuDelayMs: 400,
        dialogDelayMs: 600,
        pageDelayMs: 1200,
        overlayTimeoutMs: 10000,
        overlayPollMs: 120,
        allowEmptySearch: false,
        deleteMenuLabels: ['Delete', 'Delete draft', 'Delete prediction', 'Remove'],
        confirmLabels: ['Delete', 'Delete draft', 'Confirm', 'OK'],
        ...options
    };

    const normalize = (text = '') => text.replace(/\s+/g, ' ').trim().toLowerCase();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isVisible = (el) => !!el && el.offsetParent !== null;

    if (searchTerm === undefined || searchTerm === null) {
        searchTerm = prompt('Delete saved drafts whose title contains...', '') || '';
    }
    const needle = normalize(searchTerm);
    if (!needle && !config.allowEmptySearch) {
        console.log('Search term is required. Aborting.');
        return;
    }
    if (!confirm(`Delete saved drafts whose title contains "${searchTerm.trim()}"?`)) {
        console.log('Delete cancelled.');
        return;
    }

    const matchesSearch = (name) => !needle || normalize(name).includes(needle);
    const getRows = () => Array.from(document.querySelectorAll('tr.mat-mdc-row'));
    const rowName = (row) => {
        const cell = row.querySelector('.cdk-column-name, .mat-column-name');
        return cell ? cell.textContent.trim() : '';
    };

    const waitForElement = (resolver) => new Promise((resolve, reject) => {
        const start = performance.now();
        const lookup = () => {
            const element = typeof resolver === 'string' ? document.querySelector(resolver) : resolver();
            if (element) { resolve(element); return; }
            if (performance.now() - start > config.overlayTimeoutMs) {
                reject(new Error('Timed out waiting for element.'));
                return;
            }
            setTimeout(lookup, config.overlayPollMs);
        };
        lookup();
    });

    const closeOpenOverlays = async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await wait(200);
    };

    const findMenuButtonByLabels = (labels) => {
        const targets = labels.map(normalize);
        const menuButtons = Array.from(document.querySelectorAll('button.mat-mdc-menu-item'));
        const buttonMatch = menuButtons.find((btn) => isVisible(btn) && targets.includes(normalize(btn.textContent)));
        if (buttonMatch) return buttonMatch;
        const spans = Array.from(document.querySelectorAll('span.mat-mdc-menu-item-text'));
        const spanMatch = spans.find((span) => isVisible(span) && targets.includes(normalize(span.textContent)));
        return spanMatch ? spanMatch.closest('button') ?? spanMatch : null;
    };

    const findDialogButtonByLabels = (labels) => {
        const targets = labels.map(normalize);
        const scope = document.querySelector('.mat-mdc-dialog-container, mat-dialog-container') || document;
        return Array.from(scope.querySelectorAll('button')).find(
            (btn) => isVisible(btn) && !btn.disabled && targets.includes(normalize(btn.textContent))
        );
    };

    const chipLabel = (chip) => {
        const el = chip.querySelector('.mdc-evolution-chip__text-label, .mat-mdc-chip-action-label');
        return normalize(el ? el.textContent : chip.textContent);
    };

    const ensureSavedDraftFilter = async () => {
        const chips = Array.from(document.querySelectorAll('mat-chip-option'));
        if (!chips.length) return;
        let changed = false;
        for (const chip of chips) {
            const action = chip.querySelector('button.mat-mdc-chip-action');
            if (!action) continue;
            const selected = action.getAttribute('aria-selected') === 'true'
                || chip.classList.contains('mdc-evolution-chip--selected');
            const wantSelected = chipLabel(chip) === 'saved draft';
            if (selected !== wantSelected) { action.click(); changed = true; await wait(300); }
        }
        if (changed) { console.log('Filtered to saved drafts only.'); await wait(config.pageDelayMs); }
    };

    const setPageSizeTo100 = async () => {
        const paginator = document.querySelector('mat-paginator');
        if (!paginator || normalize(paginator.textContent).includes('100')) return false;
        const trigger = paginator.querySelector('.mat-mdc-select-trigger')
            || paginator.querySelector('mat-select') || paginator.querySelector('[role="combobox"]');
        if (!trigger) return false;
        trigger.click();
        await wait(config.menuDelayMs);
        const option100 = Array.from(document.querySelectorAll('mat-option, .mat-mdc-option'))
            .find((option) => normalize(option.textContent) === '100');
        if (!option100) { await closeOpenOverlays(); return false; }
        option100.click();
        await wait(config.pageDelayMs);
        return true;
    };

    const clickNextPage = async () => {
        const nextButton = document.querySelector('button.mat-mdc-paginator-navigation-next');
        if (!nextButton) return false;
        const disabled = nextButton.disabled
            || nextButton.getAttribute('aria-disabled') === 'true'
            || nextButton.classList.contains('mat-mdc-button-disabled')
            || nextButton.classList.contains('mat-mdc-button-disabled-interactive');
        if (disabled) return false;
        nextButton.click();
        await wait(config.pageDelayMs);
        return true;
    };

    const deleteRow = async (row, name) => {
        const menuButton = row.querySelector('button.mat-mdc-menu-trigger');
        if (!menuButton) {
            console.log(`Skipping ${name}: menu trigger not found.`);
            return false;
        }

        console.log(`Deleting ${name}...`);
        menuButton.click();
        await wait(config.menuDelayMs);

        const deleteButton = findMenuButtonByLabels(config.deleteMenuLabels);
        if (!deleteButton) {
            console.log(`Delete action not found for ${name}.`);
            await closeOpenOverlays();
            return false;
        }
        deleteButton.click();
        await wait(config.dialogDelayMs);

        try {
            const confirmButton = await waitForElement(() => findDialogButtonByLabels(config.confirmLabels));
            confirmButton.click();
            await wait(config.pageDelayMs);
            return true;
        } catch (error) {
            console.log(`Failed to confirm delete for ${name}: ${error.message}`);
            await closeOpenOverlays();
            return false;
        }
    };

    await ensureSavedDraftFilter();
    await setPageSizeTo100();

    const deletedNames = new Set();
    const failedNames = new Set();

    while (true) {
        let deletedOnPage = 0;

        while (true) {
            const selection = getRows()
                .map((row) => ({ row, name: rowName(row) }))
                .find(({ name }) => name && matchesSearch(name) && !deletedNames.has(name) && !failedNames.has(name));

            if (!selection) break;

            const didDelete = await deleteRow(selection.row, selection.name);
            if (didDelete) {
                deletedNames.add(selection.name);
                deletedOnPage += 1;
                console.log(`Deleted ${selection.name} (${deletedNames.size} total).`);
            } else {
                failedNames.add(selection.name);
            }
        }

        if (deletedOnPage === 0 && !(await clickNextPage())) break;
    }

    console.log(`Finished. Deleted ${deletedNames.size} draft(s).`);
    if (failedNames.size) console.log(`Failed: ${Array.from(failedNames).join(', ')}`);
}

deleteSavedDraftsBySearch();
