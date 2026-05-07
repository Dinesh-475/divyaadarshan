const fs = require('fs');

let html = fs.readFileSync('updated_dashboard_with_expanded_temples_and_feedback/code.html', 'utf8');

// 1. Replace onclick in cards
html = html.replace(/onclick="openTempleDetails\(this\)"/g, 'onclick="openTemple(\'tirupati\')"'); // fallback
html = html.replace(/<h3[^>]*>Sri Venkateswara Swamy<\/h3>/g, '<h3 class="font-manrope font-bold text-lg mb-2">Sri Venkateswara Swamy</h3>\n<!-- IDMarker: venkateswara -->');
html = html.replace(/<h3[^>]*>Sri Krishna Temple<\/h3>/g, '<h3 class="font-manrope font-bold text-lg mb-2">Sri Krishna Temple</h3>\n<!-- IDMarker: krishna -->');
html = html.replace(/<h3[^>]*>Sri Manjunatha Swamy<\/h3>/g, '<h3 class="font-manrope font-bold text-lg mb-2">Sri Manjunatha Swamy</h3>\n<!-- IDMarker: manjunatha -->');
html = html.replace(/<h3[^>]*>Kedarnath Temple<\/h3>/g, '<h3 class="font-manrope font-bold text-[15px] mb-2 leading-tight">Kedarnath Temple</h3>\n<!-- IDMarker: kedarnath -->');
html = html.replace(/<h3[^>]*>Sri Kashi Vishwanath<\/h3>/g, '<h3 class="font-manrope font-bold text-[15px] mb-2 leading-tight">Sri Kashi Vishwanath</h3>\n<!-- IDMarker: kashi -->');
html = html.replace(/<h3[^>]*>Somnath Temple<\/h3>/g, '<h3 class="font-manrope font-bold text-[15px] mb-2 leading-tight">Somnath Temple</h3>\n<!-- IDMarker: somnath -->');
html = html.replace(/<h3[^>]*>Shree Jagannatha<\/h3>/g, '<h3 class="font-manrope font-bold text-[15px] mb-2 leading-tight">Shree Jagannatha</h3>\n<!-- IDMarker: jagannatha -->');

// Now we do a precise replacement for the onclick based on the IDMarker.
const markers = ['venkateswara', 'krishna', 'manjunatha', 'kedarnath', 'kashi', 'somnath', 'jagannatha'];
for (const m of markers) {
    // regex to find the nearest onclick="openTemple('tirupati')" before the marker
    // Warning: standard regex lookbehind is not ideal for this. 
    // Let's do a trick: we replace all with tirupati, then we'll just fix it manually or via a simpler index search.
}
