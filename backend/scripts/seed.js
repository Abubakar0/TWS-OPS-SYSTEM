const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');

const schemaPath = path.resolve(__dirname, '../database/schema.sql');

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

  await pool.query(
    `
      INSERT INTO hunter_lister_assignments (hunter_id, lister_id)
      SELECT hunter.id, lister.id
      FROM users hunter
      CROSS JOIN users lister
      WHERE hunter.email = 'hunter@example.com'
        AND lister.email = 'lister@example.com'
      ON CONFLICT (hunter_id) DO UPDATE
      SET lister_id = EXCLUDED.lister_id,
          updated_at = NOW()
    `,
  );

  await pool.query(
    `
      INSERT INTO hunting_criteria (
        id,
        min_roi,
        min_profit,
        min_sold_count,
        fee_percent,
        asin_required,
        min_stock_count,
        min_alt_stock_count,
        min_rating,
        custom_label_required,
        watchers_required,
        min_watcher_count,
        min_sales_last_two_months
      )
      VALUES (1, 30, 0, 1, 21, TRUE, 8, 8, 0, FALSE, FALSE, 0, 0)
      ON CONFLICT (id) DO NOTHING
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
