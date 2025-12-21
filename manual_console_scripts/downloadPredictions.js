// Browser-console helper for downloading every prediction on the current page.
// For best results, zoom out so all rows are visible before running.
// Adjust the delay if downloads are skipped on slower networks/machines.
// Usage: paste in the browser devtools console while on your AlphaFold page.
function downloadPredictions(delayMs = 500) {
    const rows = document.querySelectorAll('tr.mat-mdc-row');

    if (rows.length === 0) {
        console.log('No rows found.');
        return;
    }

    const clickDotsAndDownload = (row, index, delay) => {
        setTimeout(() => {
            const threeDotsButton = row.querySelector('button.mat-mdc-menu-trigger');

            if (!threeDotsButton) {
                console.log(`Three dots button not found for prediction ${index + 1}.`);
                return;
            }

            console.log(`Clicking three dots button for prediction ${index + 1}...`);
            threeDotsButton.click();

            setTimeout(() => {
                const downloadButtons = document.querySelectorAll('span.mat-mdc-menu-item-text');
                const downloadButton = [...downloadButtons].find((el) => el.textContent.trim() === 'Download');

                if (downloadButton) {
                    console.log(`Clicking Download button for prediction ${index + 1}...`);
                    downloadButton.click();
                } else {
                    console.log(`Download button not found for prediction ${index + 1}.`);
                }
            }, 500);
        }, delay);
    };

    rows.forEach((row, index) => {
        clickDotsAndDownload(row, index, index * delayMs);
    });
}

downloadPredictions();
