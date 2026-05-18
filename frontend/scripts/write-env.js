const fs = require('fs');
const path = require('path');

const apiUrl = process.env.API_URL || 'http://localhost:4000/api';
const target = path.resolve(__dirname, '../src/environments/environment.ts');

const content = `export const environment = {
  apiUrl: '${apiUrl.replace(/'/g, "\\'")}',
};
`;

fs.writeFileSync(target, content);
console.log(`Angular API URL set to ${apiUrl}`);
