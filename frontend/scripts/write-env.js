const fs = require('fs');
const path = require('path');

const apiUrl =
  process.env.API_URL || 'https://tws-ops-system-backend-staging.up.railway.app/api';
const target = path.resolve(__dirname, '../src/environments/environment.ts');

const content = `export const environment = {
  apiUrl: '${apiUrl.replace(/'/g, "\\'")}',
};
`;

fs.writeFileSync(target, content);
console.log(`Angular API URL set to ${apiUrl}`);
