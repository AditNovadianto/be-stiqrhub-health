import { db } from "../config/db.js";
import { getServiceById } from "./serviceModel.js";
import { getProviderById } from "./providerModel.js";

// ============================================================
// HELPERS
// ============================================================

const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

/**
 * Mengecek:
 * 1. Service tersedia
 * 2. Service milik provider
 * 3. Provider sudah APPROVED
 */
const checkServiceOwnership = async (id_service, id_provider) => {
  const service = await getServiceById(id_service);

  if (!service) {
    throw errorWithStatus("Service tidak ditemukan", 404);
  }

  if (Number(service.id_provider) !== Number(id_provider)) {
    throw errorWithStatus("Service bukan milik provider tersebut", 403);
  }

  const provider = await getProviderById(id_provider);

  if (!provider) {
    throw errorWithStatus("Provider tidak ditemukan", 404);
  }

  if (provider.status_provider !== "APPROVED") {
    throw errorWithStatus("Provider belum disetujui", 403);
  }

  return service;
};

export async function checkDetailServiceExists(id_service) {
  const [rows] = await db.query(
    `SELECT id_detail_service
     FROM detail_service
     WHERE id_service = ?
     LIMIT 1`,
    [id_service],
  );

  return rows.length > 0;
}

// CREATE
export async function createDetailService(
  benefits,
  location,
  hour,
  terms_and_conditions,
  included_services,
  id_service,
  id_provider,
) {
  await checkServiceOwnership(id_service, id_provider);

  const detailExists = await checkDetailServiceExists(id_service);

  if (detailExists) {
    throw errorWithStatus("Service sudah memiliki detail service", 409);
  }

  const [result] = await db.query(
    `INSERT INTO detail_service (
      benefits,
      location,
      hour,
      terms_and_conditions,
      included_services,
      id_service
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      benefits ?? null,
      location ?? null,
      hour ?? null,
      terms_and_conditions ?? null,
      included_services ?? null,
      id_service,
    ],
  );

  return result.insertId;
}

// GET ALL
export async function getAllDetailServices() {
  const [rows] = await db.query(
    `SELECT
      ds.*,
      s.name_service,
      s.id_provider
    FROM detail_service ds
    INNER JOIN services s
      ON ds.id_service = s.id_service
    ORDER BY ds.id_detail_service DESC`,
  );

  return rows;
}

// GET BY ID
export async function getDetailServiceById(id_detail_service) {
  const [rows] = await db.query(
    `SELECT
      ds.*,
      s.name_service,
      s.id_provider
    FROM detail_service ds
    INNER JOIN services s
      ON ds.id_service = s.id_service
    WHERE ds.id_detail_service = ?`,
    [id_detail_service],
  );

  return rows[0] || null;
}

// GET BY SERVICE
export async function getDetailServicesByService(id_service) {
  const [rows] = await db.query(
    `SELECT
      ds.*,
      s.name_service,
      s.id_provider
    FROM detail_service ds
    INNER JOIN services s
      ON ds.id_service = s.id_service
    WHERE ds.id_service = ?
    ORDER BY ds.id_detail_service DESC`,
    [id_service],
  );

  return rows;
}

// UPDATE
export async function updateDetailService(
  id_detail_service,
  id_provider,
  data,
) {
  const detailService = await getDetailServiceById(id_detail_service);

  if (!detailService) {
    throw errorWithStatus("Detail service tidak ditemukan", 404);
  }

  await checkServiceOwnership(detailService.id_service, id_provider);

  const allowedFields = [
    "benefits",
    "location",
    "hour",
    "terms_and_conditions",
    "included_services",
  ];

  const fields = allowedFields.filter((field) => data[field] !== undefined);

  if (fields.length === 0) {
    throw errorWithStatus("Tidak ada data untuk diperbarui", 400);
  }

  const setClause = fields.map((field) => `${field} = ?`).join(", ");

  const values = fields.map((field) => data[field]);

  const [result] = await db.query(
    `UPDATE detail_service
    SET ${setClause}
    WHERE id_detail_service = ?`,
    [...values, id_detail_service],
  );

  return result.affectedRows > 0;
}

// DELETE
export async function deleteDetailService(id_detail_service, id_provider) {
  const detailService = await getDetailServiceById(id_detail_service);

  if (!detailService) {
    throw errorWithStatus("Detail service tidak ditemukan", 404);
  }

  await checkServiceOwnership(detailService.id_service, id_provider);

  const [result] = await db.query(
    `DELETE FROM detail_service
    WHERE id_detail_service = ?`,
    [id_detail_service],
  );

  return result.affectedRows > 0;
}
