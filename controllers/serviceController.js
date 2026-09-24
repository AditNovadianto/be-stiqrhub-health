import * as serviceModel from "../models/serviceModel.js";
import { s3 } from "../config/s3.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

// CONSTANTS
const UPDATE_FIELDS = [
  "name_service",
  "price_service",
  "description_service",
  "status_service",
  "maps_service",
  "quota_service",
];

// HELPERS
const isValidId = (id) =>
  /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));

const parseNumber = (value, integer = false) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (
    !Number.isFinite(number) ||
    number < 0 ||
    (integer && !Number.isInteger(number))
  ) {
    return null;
  }

  return number;
};

const pickFields = (body, fields) => {
  const data = {};

  for (const field of fields) {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  }

  return data;
};

// Ambil URL dari hasil multer-s3.
const getFileUrl = (file) => {
  return file?.location || null;
};

// Hapus file berdasarkan object key.
const deleteFileByKey = async (key) => {
  if (!key) return;

  try {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
      }),
    );
  } catch (error) {
    console.error("Gagal menghapus gambar S3:", error);
  }
};

// Hapus gambar baru ketika operasi database gagal.
const deleteUploadedFile = async (file) => {
  await deleteFileByKey(file?.key);
};

// Ambil object key dari URL yang disimpan di database.
// Sesuai struktur uploadService.js:
// services/UUID/image_service.png
const getObjectKeyFromUrl = (fileUrl) => {
  if (typeof fileUrl !== "string") {
    return null;
  }

  try {
    const url = new URL(fileUrl);
    const endpoint = new URL(process.env.S3_ENDPOINT);

    if (url.origin !== endpoint.origin || url.search || url.hash) {
      return null;
    }

    const prefix = `/${process.env.S3_BUCKET}/`;

    if (!url.pathname.startsWith(prefix)) {
      return null;
    }

    const key = url.pathname.slice(prefix.length);

    const pattern = /^services\/[a-f0-9-]{36}\/image_service\.(jpg|png|webp)$/;

    return pattern.test(key) ? key : null;
  } catch {
    return null;
  }
};

// Hapus gambar lama setelah UPDATE atau DELETE.
const deleteStoredFile = async (fileUrl) => {
  const key = getObjectKeyFromUrl(fileUrl);

  if (key) {
    await deleteFileByKey(key);
  }
};

const handleError = (res, error) => {
  console.error("Service controller error:", error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,
      message: "Service masih digunakan dan tidak dapat dihapus",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE
export const createService = async (req, res) => {
  let created = false;

  try {
    const {
      name_service,
      price_service,
      description_service,
      status_service,
      maps_service,
      quota_service,
      id_provider,
    } = req.body;

    const price = parseNumber(price_service);
    const quota = parseNumber(quota_service, true);

    if (
      typeof name_service !== "string" ||
      !name_service.trim() ||
      !isValidId(id_provider) ||
      price === null ||
      quota === null ||
      typeof status_service !== "string" ||
      !status_service.trim()
    ) {
      await deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "Nama, harga, status, kuota, dan ID provider wajib valid",
      });
    }

    const image_service = getFileUrl(req.file);

    const id_service = await serviceModel.createService(
      name_service.trim(),
      price,
      image_service,
      description_service ?? null,
      status_service.trim(),
      maps_service ?? null,
      quota,
      id_provider,
    );

    created = true;

    return res.status(201).json({
      success: true,
      message: "Service berhasil dibuat",
      data: {
        id_service,
        name_service: name_service.trim(),
        price_service: price,
        image_service,
        description_service: description_service ?? null,
        status_service: status_service.trim(),
        maps_service: maps_service ?? null,
        quota_service: quota,
        id_provider: Number(id_provider),
      },
    });
  } catch (error) {
    if (!created) {
      await deleteUploadedFile(req.file);
    }

    return handleError(res, error);
  }
};

// READ ALL
export const getAllServices = async (req, res) => {
  try {
    const services = await serviceModel.getAllServices();

    return res.status(200).json({
      success: true,
      data: services,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// READ BY ID
export const getServiceById = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "ID service tidak valid",
    });
  }

  try {
    const service = await serviceModel.getServiceById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: service,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// READ BY PROVIDER
export const getServicesByProvider = async (req, res) => {
  const { id_provider } = req.params;

  if (!isValidId(id_provider)) {
    return res.status(400).json({
      success: false,
      message: "ID provider tidak valid",
    });
  }

  try {
    const services = await serviceModel.getServicesByProvider(id_provider);

    return res.status(200).json({
      success: true,
      data: services,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// UPDATE
export const updateService = async (req, res) => {
  const { id } = req.params;
  const { id_provider } = req.body;

  let updated = false;

  try {
    if (!isValidId(id) || !isValidId(id_provider)) {
      await deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "ID service atau ID provider tidak valid",
      });
    }

    const service = await serviceModel.getServiceById(id);

    if (!service) {
      await deleteUploadedFile(req.file);

      return res.status(404).json({
        success: false,
        message: "Service tidak ditemukan",
      });
    }

    const data = pickFields(req.body, UPDATE_FIELDS);

    if (data.name_service !== undefined) {
      if (typeof data.name_service !== "string" || !data.name_service.trim()) {
        await deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "Nama service tidak valid",
        });
      }

      data.name_service = data.name_service.trim();
    }

    if (data.price_service !== undefined) {
      const price = parseNumber(data.price_service);

      if (price === null) {
        await deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "Harga tidak valid",
        });
      }

      data.price_service = price;
    }

    if (data.quota_service !== undefined) {
      const quota = parseNumber(data.quota_service, true);

      if (quota === null) {
        await deleteUploadedFile(req.file);

        return res.status(400).json({
          success: false,
          message: "Kuota tidak valid",
        });
      }

      data.quota_service = quota;
    }

    if (
      data.status_service !== undefined &&
      (typeof data.status_service !== "string" || !data.status_service.trim())
    ) {
      await deleteUploadedFile(req.file);

      return res.status(400).json({
        success: false,
        message: "Status service tidak valid",
      });
    }

    if (data.status_service !== undefined) {
      data.status_service = data.status_service.trim();
    }

    if (req.file) {
      data.image_service = getFileUrl(req.file);
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data untuk diperbarui",
      });
    }

    updated = await serviceModel.updateService(id, id_provider, data);

    if (!updated) {
      await deleteUploadedFile(req.file);

      return res.status(409).json({
        success: false,
        message: "Service gagal diperbarui",
      });
    }

    // Hapus gambar lama hanya jika diganti.
    if (
      req.file &&
      service.image_service &&
      service.image_service !== req.file.location
    ) {
      await deleteStoredFile(service.image_service);
    }

    return res.status(200).json({
      success: true,
      message: "Service berhasil diperbarui",
      data: {
        id_service: Number(id),
      },
    });
  } catch (error) {
    if (!updated) {
      await deleteUploadedFile(req.file);
    }

    return handleError(res, error);
  }
};

// DELETE
export const deleteService = async (req, res) => {
  const { id } = req.params;
  const { id_provider } = req.body;

  if (!isValidId(id) || !isValidId(id_provider)) {
    return res.status(400).json({
      success: false,
      message: "ID service atau ID provider tidak valid",
    });
  }

  try {
    const service = await serviceModel.getServiceById(id);

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service tidak ditemukan",
      });
    }

    const success = await serviceModel.deleteService(id, id_provider);

    if (!success) {
      return res.status(409).json({
        success: false,
        message: "Service gagal dihapus",
      });
    }

    if (service.image_service) {
      await deleteStoredFile(service.image_service);
    }

    return res.status(200).json({
      success: true,
      message: "Service berhasil dihapus",
      data: {
        id_service: Number(id),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
