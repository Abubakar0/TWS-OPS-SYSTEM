const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { writeAuditLog } = require('../users/audit.service');

const ensureTeamTables = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL UNIQUE,
      description TEXT,
      created_by UUID REFERENCES users(id),
      updated_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_members (
      team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (team_id, user_id)
    )
  `);
};

const mapTeamRows = (rows) => {
  const teams = new Map();

  for (const row of rows) {
    if (!teams.has(row.id)) {
      teams.set(row.id, {
        id: row.id,
        name: row.name,
        description: row.description,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        members: [],
      });
    }

    if (row.memberId) {
      teams.get(row.id).members.push({
        id: row.memberId,
        name: row.memberName,
        email: row.memberEmail,
        role: row.memberRole,
        isActive: Boolean(row.memberActive),
      });
    }
  }

  return [...teams.values()];
};

const listTeams = async (user, query = {}) => {
  await ensureTeamTables();
  const params = [];
  const where = [];

  if (!['admin', 'super_admin'].includes(user.role)) {
    params.push(user.id);
    where.push(`member.id = $${params.length}`);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(
      team.name ILIKE $${index}
      OR COALESCE(team.description, '') ILIKE $${index}
      OR COALESCE(member.name, '') ILIKE $${index}
      OR COALESCE(member.email, '') ILIKE $${index}
    )`);
  }

  const result = await pool.query(
    `
      SELECT
        team.id,
        team.name,
        team.description,
        team.created_at AS "createdAt",
        team.updated_at AS "updatedAt",
        member.id AS "memberId",
        member.name AS "memberName",
        member.email AS "memberEmail",
        member.role AS "memberRole",
        member.is_active AS "memberActive"
      FROM teams team
      LEFT JOIN team_members tm ON tm.team_id = team.id
      LEFT JOIN users member ON member.id = tm.user_id AND member.deleted_at IS NULL
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY team.name, member.name
    `,
    params,
  );

  return mapTeamRows(result.rows);
};

const saveTeam = async (user, payload = {}, teamId = null) => {
  await ensureTeamTables();
  const name = String(payload.name || '').trim();
  const description = String(payload.description || '').trim() || null;
  const memberIds = [...new Set((payload.memberIds || []).filter(Boolean))];

  if (!name) {
    throw new AppError('Team name is required.', 400);
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let savedTeamId = teamId;

    if (teamId) {
      const updateResult = await client.query(
        `
          UPDATE teams
          SET name = $2,
              description = $3,
              updated_by = $4,
              updated_at = NOW()
          WHERE id = $1
          RETURNING id
        `,
        [teamId, name, description, user.id],
      );

      if (!updateResult.rows[0]) {
        throw new AppError('Team not found.', 404);
      }
    } else {
      const insertResult = await client.query(
        `
          INSERT INTO teams (name, description, created_by, updated_by, created_at, updated_at)
          VALUES ($1, $2, $3, $3, NOW(), NOW())
          RETURNING id
        `,
        [name, description, user.id],
      );
      savedTeamId = insertResult.rows[0].id;
    }

    await client.query('DELETE FROM team_members WHERE team_id = $1', [savedTeamId]);

    for (const memberId of memberIds) {
      await client.query(
        `
          INSERT INTO team_members (team_id, user_id, assigned_by, created_at, updated_at)
          VALUES ($1, $2, $3, NOW(), NOW())
        `,
        [savedTeamId, memberId, user.id],
      );
    }

    await client.query('COMMIT');

    await writeAuditLog({
      actorUserId: user.id,
      action: teamId ? 'team.update' : 'team.create',
      targetType: 'team',
      targetId: savedTeamId,
      details: {
        name,
        memberCount: memberIds.length,
      },
    });

    const teams = await listTeams(user);
    return teams.find((team) => team.id === savedTeamId) || null;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const deleteTeam = async (user, id) => {
  await ensureTeamTables();
  const result = await pool.query('DELETE FROM teams WHERE id = $1 RETURNING id, name', [id]);

  if (!result.rows[0]) {
    throw new AppError('Team not found.', 404);
  }

  await writeAuditLog({
    actorUserId: user.id,
    action: 'team.delete',
    targetType: 'team',
    targetId: id,
    details: {
      name: result.rows[0].name,
    },
  });
};

module.exports = {
  ensureTeamTables,
  listTeams,
  saveTeam,
  deleteTeam,
};
