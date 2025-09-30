const fs = require('fs');
const path = require('path');

// Get all HTML files in the public directory
const publicDir = path.join(__dirname, 'public');
const htmlFiles = fs.readdirSync(publicDir)
  .filter(file => file.endsWith('.html'))
  .filter(file => !file.includes('admin-login') && !file.includes('hotel-login')); // Skip login pages

console.log('Updating footer for HTML files:', htmlFiles);

htmlFiles.forEach(file => {
  const filePath = path.join(publicDir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Check if footer.js is already included
  if (content.includes('footer.js')) {
    console.log(`✅ ${file} already has footer.js`);
    return;
  }
  
  // Add footer.js before closing body tag
  if (content.includes('</body>')) {
    content = content.replace(
      '</body>',
      '    <script src="/footer.js"></script>\n</body>'
    );
    
    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated ${file} with footer.js`);
  } else {
    console.log(`⚠️  ${file} doesn't have </body> tag`);
  }
});

console.log('Footer update complete!');
