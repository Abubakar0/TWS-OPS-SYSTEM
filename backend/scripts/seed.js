const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');

const schemaPath = path.resolve(__dirname, '../../database/schema.sql');

const users = [
  { name: 'Admin User', email: 'admin@example.com', role: 'admin' },
  { name: 'Hunter User', email: 'hunter@example.com', role: 'hunter' },
  { name: 'Lister User', email: 'lister@example.com', role: 'lister' },
];

const run = async () => {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(schema);

  const passwordHash = await bcrypt.hash('Password123!', 10);

  for (const user of users) {
    await pool.query(
      `
        INSERT INTO users (name, email, password_hash, role)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO UPDATE
        SET name = EXCLUDED.name,
            role = EXCLUDED.role,
            updated_at = NOW()
      `,
      [user.name, user.email, passwordHash, user.role],
    );
  }

  await pool.query(
    `
      INSERT INTO accounts (name, marketplace)
      SELECT 'Default eBay Account', 'ebay'
      WHERE NOT EXISTS (
        SELECT 1 FROM accounts WHERE name = 'Default eBay Account'
      )
    `,
  );

  console.log('Database schema applied and demo users seeded.');
  console.log('Demo password for all users: Password123!');
};

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
