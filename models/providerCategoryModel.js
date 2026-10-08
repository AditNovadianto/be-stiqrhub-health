import { db } from "../config/db.js";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

const normalizeText = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeStatus = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toUpperCase();
};

// GET ALL
export async function getAllProviderCategories() {
  const [rows] = await db.query(
    `
        SELECT
          id_provider_category,
          name_provider_category,
          description_provider_category,
          status_provider_category

        FROM provider_categories

        ORDER BY
          id_provider_category DESC
      `,
  );

  return rows;
}

// GET ACTIVE
export async function getActiveProviderCategories() {
  const [rows] = await db.query(
    `
        SELECT
          id_provider_category,
          name_provider_category,
          description_provider_category,
          status_provider_category

        FROM provider_categories

        WHERE status_provider_category = 'ACTIVE'

        ORDER BY
          name_provider_category ASC
      `,
  );

  return rows;
}

// GET BY ID
export async function getProviderCategoryById(id_provider_category) {
  const [rows] = await db.query(
    `
        SELECT
          id_provider_category,
          name_provider_category,
          description_provider_category,
          status_provider_category

        FROM provider_categories

        WHERE id_provider_category = ?

        LIMIT 1
      `,
    [id_provider_category],
  );

  return rows[0] || null;
}

// CHECK DUPLICATE NAME
export async function findProviderCategoryByName(name_provider_category) {
  const [rows] = await db.query(
    `
        SELECT
          id_provider_category,
          name_provider_category,
          description_provider_category,
          status_provider_category

        FROM provider_categories

        WHERE LOWER(
          name_provider_category
        ) = LOWER(?)

        LIMIT 1
      `,
    [name_provider_category],
  );

  return rows[0] || null;
}

// CREATE
export async function createProviderCategory({
  name_provider_category,
  description_provider_category,
  status_provider_category,
}) {
  const name = normalizeText(name_provider_category);

  const description = normalizeText(description_provider_category);

  const status = normalizeStatus(status_provider_category);

  if (!name) {
    throw errorWithStatus("Nama provider category wajib diisi", 400);
  }

  if (!description) {
    throw errorWithStatus("Deskripsi provider category wajib diisi", 400);
  }

  if (!status) {
    throw errorWithStatus("Status provider category wajib diisi", 400);
  }

  const existing = await findProviderCategoryByName(name);

  if (existing) {
    throw errorWithStatus(
      "Provider category dengan nama tersebut sudah tersedia",
      409,
    );
  }

  const [result] = await db.query(
    `
        INSERT INTO provider_categories (
          name_provider_category,
          description_provider_category,
          status_provider_category
        )
        VALUES (?, ?, ?)
      `,
    [name, description, status],
  );

  if (result.affectedRows !== 1) {
    throw errorWithStatus("Provider category gagal dibuat", 500);
  }

  return getProviderCategoryById(result.insertId);
}

// UPDATE
export async function updateProviderCategory(id_provider_category, payload) {
  const existing = await getProviderCategoryById(id_provider_category);

  if (!existing) {
    throw errorWithStatus("Provider category tidak ditemukan", 404);
  }

  const name =
    payload.name_provider_category !== undefined
      ? normalizeText(payload.name_provider_category)
      : existing.name_provider_category;

  const description =
    payload.description_provider_category !== undefined
      ? normalizeText(payload.description_provider_category)
      : existing.description_provider_category;

  const status =
    payload.status_provider_category !== undefined
      ? normalizeStatus(payload.status_provider_category)
      : existing.status_provider_category;

  if (!name) {
    throw errorWithStatus("Nama provider category tidak boleh kosong", 400);
  }

  if (!description) {
    throw errorWithStatus(
      "Deskripsi provider category tidak boleh kosong",
      400,
    );
  }

  if (!status) {
    throw errorWithStatus("Status provider category tidak boleh kosong", 400);
  }

  const duplicate = await findProviderCategoryByName(name);

  if (
    duplicate &&
    Number(duplicate.id_provider_category) !== Number(id_provider_category)
  ) {
    throw errorWithStatus(
      "Provider category dengan nama tersebut sudah tersedia",
      409,
    );
  }

  const [result] = await db.query(
    `
        UPDATE provider_categories

        SET
          name_provider_category = ?,
          description_provider_category = ?,
          status_provider_category = ?

        WHERE id_provider_category = ?
      `,
    [name, description, status, id_provider_category],
  );

  if (result.affectedRows !== 1) {
    throw errorWithStatus("Provider category gagal diperbarui", 500);
  }

  return getProviderCategoryById(id_provider_category);
}

// CHECK CATEGORY USAGE
export async function countProvidersByCategory(id_provider_category) {
  const [rows] = await db.query(
    `
        SELECT
          COUNT(*) AS total

        FROM providers

        WHERE id_provider_category = ?
      `,
    [id_provider_category],
  );

  return Number(rows[0] && rows[0].total ? rows[0].total : 0);
}

// DELETE
export async function deleteProviderCategory(id_provider_category) {
  const existing = await getProviderCategoryById(id_provider_category);

  if (!existing) {
    throw errorWithStatus("Provider category tidak ditemukan", 404);
  }

  const providerCount = await countProvidersByCategory(id_provider_category);

  if (providerCount > 0) {
    throw errorWithStatus(
      "Provider category tidak dapat dihapus karena masih digunakan oleh provider",
      409,
    );
  }

  const [result] = await db.query(
    `
        DELETE FROM provider_categories

        WHERE id_provider_category = ?
      `,
    [id_provider_category],
  );

  if (result.affectedRows !== 1) {
    throw errorWithStatus("Provider category gagal dihapus", 500);
  }

  return {
    id_provider_category: Number(id_provider_category),

    deleted: true,
  };
}
