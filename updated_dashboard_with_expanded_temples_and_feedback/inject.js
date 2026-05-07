const fs = require('fs');

let html = fs.readFileSync('code.html', 'utf8');

html = html.replace(
    /<div class="bg-surface-container-lowest rounded-lg overflow-hidden group hover:shadow-xl transition-all duration-300">/g,
    '<div class="bg-surface-container-lowest rounded-lg overflow-hidden group hover:shadow-xl transition-all duration-300 cursor-pointer" onclick="openTempleDetails(this)">'
);

const viewHtml = fs.readFileSync('view.txt', 'utf8');
html = html.replace('</main>', viewHtml + '\\n</main>');

const jsLogic = fs.readFileSync('logic.txt', 'utf8');
html = html.replace('</script>', jsLogic + '\\n</script>');

fs.writeFileSync('code.html', html, 'utf8');
console.log('Successfully injected Temple Details View');
