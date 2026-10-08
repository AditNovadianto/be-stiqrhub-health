import { db } from "../config/db.js";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

// GET ALL PROVIDER ROLES
export async function getAllProviderRoles() {
  const [rows] = await db.query(
    `
        SELECT
          id_provider_role,
          name_provider_role
        FROM provider_roles
        ORDER BY id_provider_role ASC
      `,
  );

  return rows;
}

// GET PROVIDER ROLE BY ID
export async function getProviderRoleById(id_provider_role) {
  const [rows] = await db.query(
    `
        SELECT
          id_provider_role,
          name_provider_role
        FROM provider_roles
        WHERE id_provider_role = ?
        LIMIT 1
      `,
    [id_provider_role],
  );

  return rows[0] || null;
}

// FIND BY NAME
export async function getProviderRoleByName(name_provider_role) {
  const [rows] = await db.query(
    `
        SELECT
          id_provider_role,
          name_provider_role
        FROM provider_roles
        WHERE LOWER(
          name_provider_role
        ) = LOWER(?)
        LIMIT 1
      `,
    [name_provider_role],
  );

  return rows[0] || null;
}

// CREATE PROVIDER ROLE
export async function createProviderRole(name_provider_role) {
  const existing = await getProviderRoleByName(name_provider_role);

  if (existing) {
    throw errorWithStatus("Provider role sudah tersedia", 409);
  }

  const [result] = await db.query(
    `
        INSERT INTO provider_roles (
          name_provider_role
        )
        VALUES (?)
      `,
    [name_provider_role],
  );

  return getProviderRoleById(result.insertId);
}

// UPDATE PROVIDER ROLE
export async function updateProviderRole(id_provider_role, data) {
  const existing = await getProviderRoleById(id_provider_role);

  if (!existing) {
    throw errorWithStatus("Provider role tidak ditemukan", 404);
  }

  const fields = [];

  const values = [];

  // ==========================================================
  // NAME
  // ==========================================================

  if (data.name_provider_role !== undefined) {
    const duplicate = await getProviderRoleByName(data.name_provider_role);

    if (
      duplicate &&
      Number(duplicate.id_provider_role) !== Number(id_provider_role)
    ) {
      throw errorWithStatus("Nama provider role sudah digunakan", 409);
    }

    fields.push("name_provider_role = ?");

    values.push(data.name_provider_role);
  }

  if (fields.length === 0) {
    throw errorWithStatus("Tidak ada data yang diperbarui", 400);
  }

  values.push(id_provider_role);

  await db.query(
    `
      UPDATE provider_roles
      SET ${fields.join(", ")}
      WHERE id_provider_role = ?
    `,
    values,
  );

  return getProviderRoleById(id_provider_role);
}

// CHECK ROLE USAGE
export async function isProviderRoleUsed(id_provider_role) {
  const [rows] = await db.query(
    `
        SELECT
          COUNT(*) AS total
        FROM provider_users
        WHERE id_provider_role = ?
      `,
    [id_provider_role],
  );

  return Number(rows[0] && rows[0].total ? rows[0].total : 0) > 0;
}

// DELETE PROVIDER ROLE
export async function deleteProviderRole(id_provider_role) {
  const existing = await getProviderRoleById(id_provider_role);

  if (!existing) {
    throw errorWithStatus("Provider role tidak ditemukan", 404);
  }

  const isUsed = await isProviderRoleUsed(id_provider_role);

  if (isUsed) {
    throw errorWithStatus(
      "Provider role tidak dapat dihapus karena masih digunakan oleh provider user",
      409,
    );
  }

  const [result] = await db.query(
    `
        DELETE FROM provider_roles
        WHERE id_provider_role = ?
      `,
    [id_provider_role],
  );

  return result.affectedRows > 0;
}
