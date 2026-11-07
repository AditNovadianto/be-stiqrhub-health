import { db } from "../config/db.js";

const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

export async function getAllUserRoles() {
  const [rows] = await db.query(
    `
      SELECT
        id_user_role,
        name_user_role
      FROM user_roles
      ORDER BY id_user_role ASC
    `,
  );

  return rows;
}

export async function getUserRoleById(id_user_role) {
  const [rows] = await db.query(
    `
      SELECT
        id_user_role,
        name_user_role
      FROM user_roles
      WHERE id_user_role = ?
      LIMIT 1
    `,
    [id_user_role],
  );

  return rows[0] || null;
}

export async function getUserRoleByName(name_user_role) {
  const [rows] = await db.query(
    `
      SELECT
        id_user_role,
        name_user_role
      FROM user_roles
      WHERE LOWER(name_user_role) = LOWER(?)
      LIMIT 1
    `,
    [name_user_role],
  );

  return rows[0] || null;
}

export async function createUserRole(name_user_role) {
  if (typeof name_user_role !== "string" || !name_user_role.trim()) {
    throw errorWithStatus("Nama user role wajib diisi", 400);
  }

  const normalizedName = name_user_role.trim();

  if (normalizedName.length > 255) {
    throw errorWithStatus("Nama user role maksimal 255 karakter", 400);
  }

  const existing = await getUserRoleByName(normalizedName);

  if (existing) {
    throw errorWithStatus("User role sudah tersedia", 409);
  }

  const [result] = await db.query(
    `
      INSERT INTO user_roles (
        name_user_role
      )
      VALUES (?)
    `,
    [normalizedName],
  );

  return getUserRoleById(result.insertId);
}

export async function updateUserRole(id_user_role, data) {
  const existing = await getUserRoleById(id_user_role);

  if (!existing) {
    throw errorWithStatus("User role tidak ditemukan", 404);
  }

  if (!data || typeof data !== "object") {
    throw errorWithStatus("Data user role tidak valid", 400);
  }

  const fields = [];
  const values = [];

  if (data.name_user_role !== undefined) {
    if (
      typeof data.name_user_role !== "string" ||
      !data.name_user_role.trim()
    ) {
      throw errorWithStatus("Nama user role wajib diisi", 400);
    }

    const normalizedName = data.name_user_role.trim();

    if (normalizedName.length > 255) {
      throw errorWithStatus("Nama user role maksimal 255 karakter", 400);
    }

    const duplicate = await getUserRoleByName(normalizedName);

    if (duplicate && Number(duplicate.id_user_role) !== Number(id_user_role)) {
      throw errorWithStatus("Nama user role sudah digunakan", 409);
    }

    fields.push("name_user_role = ?");

    values.push(normalizedName);
  }

  if (fields.length === 0) {
    throw errorWithStatus("Tidak ada data yang diperbarui", 400);
  }

  values.push(id_user_role);

  await db.query(
    `
      UPDATE user_roles
      SET ${fields.join(", ")}
      WHERE id_user_role = ?
    `,
    values,
  );

  return getUserRoleById(id_user_role);
}

export async function isUserRoleUsed(id_user_role) {
  const [rows] = await db.query(
    `
      SELECT
        COUNT(*) AS total
      FROM users
      WHERE id_user_role = ?
    `,
    [id_user_role],
  );

  return Number(rows[0]?.total || 0) > 0;
}

export async function deleteUserRole(id_user_role) {
  const existing = await getUserRoleById(id_user_role);

  if (!existing) {
    throw errorWithStatus("User role tidak ditemukan", 404);
  }

  const isUsed = await isUserRoleUsed(id_user_role);

  if (isUsed) {
    throw errorWithStatus(
      "User role tidak dapat dihapus karena masih digunakan oleh user",
      409,
    );
  }

  const [result] = await db.query(
    `
      DELETE FROM user_roles
      WHERE id_user_role = ?
    `,
    [id_user_role],
  );

  return result.affectedRows > 0;
}
