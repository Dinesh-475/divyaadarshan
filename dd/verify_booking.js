const fs = require('fs');
const html = fs.readFileSync('updated_dashboard_with_expanded_temples_and_feedback/code.html', 'utf8');

// The new logic is at the very end of the file. Let's just find the bookingData variable block.
const regex = /const bookingData = \{([\s\S]*?)function updateBookingView\(\)/;
if (html.match(regex)) {
    console.log("bookingData JS block was found!");
} else {
    console.log("bookingData JS block NOT found!");
}

const htmlRegex = /id=\"announcements-container\"/;
if (html.match(htmlRegex)) {
    console.log("HTML containers injected successfully!");
} else {
    console.log("HTML containers NOT found!");
}
