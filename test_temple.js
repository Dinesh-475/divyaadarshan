const fs = require('fs');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

const html = fs.readFileSync('updated_dashboard_with_expanded_temples_and_feedback/code.html', 'utf8');

const { window } = new JSDOM(html, { runScripts: "dangerously" });

window.onerror = function(message, source, lineno, colno, error) {
    console.log('JSDOM Error:', message, lineno, colno);
};

setTimeout(() => {
    try {
        console.log("Calling openTemple('venkateswara')...");
        window.openTemple('venkateswara');
        console.log("Success! No JS error thrown.");
        console.log("Display style:", window.document.getElementById('view-temple-details').className);
    } catch (e) {
        console.error("Caught error:", e);
    }
}, 500);
