const { pool } = require('../../db/pool');

let ensureUserRoleSchemaPromise = null;

const ensureUserRoleSchema = async () => {
  if (!ensureUserRoleSchemaPromise) {
    ensureUserRoleSchemaPromise = (async () => {
      try {
        await pool.query(`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'hr'`);

        await pool.query(`
          ALTER TABLE users
            ADD COLUMN IF NOT EXISTS roles JSONB NOT NULL DEFAULT '[]'::jsonb
        `);

        await pool.query(`
          ALTER TABLE users
            ADD COLUMN IF NOT EXISTS hunter_status TEXT NOT NULL DEFAULT 'ACTIVE',
            ADD COLUMN IF NOT EXISTS training_rules_acknowledged_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS training_extended_until DATE
        `);

        await pool.query(`
          UPDATE users
          SET roles = jsonb_build_array(role::text)
          WHERE roles IS NULL
             OR jsonb_typeof(roles) <> 'array'
             OR jsonb_array_length(roles) = 0
        `);

        await pool.query(`
          UPDATE users
          SET hunter_status = 'ACTIVE'
          WHERE hunter_status IS NULL OR trim(hunter_status) = ''
        `);
      } finally {
        ensureUserRoleSchemaPromise = null;
      }
    })();
  }

  return ensureUserRoleSchemaPromise;
};

module.exports = {
  ensureUserRoleSchema,
};
