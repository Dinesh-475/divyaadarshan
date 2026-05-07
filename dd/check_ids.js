const fs = require('fs');
const html = fs.readFileSync('updated_dashboard_with_expanded_temples_and_feedback/code.html', 'utf8');

const ids = [
    'detail-img', 'detail-name', 'detail-loc', 'detail-wait', 'detail-best-time',
    'detail-badge-bg', 'detail-badge-text', 'detail-wait-bar', 'detail-sug-1',
    'detail-sug-2', 'detail-sug-3', 'detail-stars-text', 'detail-park-name',
    'detail-park-dist', 'detail-park-slots', 'detail-map', 'detail-alert-text',
    'detail-slot-10', 'detail-slot-12', 'detail-qr-section', 'detail-morning-txt',
    'detail-afternoon-txt', 'detail-evening-txt', 'view-temple-details'
];

for (const id of ids) {
    const regex = new RegExp(`id="${id}"`, 'g');
    const matches = html.match(regex);
    if (!matches) {
        console.log(`ERROR: ID NOT FOUND: ${id}`);
    } else if (matches.length > 1) {
        console.log(`WARNING: Duplicate ID: ${id} (${matches.length} times)`);
    } else {
        console.log(`OK: ${id}`);
    }
}
