const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const footerPath = path.join(repoRoot, 'public', 'footer.html');

if (!fs.existsSync(footerPath)) {
  console.error('Footer template not found at', footerPath);
  process.exit(1);
}

const footerTemplate = fs.readFileSync(footerPath, 'utf8').trim();
const files = new Set();
const skipDirs = new Set(['.git', 'node_modules', 'logs', 'uploads']);

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.html') && fullPath !== footerPath) {
      files.add(fullPath);
    }
  }
}

walk(repoRoot);

function indentBlock(block, indent) {
  return block
    .split('\n')
    .map(line => (line.length ? indent + line : line))
    .join('\n');
}

let updatedCount = 0;
let addedCount = 0;

for (const filePath of files) {
  let content = fs.readFileSync(filePath, 'utf8');
  const footerRegex = /<footer[\s\S]*?<\/footer>/i;
  const closingBodyRegex = /<\/body>/i;

  let indent = '    ';
  const footerMatch = content.match(/\n([ \t]*)<footer/i);
  if (footerMatch) {
    indent = footerMatch[1] || '';
  } else {
    const bodyMatch = content.match(/\n([ \t]*)<\/body>/i);
    if (bodyMatch) indent = bodyMatch[1] || '';
  }

  const indentedFooter = indentBlock(footerTemplate, indent);

  if (footerRegex.test(content)) {
    content = content.replace(footerRegex, indentedFooter);
    updatedCount += 1;
  } else if (closingBodyRegex.test(content)) {
    content = content.replace(closingBodyRegex, `${indentedFooter}\n${indent}</body>`);
    addedCount += 1;
  } else {
    continue;
  }

  fs.writeFileSync(filePath, content, 'utf8');
}

console.log(`Footers updated: ${updatedCount}`);
console.log(`Footers added: ${addedCount}`);
