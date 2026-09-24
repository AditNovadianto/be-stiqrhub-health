import { db } from "../config/db.js";
import { getProviderById } from "./providerModel.js";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const checkApprovedProvider = async (id_provider) => {
  const provider = await getProviderById(id_provider);

  if (!provider) {
    throw errorWithStatus("Provider tidak ditemukan", 404);
  }

  if (provider.status_provider !== "APPROVED") {
    throw errorWithStatus("Provider belum disetujui", 403);
  }

  return provider;
};

// CREATE
export async function createService(
  name_service,
  price_service,
  image_service,
  description_service,
  status_service,
  maps_service,
  quota_service,
  id_provider,
) {
  await checkApprovedProvider(id_provider);

  const [result] = await db.query(
    `INSERT INTO services (
      name_service,
      price_service,
      image_service,
      description_service,
      status_service,
      maps_service,
      quota_service,
      id_provider
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      name_service,
      price_service,
      image_service ?? null,
      description_service ?? null,
      status_service,
      maps_service ?? null,
      quota_service,
      id_provider,
    ],
  );

  return result.insertId;
}

// GET ALL
export async function getAllServices() {
  const [rows] = await db.query(
    `SELECT *
     FROM services
     ORDER BY id_service DESC`,
  );

  return rows;
}

// GET BY ID
export async function getServiceById(id_service) {
  const [rows] = await db.query(
    `SELECT *
     FROM services
     WHERE id_service = ?`,
    [id_service],
  );

  return rows[0] || null;
}

// GET BY PROVIDER
export async function getServicesByProvider(id_provider) {
  const [rows] = await db.query(
    `SELECT *
     FROM services
     WHERE id_provider = ?
     ORDER BY id_service DESC`,
    [id_provider],
  );

  return rows;
}

// UPDATE
export async function updateService(id_service, id_provider, data) {
  const service = await getServiceById(id_service);

  if (!service) {
    throw errorWithStatus("Service tidak ditemukan", 404);
  }

  if (Number(service.id_provider) !== Number(id_provider)) {
    throw errorWithStatus("Service bukan milik provider tersebut", 403);
  }

  await checkApprovedProvider(id_provider);

  const allowedFields = [
    "name_service",
    "price_service",
    "image_service",
    "description_service",
    "status_service",
    "maps_service",
    "quota_service",
  ];

  const fields = allowedFields.filter((field) => data[field] !== undefined);

  if (fields.length === 0) {
    throw errorWithStatus("Tidak ada data untuk diperbarui", 400);
  }

  const setClause = fields.map((field) => `${field} = ?`).join(", ");

  const values = fields.map((field) => data[field]);

  const [result] = await db.query(
    `UPDATE services
     SET ${setClause}
     WHERE id_service = ?
       AND id_provider = ?`,
    [...values, id_service, id_provider],
  );

  return result.affectedRows > 0;
}

// DELETE
export async function deleteService(id_service, id_provider) {
  const service = await getServiceById(id_service);

  if (!service) {
    throw errorWithStatus("Service tidak ditemukan", 404);
  }

  if (Number(service.id_provider) !== Number(id_provider)) {
    throw errorWithStatus("Service bukan milik provider tersebut", 403);
  }

  await checkApprovedProvider(id_provider);

  const [result] = await db.query(
    `DELETE FROM services
     WHERE id_service = ?
       AND id_provider = ?`,
    [id_service, id_provider],
  );

  return result.affectedRows > 0;
}
