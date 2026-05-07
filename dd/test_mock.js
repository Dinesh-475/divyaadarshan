const fs = require('fs');
const html = fs.readFileSync('updated_dashboard_with_expanded_temples_and_feedback/code.html', 'utf8');

// Find the script block containing openTemple
const regex = /<script>([\s\S]*?)<\/script>/;
const match = html.match(regex);
const scriptText = match[1];

const ids = [
    'detail-img', 'detail-name', 'detail-loc', 'detail-wait', 'detail-best-time',
    'detail-badge-bg', 'detail-badge-text', 'detail-wait-bar', 'detail-sug-1',
    'detail-sug-2', 'detail-sug-3', 'detail-stars-text', 'detail-park-name',
    'detail-park-dist', 'detail-park-slots', 'detail-map', 'detail-alert-text',
    'detail-slot-10', 'detail-slot-12', 'detail-qr-section', 'detail-morning-txt',
    'detail-afternoon-txt', 'detail-evening-txt', 'view-temple-details'
];

global.document = {
    getElementById: (id) => {
        if (!ids.includes(id)) {
            console.log("WARNING: getElementById called with missing ID:", id);
            return null; // emulate real browser where it returns null
        }
        return {
            classList: { add: () => {}, remove: () => {} },
            style: {},
            className: '',
            innerText: '',
            innerHTML: '',
            src: ''
        };
    }
};
global.showView = () => {};

try {
    eval(scriptText);
    openTemple('venkateswara');
    console.log("Success! No JS error was thrown when evaluating openTemple.");
} catch(e) {
    console.error("Runtime JS Error:", e);
}
