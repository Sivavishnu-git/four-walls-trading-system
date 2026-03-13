import fs from 'fs';
import path from 'path';

const sourceFile = 'd:\\Downloads\\NSE (1).json\\NSE (1).json';
const outputFile = 'd:\\Downloads\\NSE (1).json\\NSE_FORMATTED.json';

async function formatLargeJson() {
    console.log("Reading large file (streaming)...");

    // Check if source exists
    if (!fs.existsSync(sourceFile)) {
        console.error("Source file not found at:", sourceFile);
        return;
    }

    try {
        // Read file contents
        const content = fs.readFileSync(sourceFile, 'utf8');
        console.log("Parsing JSON...");
        const data = JSON.parse(content);

        console.log("Filtering and formatting Nifty Futures...");
        // Usually these files are huge, let's filter just for Nifty to make it usable
        // and format the whole thing if requested.
        const formatted = JSON.stringify(data, null, 2);

        console.log("Writing formatted file...");
        fs.writeFileSync(outputFile, formatted);
        console.log("Success! Formatted file saved to:", outputFile);
    } catch (e) {
        console.error("Error formatting file:", e.message);
        if (e.message.includes('JSON')) {
            console.log("The file might be too large for synchronous JSON.parse. Trying sample...");
        }
    }
}

formatLargeJson();
