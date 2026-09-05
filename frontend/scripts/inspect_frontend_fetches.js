const fs = require('fs');

function inspectFile(file) {
    console.log(`=== FETCH CALLS IN ${file} ===`);
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');
    lines.forEach((l, i) => {
        if (l.includes('fetch(') || l.includes('safeFetch(')) {
            console.log(`${i + 1}: ${l.trim()}`);
        }
    });
}

inspectFile('src/components/SuperAdminPanel.jsx');
inspectFile('src/components/RegularAdminPanel.jsx');
