const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../../db/pool');
const { env } = require('../../config/env');
const { AppError } = require('../../middleware/error');

const userSelect = `
  id,
  name,
  email,
  role,
  is_active AS "isActive",
  created_at AS "createdAt",
  updated_at AS "updatedAt"
`;

const signToken = (user) =>
  jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );

const login = async ({ email, password }) => {
  if (!email || !password) {
    throw new AppError('Email and password are required.', 400);
  }

  const result = await pool.query(
    `
      SELECT id, name, email, password_hash, role, is_active
      FROM users
      WHERE lower(email) = lower($1)
      LIMIT 1
    `,
    [email.trim()],
  );

  const user = result.rows[0];

  if (!user || !user.is_active) {
    throw new AppError('Invalid email or password.', 401);
  }

  const isValidPassword = await bcrypt.compare(password, user.password_hash);

  if (!isValidPassword) {
    throw new AppError('Invalid email or password.', 401);
  }

  const profile = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isActive: user.is_active,
  };

  return {
    token: signToken(profile),
    user: profile,
  };
};

const getUserById = async (id) => {
  const result = await pool.query(`SELECT ${userSelect} FROM users WHERE id = $1`, [id]);
  const user = result.rows[0];

  if (!user || !user.isActive) {
    throw new AppError('User not found.', 404);
  }

  return user;
};

module.exports = {
  login,
  getUserById,
};
