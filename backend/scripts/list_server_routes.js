const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const lines = content.split('\n');
console.log('=== ALL ROUTE REGISTRATIONS IN SERVER.JS ===');
lines.forEach((l, idx) => {
  const match = l.match(/app\.(get|post|put|delete|patch)\s*\(\s*['"]([^'"]+)['"]/);
  if (match) {
    console.log(`${idx + 1}: ${match[1].toUpperCase()} ${match[2]}`);
  }
});
