const fs = require('fs');

const htmlFile = 'updated_dashboard_with_expanded_temples_and_feedback/code.html';
const logicFile = 'updated_dashboard_with_expanded_temples_and_feedback/logic.txt';

let html = fs.readFileSync(htmlFile, 'utf8');
const oldLogic = fs.readFileSync(logicFile, 'utf8');

// Replace all onclick="openTemple('...')" with onclick="openTempleDetails(this)"
html = html.replace(/onclick="openTemple\([^)]+\)"/g, 'onclick="openTempleDetails(this)"');

// Remove templeData block and openTemple block
// Let's use a regex to capture from 'const templeData = {' up to 'function openTemple(id) { ... }'
// Actually it's easier to replace the entire <script> that holds it.
// The script block has const templeData = { .... openTemple(id) .... showView('view-temple-details');
// }
// We can find the script block by searching for 'const templeData ='
const startStr = 'const templeData = {';
const startIndex = html.indexOf(startStr);
if (startIndex !== -1) {
    // Find the end of openTemple function
    const endStr = "    showView('view-temple-details');\n}";
    const endIndex = html.indexOf(endStr, startIndex);
    if (endIndex !== -1) {
        const fullEndIndex = endIndex + endStr.length;
        // Replace this chunk with the oldLogic
        html = html.substring(0, startIndex) + oldLogic + "\n" + html.substring(fullEndIndex);
    }
}

fs.writeFileSync(htmlFile, html, 'utf8');
console.log("Reverted successfully!");
