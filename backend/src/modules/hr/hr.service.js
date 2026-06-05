const { randomUUID } = require('crypto');
const { pool } = require('../../db/pool');
const { AppError } = require('../../middleware/error');
const { normalizePageRequest, buildPageMeta } = require('../../utils/pagination');
const { getConfiguredLimit } = require('../system/system.service');
const { writeAuditLog } = require('../users/audit.service');
const { ensureUserRoleSchema } = require('../users/user-schema.service');
const { hasAnyRole, hasRole, normalizeRoles, resolvePrimaryRole } = require('../users/permissions');

const EMPLOYMENT_TYPES = ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN', 'REMOTE'];
const EMPLOYMENT_STATUSES = ['ACTIVE', 'INACTIVE', 'PROBATION', 'RESIGNED', 'TERMINATED'];
const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY', 'ON_LEAVE', 'WORK_FROM_HOME'];
const LEAVE_TYPES = ['ANNUAL', 'SICK', 'CASUAL', 'EMERGENCY', 'UNPAID'];
const LEAVE_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];
const PAYROLL_STATUSES = ['DRAFT', 'APPROVED', 'PAID'];
const EXPENSE_CATEGORIES = ['INTERNET', 'FUEL', 'SOFTWARE', 'EQUIPMENT', 'TRAVEL', 'OFFICE', 'MISC'];
const EXPENSE_STATUSES = ['SUBMITTED', 'APPROVED', 'REJECTED', 'PAID'];
const WARNING_TYPES = ['VERBAL', 'WRITTEN', 'FINAL'];
const DOCUMENT_TYPES = ['CV', 'CNIC', 'OFFER_LETTER', 'CONTRACT', 'CERTIFICATE', 'POLICY', 'OTHER'];

let ensureHrTablesPromise = null;

const toText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const toDate = (value) => {
  const normalized = toText(value);
  return normalized || null;
};

const toMoney = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toInteger = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toUpperEnum = (value, allowed, fallback = null) => {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  if (!normalized) {
    return fallback;
  }

  if (!allowed.includes(normalized)) {
    throw new AppError(`Invalid value: ${normalized}.`, 400);
  }

  return normalized;
};

const hasHrAccess = (user) => hasAnyRole(user, ['admin', 'hr', 'super_admin']);
const hasPayrollAccess = (user) => hasAnyRole(user, ['admin', 'hr', 'super_admin']);

const ensureHrManager = (user, message = 'You do not have access to HR management.') => {
  if (!hasHrAccess(user)) {
    throw new AppError(message, 403);
  }
};

const ensurePayrollManager = (user, message = 'You do not have access to payroll data.') => {
  if (!hasPayrollAccess(user)) {
    throw new AppError(message, 403);
  }
};

const mapEmployeeRow = (row) => ({
  ...row,
  roles: normalizeRoles(row.roles || row.role, row.role || 'hunter'),
  role: resolvePrimaryRole(row.roles || row.role, row.role || 'hunter'),
  basicSalary: Number(row.basicSalary || 0),
  allowances: Number(row.allowances || 0),
  defaultDeductions: Number(row.defaultDeductions || 0),
});

const mapPayrollRow = (row) => ({
  ...row,
  basicSalary: Number(row.basicSalary || 0),
  allowances: Number(row.allowances || 0),
  bonuses: Number(row.bonuses || 0),
  deductions: Number(row.deductions || 0),
  advances: Number(row.advances || 0),
  unpaidLeaveDeduction: Number(row.unpaidLeaveDeduction || 0),
  lateDeduction: Number(row.lateDeduction || 0),
  netSalary: Number(row.netSalary || 0),
});

const mapExpenseRow = (row) => ({
  ...row,
  amount: Number(row.amount || 0),
});

const employeeSelect = `
  e.id,
  e.user_id AS "userId",
  e.employee_code AS "employeeCode",
  e.phone,
  e.national_id AS "nationalId",
  e.address,
  e.emergency_contact AS "emergencyContact",
  e.department,
  e.designation,
  e.manager_user_id AS "managerUserId",
  manager.name AS "managerName",
  e.joining_date AS "joiningDate",
  e.employment_type AS "employmentType",
  e.employment_status AS "employmentStatus",
  e.basic_salary AS "basicSalary",
  e.allowances,
  e.default_deductions AS "defaultDeductions",
  e.payment_method AS "paymentMethod",
  COALESCE(e.bank_details, '{}'::jsonb) AS "bankDetails",
  e.created_by AS "createdBy",
  e.updated_by AS "updatedBy",
  e.created_at AS "createdAt",
  e.updated_at AS "updatedAt",
  u.name AS "fullName",
  u.email,
  u.role,
  COALESCE(u.roles, jsonb_build_array(u.role::text)) AS roles,
  u.is_active AS "isActive",
  u.status
`;

const employeeJoin = `
  FROM employee_profiles e
  JOIN users u ON u.id = e.user_id
  LEFT JOIN users manager ON manager.id = e.manager_user_id
`;

const ensureHrTables = async () => {
  if (!ensureHrTablesPromise) {
    ensureHrTablesPromise = (async () => {
      try {
        await ensureUserRoleSchema();

        await pool.query(`
          CREATE TABLE IF NOT EXISTS employee_profiles (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            employee_code TEXT NOT NULL UNIQUE,
            phone TEXT,
            national_id TEXT,
            address TEXT,
            emergency_contact TEXT,
            department TEXT,
            designation TEXT,
            manager_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
            joining_date DATE,
            employment_type TEXT NOT NULL DEFAULT 'FULL_TIME',
            employment_status TEXT NOT NULL DEFAULT 'ACTIVE',
            basic_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
            allowances NUMERIC(10, 2) NOT NULL DEFAULT 0,
            default_deductions NUMERIC(10, 2) NOT NULL DEFAULT 0,
            payment_method TEXT,
            bank_details JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS hr_attendance (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
            attendance_date DATE NOT NULL,
            check_in_time TIME,
            check_out_time TIME,
            status TEXT NOT NULL DEFAULT 'PRESENT',
            late_minutes INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            marked_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (employee_profile_id, attendance_date)
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS hr_leave_requests (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
            leave_type TEXT NOT NULL,
            start_date DATE NOT NULL,
            end_date DATE NOT NULL,
            total_days NUMERIC(6, 2) NOT NULL DEFAULT 1,
            status TEXT NOT NULL DEFAULT 'PENDING',
            reason TEXT,
            review_notes TEXT,
            approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS hr_leave_balances (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_profile_id UUID NOT NULL UNIQUE REFERENCES employee_profiles(id) ON DELETE CASCADE,
            annual_days NUMERIC(6, 2) NOT NULL DEFAULT 14,
            sick_days NUMERIC(6, 2) NOT NULL DEFAULT 10,
            casual_days NUMERIC(6, 2) NOT NULL DEFAULT 5,
            emergency_days NUMERIC(6, 2) NOT NULL DEFAULT 3,
            unpaid_days NUMERIC(6, 2) NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS hr_payroll (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
            payroll_month DATE NOT NULL,
            basic_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
            allowances NUMERIC(10, 2) NOT NULL DEFAULT 0,
            bonuses NUMERIC(10, 2) NOT NULL DEFAULT 0,
            deductions NUMERIC(10, 2) NOT NULL DEFAULT 0,
            advances NUMERIC(10, 2) NOT NULL DEFAULT 0,
            unpaid_leave_deduction NUMERIC(10, 2) NOT NULL DEFAULT 0,
            late_deduction NUMERIC(10, 2) NOT NULL DEFAULT 0,
            net_salary NUMERIC(10, 2) NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'DRAFT',
            approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            paid_at TIMESTAMPTZ,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (employee_profile_id, payroll_month)
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS hr_expenses (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
            category TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
            expense_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'SUBMITTED',
            receipt_url TEXT,
            approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            paid_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS hr_employee_documents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
            document_type TEXT NOT NULL,
            title TEXT NOT NULL,
            file_name TEXT,
            file_url TEXT,
            notes TEXT,
            uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS hr_warnings (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
            warning_type TEXT NOT NULL,
            reason TEXT NOT NULL,
            details TEXT,
            issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
            issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            employee_response TEXT,
            attachment_url TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);

        await pool.query(`
          CREATE TABLE IF NOT EXISTS hr_performance_notes (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            employee_profile_id UUID NOT NULL REFERENCES employee_profiles(id) ON DELETE CASCADE,
            note_type TEXT NOT NULL DEFAULT 'GENERAL',
            note TEXT NOT NULL,
            created_by UUID REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
      } finally {
        ensureHrTablesPromise = null;
      }
    })();
  }

  return ensureHrTablesPromise;
};

const getOwnEmployeeProfile = async (user) => {
  await ensureHrTables();
  const result = await pool.query(
    `SELECT ${employeeSelect} ${employeeJoin} WHERE e.user_id = $1 LIMIT 1`,
    [user.id],
  );
  return result.rows[0] ? mapEmployeeRow(result.rows[0]) : null;
};

const getEmployeeById = async (viewer, id) => {
  await ensureHrTables();
  const result = await pool.query(
    `SELECT ${employeeSelect} ${employeeJoin} WHERE e.id = $1 LIMIT 1`,
    [id],
  );
  const employee = result.rows[0] ? mapEmployeeRow(result.rows[0]) : null;

  if (!employee) {
    throw new AppError('Employee not found.', 404);
  }

  if (!hasHrAccess(viewer) && employee.userId !== viewer.id) {
    throw new AppError('You do not have access to this employee record.', 403);
  }

  return employee;
};

const requireEmployeeForSelf = async (user) => {
  const employee = await getOwnEmployeeProfile(user);

  if (!employee) {
    throw new AppError('Employee profile not found for this user.', 404);
  }

  return employee;
};

const buildEmployeeFilters = (query = {}) => {
  const params = [];
  const where = [];

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(
      u.name ILIKE $${index}
      OR u.email ILIKE $${index}
      OR e.employee_code ILIKE $${index}
      OR COALESCE(e.department, '') ILIKE $${index}
      OR COALESCE(e.designation, '') ILIKE $${index}
    )`);
  }

  if (query.department) {
    params.push(query.department);
    where.push(`e.department = $${params.length}`);
  }

  if (query.status) {
    params.push(toUpperEnum(query.status, EMPLOYMENT_STATUSES, null));
    where.push(`e.employment_status = $${params.length}`);
  }

  if (query.role) {
    params.push(JSON.stringify([String(query.role).trim().toLowerCase()]));
    where.push(`COALESCE(u.roles, jsonb_build_array(u.role::text)) @> $${params.length}::jsonb`);
  }

  return {
    params,
    whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
  };
};

const listEmployees = async (viewer, query = {}) => {
  ensureHrManager(viewer);
  await ensureHrTables();
  const filters = buildEmployeeFilters(query);
  const defaultLimit = await getConfiguredLimit('users', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT COUNT(*) OVER()::int AS "totalCount", ${employeeSelect}
      ${employeeJoin}
      ${filters.whereSql}
      ORDER BY u.name
      LIMIT $${filters.params.length + 1}
      OFFSET $${filters.params.length + 2}
    `,
    [...filters.params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows.map(mapEmployeeRow),
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const createEmployee = async (viewer, payload = {}) => {
  ensureHrManager(viewer);
  await ensureHrTables();

  const userId = toText(payload.userId);
  const employeeCode = toText(payload.employeeCode) || `EMP-${randomUUID().slice(0, 8).toUpperCase()}`;

  if (!userId) {
    throw new AppError('User is required for employee creation.', 400);
  }

  const userResult = await pool.query(
    `SELECT id, deleted_at AS "deletedAt" FROM users WHERE id = $1 LIMIT 1`,
    [userId],
  );

  if (!userResult.rows[0] || userResult.rows[0].deletedAt) {
    throw new AppError('Linked user account was not found.', 404);
  }

  const existing = await pool.query(`SELECT id FROM employee_profiles WHERE user_id = $1 LIMIT 1`, [userId]);
  if (existing.rowCount > 0) {
    throw new AppError('This user already has an employee profile.', 409);
  }

  await pool.query(
    `
      INSERT INTO employee_profiles (
        user_id,
        employee_code,
        phone,
        national_id,
        address,
        emergency_contact,
        department,
        designation,
        manager_user_id,
        joining_date,
        employment_type,
        employment_status,
        basic_salary,
        allowances,
        default_deductions,
        payment_method,
        bank_details,
        created_by,
        updated_by
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $18
      )
    `,
    [
      userId,
      employeeCode,
      toText(payload.phone),
      toText(payload.nationalId),
      toText(payload.address),
      toText(payload.emergencyContact),
      toText(payload.department),
      toText(payload.designation),
      toText(payload.managerUserId),
      toDate(payload.joiningDate),
      toUpperEnum(payload.employmentType, EMPLOYMENT_TYPES, 'FULL_TIME'),
      toUpperEnum(payload.employmentStatus, EMPLOYMENT_STATUSES, 'ACTIVE'),
      toMoney(payload.basicSalary, 0),
      toMoney(payload.allowances, 0),
      toMoney(payload.defaultDeductions, 0),
      toText(payload.paymentMethod),
      JSON.stringify(payload.bankDetails || {}),
      viewer.id,
    ],
  );

  const employee = await pool.query(
    `SELECT ${employeeSelect} ${employeeJoin} WHERE e.user_id = $1 LIMIT 1`,
    [userId],
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'EMPLOYEE_CREATED',
    targetType: 'employee',
    targetId: employee.rows[0]?.id || null,
    details: {
      employeeCode,
      userId,
    },
  });

  return mapEmployeeRow(employee.rows[0]);
};

const updateEmployee = async (viewer, id, payload = {}) => {
  ensureHrManager(viewer);
  const employee = await getEmployeeById(viewer, id);
  const updates = [];
  const params = [];
  const add = (column, value, cast = '') => {
    params.push(value);
    updates.push(`${column} = $${params.length}${cast}`);
  };

  if (payload.employeeCode !== undefined) add('employee_code', toText(payload.employeeCode));
  if (payload.phone !== undefined) add('phone', toText(payload.phone));
  if (payload.nationalId !== undefined) add('national_id', toText(payload.nationalId));
  if (payload.address !== undefined) add('address', toText(payload.address));
  if (payload.emergencyContact !== undefined) add('emergency_contact', toText(payload.emergencyContact));
  if (payload.department !== undefined) add('department', toText(payload.department));
  if (payload.designation !== undefined) add('designation', toText(payload.designation));
  if (payload.managerUserId !== undefined) add('manager_user_id', toText(payload.managerUserId));
  if (payload.joiningDate !== undefined) add('joining_date', toDate(payload.joiningDate));
  if (payload.employmentType !== undefined) add('employment_type', toUpperEnum(payload.employmentType, EMPLOYMENT_TYPES, null));
  if (payload.employmentStatus !== undefined) add('employment_status', toUpperEnum(payload.employmentStatus, EMPLOYMENT_STATUSES, null));
  if (payload.basicSalary !== undefined) add('basic_salary', toMoney(payload.basicSalary, 0));
  if (payload.allowances !== undefined) add('allowances', toMoney(payload.allowances, 0));
  if (payload.defaultDeductions !== undefined) add('default_deductions', toMoney(payload.defaultDeductions, 0));
  if (payload.paymentMethod !== undefined) add('payment_method', toText(payload.paymentMethod));
  if (payload.bankDetails !== undefined) add('bank_details', JSON.stringify(payload.bankDetails || {}), '::jsonb');

  add('updated_by', viewer.id);

  if (updates.length === 1) {
    return employee;
  }

  params.push(id);
  await pool.query(
    `
      UPDATE employee_profiles
      SET ${updates.join(', ')},
          updated_at = NOW()
      WHERE id = $${params.length}
    `,
    params,
  );

  const updated = await getEmployeeById(viewer, id);
  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'EMPLOYEE_UPDATED',
    targetType: 'employee',
    targetId: id,
    details: {
      employeeCode: updated.employeeCode,
    },
  });
  return updated;
};

const listAttendance = async (viewer, query = {}) => {
  await ensureHrTables();
  const params = [];
  const where = [];

  if (!hasHrAccess(viewer)) {
    const employee = await requireEmployeeForSelf(viewer);
    params.push(employee.id);
    where.push(`a.employee_profile_id = $${params.length}`);
  } else if (query.employeeId) {
    params.push(query.employeeId);
    where.push(`a.employee_profile_id = $${params.length}`);
  }

  if (query.status) {
    params.push(toUpperEnum(query.status, ATTENDANCE_STATUSES, null));
    where.push(`a.status = $${params.length}`);
  }

  if (query.dateFrom) {
    params.push(query.dateFrom);
    where.push(`a.attendance_date >= $${params.length}`);
  }

  if (query.dateTo) {
    params.push(query.dateTo);
    where.push(`a.attendance_date <= $${params.length}`);
  }

  if (query.search) {
    params.push(`%${String(query.search).trim()}%`);
    const index = params.length;
    where.push(`(u.name ILIKE $${index} OR u.email ILIKE $${index} OR COALESCE(e.employee_code, '') ILIKE $${index})`);
  }

  const defaultLimit = await getConfiguredLimit('users', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        a.id,
        a.employee_profile_id AS "employeeId",
        e.employee_code AS "employeeCode",
        u.name AS "employeeName",
        u.email AS "employeeEmail",
        a.attendance_date AS "date",
        a.check_in_time AS "checkInTime",
        a.check_out_time AS "checkOutTime",
        a.status,
        a.late_minutes AS "lateMinutes",
        a.notes,
        a.marked_by AS "markedBy",
        marker.name AS "markedByName",
        a.created_at AS "createdAt",
        a.updated_at AS "updatedAt"
      FROM hr_attendance a
      JOIN employee_profiles e ON e.id = a.employee_profile_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN users marker ON marker.id = a.marked_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY a.attendance_date DESC, u.name
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const upsertAttendance = async (viewer, payload = {}) => {
  ensureHrManager(viewer, 'You do not have permission to mark attendance.');
  await ensureHrTables();

  const employeeId = toText(payload.employeeId);
  const date = toDate(payload.date);
  const status = toUpperEnum(payload.status, ATTENDANCE_STATUSES, null);

  if (!employeeId || !date || !status) {
    throw new AppError('Employee, date, and status are required.', 400);
  }

  await pool.query(
    `
      INSERT INTO hr_attendance (
        employee_profile_id,
        attendance_date,
        check_in_time,
        check_out_time,
        status,
        late_minutes,
        notes,
        marked_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (employee_profile_id, attendance_date) DO UPDATE
      SET check_in_time = EXCLUDED.check_in_time,
          check_out_time = EXCLUDED.check_out_time,
          status = EXCLUDED.status,
          late_minutes = EXCLUDED.late_minutes,
          notes = EXCLUDED.notes,
          marked_by = EXCLUDED.marked_by,
          updated_at = NOW()
      RETURNING id
    `,
    [
      employeeId,
      date,
      toText(payload.checkInTime),
      toText(payload.checkOutTime),
      status,
      toInteger(payload.lateMinutes, 0),
      toText(payload.notes),
      viewer.id,
    ],
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'ATTENDANCE_MARKED',
    targetType: 'attendance',
    details: {
      employeeId,
      date,
      status,
    },
  });
};

const updateAttendance = async (viewer, id, payload = {}) => {
  ensureHrManager(viewer, 'You do not have permission to edit attendance.');
  await ensureHrTables();
  const status = payload.status !== undefined ? toUpperEnum(payload.status, ATTENDANCE_STATUSES, null) : null;
  const result = await pool.query(
    `
      UPDATE hr_attendance
      SET check_in_time = COALESCE($2, check_in_time),
          check_out_time = COALESCE($3, check_out_time),
          status = COALESCE($4, status),
          late_minutes = COALESCE($5, late_minutes),
          notes = COALESCE($6, notes),
          marked_by = $7,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, employee_profile_id AS "employeeId", attendance_date AS "date"
    `,
    [
      id,
      toText(payload.checkInTime),
      toText(payload.checkOutTime),
      status,
      payload.lateMinutes !== undefined ? toInteger(payload.lateMinutes, 0) : null,
      toText(payload.notes),
      viewer.id,
    ],
  );

  if (!result.rows[0]) {
    throw new AppError('Attendance entry not found.', 404);
  }

  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'ATTENDANCE_MARKED',
    targetType: 'attendance',
    targetId: id,
    details: result.rows[0],
  });

  return result.rows[0];
};

const bulkMarkAttendance = async (viewer, rows = []) => {
  ensureHrManager(viewer, 'You do not have permission to bulk mark attendance.');
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new AppError('Add at least one attendance row.', 400);
  }

  for (const row of rows) {
    await upsertAttendance(viewer, row);
  }

  return { processed: rows.length };
};

const getLeaveDays = (startDate, endDate) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = end.getTime() - start.getTime();

  if (!Number.isFinite(diff) || diff < 0) {
    throw new AppError('Leave end date must be on or after the start date.', 400);
  }

  return Math.floor(diff / 86400000) + 1;
};

const listLeaves = async (viewer, query = {}) => {
  await ensureHrTables();
  const params = [];
  const where = [];

  if (!hasHrAccess(viewer)) {
    const employee = await requireEmployeeForSelf(viewer);
    params.push(employee.id);
    where.push(`l.employee_profile_id = $${params.length}`);
  } else if (query.employeeId) {
    params.push(query.employeeId);
    where.push(`l.employee_profile_id = $${params.length}`);
  }

  if (query.status) {
    params.push(toUpperEnum(query.status, LEAVE_STATUSES, null));
    where.push(`l.status = $${params.length}`);
  }

  if (query.leaveType) {
    params.push(toUpperEnum(query.leaveType, LEAVE_TYPES, null));
    where.push(`l.leave_type = $${params.length}`);
  }

  if (query.dateFrom) {
    params.push(query.dateFrom);
    where.push(`l.start_date >= $${params.length}`);
  }

  if (query.dateTo) {
    params.push(query.dateTo);
    where.push(`l.end_date <= $${params.length}`);
  }

  const defaultLimit = await getConfiguredLimit('users', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        l.id,
        l.employee_profile_id AS "employeeId",
        e.employee_code AS "employeeCode",
        u.name AS "employeeName",
        u.email AS "employeeEmail",
        l.leave_type AS "leaveType",
        l.start_date AS "startDate",
        l.end_date AS "endDate",
        l.total_days AS "totalDays",
        l.status,
        l.reason,
        l.review_notes AS "reviewNotes",
        l.approved_by AS "approvedBy",
        approver.name AS "approvedByName",
        l.approved_at AS "approvedAt",
        l.created_at AS "createdAt",
        l.updated_at AS "updatedAt"
      FROM hr_leave_requests l
      JOIN employee_profiles e ON e.id = l.employee_profile_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN users approver ON approver.id = l.approved_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY l.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows.map((row) => ({ ...row, totalDays: Number(row.totalDays || 0) })),
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const createLeave = async (viewer, payload = {}) => {
  await ensureHrTables();
  const employee = hasHrAccess(viewer) && payload.employeeId ? await getEmployeeById(viewer, payload.employeeId) : await requireEmployeeForSelf(viewer);
  const leaveType = toUpperEnum(payload.leaveType, LEAVE_TYPES, null);
  const startDate = toDate(payload.startDate);
  const endDate = toDate(payload.endDate);

  if (!leaveType || !startDate || !endDate) {
    throw new AppError('Leave type, start date, and end date are required.', 400);
  }

  const totalDays = getLeaveDays(startDate, endDate);
  const result = await pool.query(
    `
      INSERT INTO hr_leave_requests (
        employee_profile_id,
        leave_type,
        start_date,
        end_date,
        total_days,
        status,
        reason
      )
      VALUES ($1, $2, $3, $4, $5, 'PENDING', $6)
      RETURNING id
    `,
    [employee.id, leaveType, startDate, endDate, totalDays, toText(payload.reason)],
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'LEAVE_REQUESTED',
    targetType: 'leave',
    targetId: result.rows[0]?.id || null,
    details: {
      employeeId: employee.id,
      leaveType,
      totalDays,
    },
  });
};

const updateLeaveStatus = async (viewer, id, status, reviewNotes = null) => {
  ensureHrManager(viewer, 'You do not have permission to review leave requests.');
  const result = await pool.query(
    `
      UPDATE hr_leave_requests
      SET status = $2,
          review_notes = $3,
          approved_by = $4,
          approved_at = CASE WHEN $2 = 'APPROVED' THEN NOW() ELSE approved_at END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, employee_profile_id AS "employeeId", leave_type AS "leaveType"
    `,
    [id, status, toText(reviewNotes), viewer.id],
  );

  if (!result.rows[0]) {
    throw new AppError('Leave request not found.', 404);
  }

  await writeAuditLog({
    actorUserId: viewer.id,
    action: status === 'APPROVED' ? 'LEAVE_APPROVED' : 'LEAVE_REJECTED',
    targetType: 'leave',
    targetId: id,
    details: result.rows[0],
  });

  return result.rows[0];
};

const cancelLeave = async (viewer, id) => {
  await ensureHrTables();
  const result = await pool.query(
    `
      UPDATE hr_leave_requests l
      SET status = 'CANCELLED',
          updated_at = NOW()
      FROM employee_profiles e
      WHERE l.id = $1
        AND e.id = l.employee_profile_id
        AND ($2 = TRUE OR e.user_id = $3)
      RETURNING l.id
    `,
    [id, hasHrAccess(viewer), viewer.id],
  );

  if (!result.rows[0]) {
    throw new AppError('Leave request not found or cannot be cancelled.', 404);
  }

  return { cancelled: true };
};

const computeNetSalary = (payload = {}) =>
  toMoney(payload.basicSalary, 0) +
  toMoney(payload.allowances, 0) +
  toMoney(payload.bonuses, 0) -
  toMoney(payload.deductions, 0) -
  toMoney(payload.advances, 0) -
  toMoney(payload.unpaidLeaveDeduction, 0) -
  toMoney(payload.lateDeduction, 0);

const listPayroll = async (viewer, query = {}) => {
  await ensureHrTables();
  ensurePayrollManager(viewer, 'You do not have permission to view payroll data.');

  const params = [];
  const where = [];

  if (!hasPayrollAccess(viewer)) {
    const employee = await requireEmployeeForSelf(viewer);
    params.push(employee.id);
    where.push(`p.employee_profile_id = $${params.length}`);
  } else if (query.employeeId) {
    params.push(query.employeeId);
    where.push(`p.employee_profile_id = $${params.length}`);
  }

  if (query.status) {
    params.push(toUpperEnum(query.status, PAYROLL_STATUSES, null));
    where.push(`p.status = $${params.length}`);
  }

  if (query.payrollMonth) {
    params.push(query.payrollMonth);
    where.push(`date_trunc('month', p.payroll_month) = date_trunc('month', $${params.length}::date)`);
  }

  const defaultLimit = await getConfiguredLimit('reports', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        p.id,
        p.employee_profile_id AS "employeeId",
        e.employee_code AS "employeeCode",
        u.name AS "employeeName",
        u.email AS "employeeEmail",
        p.payroll_month AS "payrollMonth",
        p.basic_salary AS "basicSalary",
        p.allowances,
        p.bonuses,
        p.deductions,
        p.advances,
        p.unpaid_leave_deduction AS "unpaidLeaveDeduction",
        p.late_deduction AS "lateDeduction",
        p.net_salary AS "netSalary",
        p.status,
        p.approved_by AS "approvedBy",
        approver.name AS "approvedByName",
        p.approved_at AS "approvedAt",
        p.paid_at AS "paidAt",
        p.created_at AS "createdAt",
        p.updated_at AS "updatedAt"
      FROM hr_payroll p
      JOIN employee_profiles e ON e.id = p.employee_profile_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN users approver ON approver.id = p.approved_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY p.payroll_month DESC, u.name
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows.map(mapPayrollRow),
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const generatePayroll = async (viewer, payload = {}) => {
  ensurePayrollManager(viewer);
  const employee = await getEmployeeById(viewer, payload.employeeId);
  const payrollMonth = toDate(payload.payrollMonth);

  if (!payrollMonth) {
    throw new AppError('Payroll month is required.', 400);
  }

  const computed = {
    basicSalary: payload.basicSalary ?? employee.basicSalary,
    allowances: payload.allowances ?? employee.allowances,
    bonuses: payload.bonuses ?? 0,
    deductions: payload.deductions ?? employee.defaultDeductions,
    advances: payload.advances ?? 0,
    unpaidLeaveDeduction: payload.unpaidLeaveDeduction ?? 0,
    lateDeduction: payload.lateDeduction ?? 0,
  };
  const netSalary = computeNetSalary(computed);

  const result = await pool.query(
    `
      INSERT INTO hr_payroll (
        employee_profile_id,
        payroll_month,
        basic_salary,
        allowances,
        bonuses,
        deductions,
        advances,
        unpaid_leave_deduction,
        late_deduction,
        net_salary,
        status,
        created_by,
        updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'DRAFT', $11, $11)
      ON CONFLICT (employee_profile_id, payroll_month) DO UPDATE
      SET basic_salary = EXCLUDED.basic_salary,
          allowances = EXCLUDED.allowances,
          bonuses = EXCLUDED.bonuses,
          deductions = EXCLUDED.deductions,
          advances = EXCLUDED.advances,
          unpaid_leave_deduction = EXCLUDED.unpaid_leave_deduction,
          late_deduction = EXCLUDED.late_deduction,
          net_salary = EXCLUDED.net_salary,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      RETURNING id
    `,
    [
      employee.id,
      payrollMonth,
      toMoney(computed.basicSalary, 0),
      toMoney(computed.allowances, 0),
      toMoney(computed.bonuses, 0),
      toMoney(computed.deductions, 0),
      toMoney(computed.advances, 0),
      toMoney(computed.unpaidLeaveDeduction, 0),
      toMoney(computed.lateDeduction, 0),
      netSalary,
      viewer.id,
    ],
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'PAYROLL_GENERATED',
    targetType: 'payroll',
    targetId: result.rows[0]?.id || null,
    details: {
      employeeId: employee.id,
      payrollMonth,
      netSalary,
    },
  });
};

const updatePayroll = async (viewer, id, payload = {}) => {
  ensurePayrollManager(viewer);
  const current = await pool.query(`SELECT * FROM hr_payroll WHERE id = $1 LIMIT 1`, [id]);

  if (!current.rows[0]) {
    throw new AppError('Payroll record not found.', 404);
  }

  const next = {
    basicSalary: payload.basicSalary ?? current.rows[0].basic_salary,
    allowances: payload.allowances ?? current.rows[0].allowances,
    bonuses: payload.bonuses ?? current.rows[0].bonuses,
    deductions: payload.deductions ?? current.rows[0].deductions,
    advances: payload.advances ?? current.rows[0].advances,
    unpaidLeaveDeduction: payload.unpaidLeaveDeduction ?? current.rows[0].unpaid_leave_deduction,
    lateDeduction: payload.lateDeduction ?? current.rows[0].late_deduction,
  };
  const netSalary = computeNetSalary(next);

  await pool.query(
    `
      UPDATE hr_payroll
      SET basic_salary = $2,
          allowances = $3,
          bonuses = $4,
          deductions = $5,
          advances = $6,
          unpaid_leave_deduction = $7,
          late_deduction = $8,
          net_salary = $9,
          updated_by = $10,
          updated_at = NOW()
      WHERE id = $1
    `,
    [
      id,
      toMoney(next.basicSalary, 0),
      toMoney(next.allowances, 0),
      toMoney(next.bonuses, 0),
      toMoney(next.deductions, 0),
      toMoney(next.advances, 0),
      toMoney(next.unpaidLeaveDeduction, 0),
      toMoney(next.lateDeduction, 0),
      netSalary,
      viewer.id,
    ],
  );
};

const setPayrollStatus = async (viewer, id, status) => {
  ensurePayrollManager(viewer);
  const result = await pool.query(
    `
      UPDATE hr_payroll
      SET status = $2,
          approved_by = CASE WHEN $2 = 'APPROVED' THEN $3 ELSE approved_by END,
          approved_at = CASE WHEN $2 = 'APPROVED' THEN NOW() ELSE approved_at END,
          paid_at = CASE WHEN $2 = 'PAID' THEN NOW() ELSE paid_at END,
          updated_by = $3,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, employee_profile_id AS "employeeId"
    `,
    [id, status, viewer.id],
  );

  if (!result.rows[0]) {
    throw new AppError('Payroll record not found.', 404);
  }

  await writeAuditLog({
    actorUserId: viewer.id,
    action: status === 'APPROVED' ? 'PAYROLL_APPROVED' : 'PAYROLL_PAID',
    targetType: 'payroll',
    targetId: id,
    details: result.rows[0],
  });
};

const listExpenses = async (viewer, query = {}) => {
  await ensureHrTables();
  const params = [];
  const where = [];

  if (!hasHrAccess(viewer)) {
    const employee = await requireEmployeeForSelf(viewer);
    params.push(employee.id);
    where.push(`x.employee_profile_id = $${params.length}`);
  } else if (query.employeeId) {
    params.push(query.employeeId);
    where.push(`x.employee_profile_id = $${params.length}`);
  }

  if (query.status) {
    params.push(toUpperEnum(query.status, EXPENSE_STATUSES, null));
    where.push(`x.status = $${params.length}`);
  }

  if (query.category) {
    params.push(toUpperEnum(query.category, EXPENSE_CATEGORIES, null));
    where.push(`x.category = $${params.length}`);
  }

  const defaultLimit = await getConfiguredLimit('users', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        x.id,
        x.employee_profile_id AS "employeeId",
        e.employee_code AS "employeeCode",
        u.name AS "employeeName",
        u.email AS "employeeEmail",
        x.category,
        x.title,
        x.description,
        x.amount,
        x.expense_date AS "expenseDate",
        x.status,
        x.receipt_url AS "receiptUrl",
        x.approved_by AS "approvedBy",
        approver.name AS "approvedByName",
        x.approved_at AS "approvedAt",
        x.paid_at AS "paidAt",
        x.created_at AS "createdAt",
        x.updated_at AS "updatedAt"
      FROM hr_expenses x
      JOIN employee_profiles e ON e.id = x.employee_profile_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN users approver ON approver.id = x.approved_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY x.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows.map(mapExpenseRow),
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const createExpense = async (viewer, payload = {}) => {
  await ensureHrTables();
  const employee = hasHrAccess(viewer) && payload.employeeId ? await getEmployeeById(viewer, payload.employeeId) : await requireEmployeeForSelf(viewer);
  const category = toUpperEnum(payload.category, EXPENSE_CATEGORIES, null);
  const title = toText(payload.title);
  const amount = toMoney(payload.amount, 0);
  const expenseDate = toDate(payload.expenseDate);

  if (!category || !title || amount <= 0 || !expenseDate) {
    throw new AppError('Category, title, amount, and expense date are required.', 400);
  }

  const result = await pool.query(
    `
      INSERT INTO hr_expenses (
        employee_profile_id,
        category,
        title,
        description,
        amount,
        expense_date,
        status,
        receipt_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTED', $7)
      RETURNING id
    `,
    [employee.id, category, title, toText(payload.description), amount, expenseDate, toText(payload.receiptUrl)],
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'EXPENSE_SUBMITTED',
    targetType: 'expense',
    targetId: result.rows[0]?.id || null,
    details: {
      employeeId: employee.id,
      category,
      amount,
    },
  });
};

const setExpenseStatus = async (viewer, id, status) => {
  ensureHrManager(viewer, 'You do not have permission to review expenses.');
  const result = await pool.query(
    `
      UPDATE hr_expenses
      SET status = $2,
          approved_by = CASE WHEN $2 IN ('APPROVED', 'REJECTED', 'PAID') THEN $3 ELSE approved_by END,
          approved_at = CASE WHEN $2 IN ('APPROVED', 'REJECTED') THEN NOW() ELSE approved_at END,
          paid_at = CASE WHEN $2 = 'PAID' THEN NOW() ELSE paid_at END,
          updated_at = NOW()
      WHERE id = $1
      RETURNING id, employee_profile_id AS "employeeId", amount
    `,
    [id, status, viewer.id],
  );

  if (!result.rows[0]) {
    throw new AppError('Expense record not found.', 404);
  }

  await writeAuditLog({
    actorUserId: viewer.id,
    action:
      status === 'APPROVED'
        ? 'EXPENSE_APPROVED'
        : status === 'REJECTED'
          ? 'EXPENSE_REJECTED'
          : 'EXPENSE_APPROVED',
    targetType: 'expense',
    targetId: id,
    details: result.rows[0],
  });
};

const listWarnings = async (viewer, query = {}) => {
  await ensureHrTables();
  const params = [];
  const where = [];

  if (!hasHrAccess(viewer)) {
    const employee = await requireEmployeeForSelf(viewer);
    params.push(employee.id);
    where.push(`w.employee_profile_id = $${params.length}`);
  } else if (query.employeeId) {
    params.push(query.employeeId);
    where.push(`w.employee_profile_id = $${params.length}`);
  }

  const defaultLimit = await getConfiguredLimit('users', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        w.id,
        w.employee_profile_id AS "employeeId",
        e.employee_code AS "employeeCode",
        u.name AS "employeeName",
        u.email AS "employeeEmail",
        w.warning_type AS "warningType",
        w.reason,
        w.details,
        w.issued_by AS "issuedBy",
        issuer.name AS "issuedByName",
        w.issued_at AS "issuedAt",
        w.employee_response AS "employeeResponse",
        w.attachment_url AS "attachmentUrl",
        w.created_at AS "createdAt"
      FROM hr_warnings w
      JOIN employee_profiles e ON e.id = w.employee_profile_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN users issuer ON issuer.id = w.issued_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY w.issued_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const createWarning = async (viewer, payload = {}) => {
  ensureHrManager(viewer, 'You do not have permission to issue warnings.');
  const employee = await getEmployeeById(viewer, payload.employeeId);
  const warningType = toUpperEnum(payload.warningType, WARNING_TYPES, null);
  const reason = toText(payload.reason);

  if (!warningType || !reason) {
    throw new AppError('Warning type and reason are required.', 400);
  }

  const result = await pool.query(
    `
      INSERT INTO hr_warnings (
        employee_profile_id,
        warning_type,
        reason,
        details,
        issued_by,
        employee_response,
        attachment_url
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      employee.id,
      warningType,
      reason,
      toText(payload.details),
      viewer.id,
      toText(payload.employeeResponse),
      toText(payload.attachmentUrl),
    ],
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'WARNING_ISSUED',
    targetType: 'warning',
    targetId: result.rows[0]?.id || null,
    details: {
      employeeId: employee.id,
      warningType,
    },
  });
};

const listDocuments = async (viewer, query = {}) => {
  await ensureHrTables();
  const params = [];
  const where = [];

  if (!hasHrAccess(viewer)) {
    const employee = await requireEmployeeForSelf(viewer);
    params.push(employee.id);
    where.push(`d.employee_profile_id = $${params.length}`);
  } else if (query.employeeId) {
    params.push(query.employeeId);
    where.push(`d.employee_profile_id = $${params.length}`);
  }

  if (query.documentType) {
    params.push(toUpperEnum(query.documentType, DOCUMENT_TYPES, null));
    where.push(`d.document_type = $${params.length}`);
  }

  const defaultLimit = await getConfiguredLimit('users', query.limit);
  const pageRequest = normalizePageRequest(query, defaultLimit);
  const result = await pool.query(
    `
      SELECT
        COUNT(*) OVER()::int AS "totalCount",
        d.id,
        d.employee_profile_id AS "employeeId",
        e.employee_code AS "employeeCode",
        u.name AS "employeeName",
        d.document_type AS "documentType",
        d.title,
        d.file_name AS "fileName",
        d.file_url AS "fileUrl",
        d.notes,
        d.uploaded_by AS "uploadedBy",
        uploader.name AS "uploadedByName",
        d.created_at AS "createdAt",
        d.updated_at AS "updatedAt"
      FROM hr_employee_documents d
      JOIN employee_profiles e ON e.id = d.employee_profile_id
      JOIN users u ON u.id = e.user_id
      LEFT JOIN users uploader ON uploader.id = d.uploaded_by
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY d.created_at DESC
      LIMIT $${params.length + 1}
      OFFSET $${params.length + 2}
    `,
    [...params, pageRequest.limit, pageRequest.offset],
  );

  return {
    items: result.rows,
    ...buildPageMeta(pageRequest.page, pageRequest.limit, result.rows[0]?.totalCount || 0),
  };
};

const uploadDocument = async (viewer, payload = {}) => {
  ensureHrManager(viewer, 'You do not have permission to manage employee documents.');
  const employee = await getEmployeeById(viewer, payload.employeeId);
  const documentType = toUpperEnum(payload.documentType, DOCUMENT_TYPES, null);
  const title = toText(payload.title);

  if (!documentType || !title) {
    throw new AppError('Document type and title are required.', 400);
  }

  const result = await pool.query(
    `
      INSERT INTO hr_employee_documents (
        employee_profile_id,
        document_type,
        title,
        file_name,
        file_url,
        notes,
        uploaded_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      employee.id,
      documentType,
      title,
      toText(payload.fileName),
      toText(payload.fileUrl),
      toText(payload.notes),
      viewer.id,
    ],
  );

  await writeAuditLog({
    actorUserId: viewer.id,
    action: 'DOCUMENT_UPLOADED',
    targetType: 'document',
    targetId: result.rows[0]?.id || null,
    details: {
      employeeId: employee.id,
      documentType,
      title,
    },
  });
};

const deleteDocument = async (viewer, id) => {
  ensureHrManager(viewer, 'You do not have permission to delete employee documents.');
  const result = await pool.query(`DELETE FROM hr_employee_documents WHERE id = $1 RETURNING id`, [id]);

  if (!result.rows[0]) {
    throw new AppError('Document not found.', 404);
  }

  return { deleted: true };
};

const getHrDashboard = async (viewer, query = {}) => {
  ensureHrManager(viewer, 'You do not have access to the HR dashboard.');
  await ensureHrTables();
  const dateFrom = toDate(query.dateFrom) || new Date().toISOString().slice(0, 10);
  const dateTo = toDate(query.dateTo) || dateFrom;

  const [summary, attendanceTrend, pendingLeaves, pendingExpenses, upcomingLeaves, recentActivity] = await Promise.all([
    pool.query(
      `
        SELECT
          COUNT(e.id)::int AS "totalEmployees",
          COUNT(e.id) FILTER (WHERE e.employment_status = 'ACTIVE')::int AS "activeEmployees",
          COUNT(a.id) FILTER (WHERE a.attendance_date = CURRENT_DATE AND a.status = 'PRESENT')::int AS "presentToday",
          COUNT(a.id) FILTER (WHERE a.attendance_date = CURRENT_DATE AND a.status = 'ABSENT')::int AS "absentToday",
          COUNT(a.id) FILTER (WHERE a.attendance_date = CURRENT_DATE AND a.status = 'LATE')::int AS "lateToday",
          COUNT(l.id) FILTER (WHERE l.status = 'APPROVED' AND CURRENT_DATE BETWEEN l.start_date AND l.end_date)::int AS "onLeave",
          COUNT(l.id) FILTER (WHERE l.status = 'PENDING')::int AS "pendingLeaves",
          COUNT(x.id) FILTER (WHERE x.status = 'SUBMITTED')::int AS "pendingExpenses",
          COALESCE(SUM(p.net_salary) FILTER (WHERE date_trunc('month', p.payroll_month) = date_trunc('month', CURRENT_DATE)), 0)::numeric(10,2) AS "monthlySalaryCost"
        FROM employee_profiles e
        LEFT JOIN hr_attendance a ON a.employee_profile_id = e.id
        LEFT JOIN hr_leave_requests l ON l.employee_profile_id = e.id
        LEFT JOIN hr_expenses x ON x.employee_profile_id = e.id
        LEFT JOIN hr_payroll p ON p.employee_profile_id = e.id
      `,
    ),
    pool.query(
      `
        SELECT
          a.attendance_date AS "date",
          COUNT(*) FILTER (WHERE a.status = 'PRESENT')::int AS "present",
          COUNT(*) FILTER (WHERE a.status = 'ABSENT')::int AS "absent",
          COUNT(*) FILTER (WHERE a.status = 'LATE')::int AS "late"
        FROM hr_attendance a
        WHERE a.attendance_date BETWEEN $1 AND $2
        GROUP BY a.attendance_date
        ORDER BY a.attendance_date DESC
      `,
      [dateFrom, dateTo],
    ),
    pool.query(
      `
        SELECT l.id, u.name AS "employeeName", l.leave_type AS "leaveType", l.start_date AS "startDate", l.end_date AS "endDate"
        FROM hr_leave_requests l
        JOIN employee_profiles e ON e.id = l.employee_profile_id
        JOIN users u ON u.id = e.user_id
        WHERE l.status = 'PENDING'
        ORDER BY l.created_at DESC
        LIMIT 10
      `,
    ),
    pool.query(
      `
        SELECT x.id, u.name AS "employeeName", x.category, x.amount, x.expense_date AS "expenseDate"
        FROM hr_expenses x
        JOIN employee_profiles e ON e.id = x.employee_profile_id
        JOIN users u ON u.id = e.user_id
        WHERE x.status = 'SUBMITTED'
        ORDER BY x.created_at DESC
        LIMIT 10
      `,
    ),
    pool.query(
      `
        SELECT l.id, u.name AS "employeeName", l.leave_type AS "leaveType", l.start_date AS "startDate", l.end_date AS "endDate"
        FROM hr_leave_requests l
        JOIN employee_profiles e ON e.id = l.employee_profile_id
        JOIN users u ON u.id = e.user_id
        WHERE l.status = 'APPROVED' AND l.start_date >= CURRENT_DATE
        ORDER BY l.start_date ASC
        LIMIT 10
      `,
    ),
    pool.query(
      `
        SELECT id, action, target_type AS "targetType", created_at AS "createdAt", details
        FROM audit_logs
        WHERE action IN (
          'EMPLOYEE_CREATED',
          'EMPLOYEE_UPDATED',
          'ATTENDANCE_MARKED',
          'LEAVE_REQUESTED',
          'LEAVE_APPROVED',
          'LEAVE_REJECTED',
          'PAYROLL_GENERATED',
          'PAYROLL_APPROVED',
          'PAYROLL_PAID',
          'EXPENSE_SUBMITTED',
          'EXPENSE_APPROVED',
          'EXPENSE_REJECTED',
          'WARNING_ISSUED',
          'DOCUMENT_UPLOADED'
        )
        ORDER BY created_at DESC
        LIMIT 10
      `,
    ),
  ]);

  return {
    ...summary.rows[0],
    monthlySalaryCost: Number(summary.rows[0]?.monthlySalaryCost || 0),
    attendanceTrend: attendanceTrend.rows,
    pendingApprovals: {
      leaves: pendingLeaves.rows,
      expenses: pendingExpenses.rows,
    },
    upcomingLeaves: upcomingLeaves.rows,
    recentActivity: recentActivity.rows,
  };
};

const getAttendanceReport = async (viewer, query = {}) => {
  ensureHrManager(viewer);
  await ensureHrTables();
  const list = await listAttendance(viewer, { ...query, limit: query.limit || 100 });
  const summary = await pool.query(
    `
      SELECT
        COUNT(*) FILTER (WHERE status = 'PRESENT')::int AS present,
        COUNT(*) FILTER (WHERE status = 'ABSENT')::int AS absent,
        COUNT(*) FILTER (WHERE status = 'LATE')::int AS late,
        COUNT(*) FILTER (WHERE status = 'HALF_DAY')::int AS "halfDay",
        COUNT(*) FILTER (WHERE status = 'ON_LEAVE')::int AS "onLeave",
        COUNT(*) FILTER (WHERE status = 'WORK_FROM_HOME')::int AS "workFromHome"
      FROM hr_attendance
    `,
  );

  return {
    summary: summary.rows[0] || {},
    rows: list.items,
  };
};

const getPayrollReport = async (viewer, query = {}) => {
  ensurePayrollManager(viewer);
  const list = await listPayroll(viewer, { ...query, limit: query.limit || 100 });
  const summary = await pool.query(
    `
      SELECT
        COUNT(*)::int AS "totalPayrolls",
        COALESCE(SUM(net_salary), 0)::numeric(10,2) AS "totalNetSalary",
        COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid
      FROM hr_payroll
    `,
  );
  return {
    summary: {
      ...summary.rows[0],
      totalNetSalary: Number(summary.rows[0]?.totalNetSalary || 0),
    },
    rows: list.items,
  };
};

const getExpenseReport = async (viewer, query = {}) => {
  ensureHrManager(viewer);
  const list = await listExpenses(viewer, { ...query, limit: query.limit || 100 });
  const summary = await pool.query(
    `
      SELECT
        COUNT(*)::int AS "totalExpenses",
        COALESCE(SUM(amount), 0)::numeric(10,2) AS "totalAmount",
        COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted,
        COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected,
        COUNT(*) FILTER (WHERE status = 'PAID')::int AS paid
      FROM hr_expenses
    `,
  );
  return {
    summary: {
      ...summary.rows[0],
      totalAmount: Number(summary.rows[0]?.totalAmount || 0),
    },
    rows: list.items,
  };
};

const getPerformanceReport = async (viewer) => {
  ensureHrManager(viewer);
  await ensureHrTables();
  const result = await pool.query(
    `
      SELECT
        e.id AS "employeeId",
        e.employee_code AS "employeeCode",
        u.id AS "userId",
        u.name AS "employeeName",
        u.email AS "employeeEmail",
        u.role,
        COALESCE(u.roles, jsonb_build_array(u.role::text)) AS roles,
        e.department,
        e.designation,
        COUNT(DISTINCT p.id) FILTER (WHERE p.hunter_id = u.id) AS "productsSubmitted",
        COUNT(DISTINCT p.id) FILTER (WHERE p.hunter_id = u.id AND p.status = 'approved') AS "approvedProducts",
        COUNT(DISTINCT p.id) FILTER (WHERE p.hunter_id = u.id AND p.status = 'rejected') AS "rejectedProducts",
        COUNT(DISTINCT o.id) FILTER (WHERE o.hunter_id = u.id) AS "ordersReceived",
        COALESCE(SUM(o.profit) FILTER (WHERE o.hunter_id = u.id), 0)::numeric(10,2) AS "profitGenerated",
        COUNT(DISTINCT o.id) FILTER (WHERE o.created_by = u.id) AS "ordersAdded",
        COUNT(DISTINCT o.id) FILTER (WHERE o.created_by = u.id AND o.order_status IN ('PLACED', 'SHIPPED', 'DELIVERED')) AS "ordersPlaced",
        COUNT(DISTINCT o.id) FILTER (WHERE o.created_by = u.id AND o.order_status = 'ISSUE') AS "issueOrders",
        COUNT(DISTINCT o.id) FILTER (WHERE o.created_by = u.id AND o.profit < 0) AS "lossOrders",
        COUNT(DISTINCT c.id) FILTER (WHERE c.lister_id = u.id) AS "changeRequests",
        COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('PRESENT', 'WORK_FROM_HOME')) AS "attendanceGoodDays",
        COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'APPROVED') AS "approvedLeaves",
        COUNT(DISTINCT w.id) AS "warnings"
      FROM employee_profiles e
      JOIN users u ON u.id = e.user_id
      LEFT JOIN products p ON p.hunter_id = u.id
      LEFT JOIN orders o ON o.hunter_id = u.id OR o.created_by = u.id
      LEFT JOIN product_change_requests c ON c.lister_id = u.id
      LEFT JOIN hr_attendance a ON a.employee_profile_id = e.id
      LEFT JOIN hr_leave_requests l ON l.employee_profile_id = e.id
      LEFT JOIN hr_warnings w ON w.employee_profile_id = e.id
      GROUP BY e.id, e.employee_code, u.id, u.name, u.email, u.role, u.roles, e.department, e.designation
      ORDER BY u.name
    `,
  );

  return result.rows.map((row) => ({
    ...row,
    roles: normalizeRoles(row.roles || row.role, row.role || 'hunter'),
    role: resolvePrimaryRole(row.roles || row.role, row.role || 'hunter'),
    profitGenerated: Number(row.profitGenerated || 0),
  }));
};

const getMyHr = async (viewer) => {
  await ensureHrTables();
  const employee = await requireEmployeeForSelf(viewer);
  const [attendance, leaves, expenses, payroll, warnings] = await Promise.all([
    listAttendance(viewer, { limit: 12 }),
    listLeaves(viewer, { limit: 12 }),
    hasPayrollAccess(viewer) ? listPayroll(viewer, { employeeId: employee.id, limit: 12 }) : Promise.resolve({ items: [] }),
    listExpenses(viewer, { limit: 12 }),
    listWarnings(viewer, { limit: 12 }),
  ]);

  return {
    employee,
    attendance: attendance.items,
    leaves: leaves.items,
    payroll: payroll.items || [],
    expenses: expenses.items,
    warnings: warnings.items,
  };
};

module.exports = {
  EMPLOYMENT_TYPES,
  EMPLOYMENT_STATUSES,
  ATTENDANCE_STATUSES,
  LEAVE_TYPES,
  LEAVE_STATUSES,
  PAYROLL_STATUSES,
  EXPENSE_CATEGORIES,
  EXPENSE_STATUSES,
  WARNING_TYPES,
  DOCUMENT_TYPES,
  ensureHrTables,
  hasHrAccess,
  listEmployees,
  createEmployee,
  getEmployeeById,
  updateEmployee,
  listAttendance,
  upsertAttendance,
  updateAttendance,
  bulkMarkAttendance,
  listLeaves,
  createLeave,
  updateLeaveStatus,
  cancelLeave,
  listPayroll,
  generatePayroll,
  updatePayroll,
  setPayrollStatus,
  listExpenses,
  createExpense,
  setExpenseStatus,
  listWarnings,
  createWarning,
  listDocuments,
  uploadDocument,
  deleteDocument,
  getHrDashboard,
  getAttendanceReport,
  getPayrollReport,
  getExpenseReport,
  getPerformanceReport,
  getMyHr,
};
