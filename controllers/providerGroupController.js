import * as providerGroupModel from "../models/providerGroupModel.js";

// HELPERS
const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const validateId = (value, label = "ID") => {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw createError(400, `${label} harus berupa integer positif.`);
  }

  return id;
};

const validateGroupName = (value) => {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 150) {
    throw createError(
      400,
      "Nama provider group wajib diisi, maksimal 150 karakter.",
    );
  }

  return value.trim();
};

const validateStatus = (value) => {
  if (typeof value !== "string") {
    throw createError(400, "Status provider group tidak valid.");
  }

  const status = value.trim().toUpperCase();

  if (!["ACTIVE", "INACTIVE"].includes(status)) {
    throw createError(400, "Status harus ACTIVE atau INACTIVE.");
  }

  return status;
};

const handleError = (res, error) => {
  console.error("[PROVIDER GROUP ERROR]", error);

  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600
      ? error.status
      : 500;

  return res.status(status).json({
    success: false,
    message: status === 500 ? "Terjadi kesalahan pada server." : error.message,
  });
};

// GET ALL PROVIDER GROUPS
export const getAllProviderGroups = async (req, res) => {
  try {
    const data = await providerGroupModel.getAllProviderGroups();

    return res.status(200).json({
      success: true,
      message: "Berhasil mengambil provider groups.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET PROVIDER GROUP BY ID
export const getProviderGroupById = async (req, res) => {
  try {
    const idProviderGroup = validateId(req.params.id, "ID provider group");

    const data = await providerGroupModel.getProviderGroupById(idProviderGroup);

    return res.status(200).json({
      success: true,
      message: "Detail provider group berhasil diambil.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// CREATE PROVIDER GROUP
export const createProviderGroup = async (req, res) => {
  try {
    const name = validateGroupName(req.body?.name_provider_group);

    const providerIds = providerGroupModel.normalizeProviderIds(
      req.body?.provider_ids ?? [],
    );

    const data = await providerGroupModel.createProviderGroup({
      name_provider_group: name,
      provider_ids: providerIds,
    });

    return res.status(201).json({
      success: true,
      message: "Provider group berhasil dibuat.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// UPDATE PROVIDER GROUP
export const updateProviderGroup = async (req, res) => {
  try {
    const idProviderGroup = validateId(req.params.id, "ID provider group");

    const { name_provider_group, status_provider_group } = req.body ?? {};

    if (
      name_provider_group === undefined &&
      status_provider_group === undefined
    ) {
      throw createError(400, "Tidak ada data yang akan diubah.");
    }

    const name =
      name_provider_group === undefined
        ? undefined
        : validateGroupName(name_provider_group);

    const status =
      status_provider_group === undefined
        ? undefined
        : validateStatus(status_provider_group);

    const data = await providerGroupModel.updateProviderGroup(idProviderGroup, {
      name_provider_group: name,
      status_provider_group: status,
    });

    return res.status(200).json({
      success: true,
      message: "Provider group berhasil diperbarui.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// ADD MULTIPLE PROVIDERS
export const addProvidersToGroup = async (req, res) => {
  try {
    const idProviderGroup = validateId(req.params.id, "ID provider group");

    const providerIds = providerGroupModel.normalizeProviderIds(
      req.body?.provider_ids,
    );

    if (providerIds.length === 0) {
      throw createError(400, "Masukkan minimal satu provider.");
    }

    const data = await providerGroupModel.addProvidersToGroup(
      idProviderGroup,
      providerIds,
    );

    return res.status(200).json({
      success: true,
      message: "Provider berhasil ditambahkan ke group.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// REMOVE PROVIDER FROM GROUP
export const removeProviderFromGroup = async (req, res) => {
  try {
    const idProviderGroup = validateId(req.params.id, "ID provider group");

    const idProvider = validateId(req.params.providerId, "ID provider");

    const data = await providerGroupModel.removeProviderFromGroup(
      idProviderGroup,
      idProvider,
    );

    return res.status(200).json({
      success: true,
      message: "Provider berhasil dikeluarkan dari group.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// DEACTIVATE PROVIDER GROUP
export const deleteProviderGroup = async (req, res) => {
  try {
    const idProviderGroup = validateId(req.params.id, "ID provider group");

    const data = await providerGroupModel.deleteProviderGroup(idProviderGroup);

    return res.status(200).json({
      success: true,
      message: "Provider group berhasil dinonaktifkan.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET ELIGIBLE PROVIDERS
export const getEligibleProviders = async (req, res) => {
  try {
    const idProviderGroup = validateId(req.params.id, "ID provider group");

    const data = await providerGroupModel.getEligibleProviders(idProviderGroup);

    return res.status(200).json({
      success: true,
      message: "Daftar provider yang dapat ditambahkan berhasil diambil.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// GET ALTERNATIVE BRANCHES BY SERVICE
export const getBranchesByService = async (req, res) => {
  try {
    const idService = validateId(req.params.serviceId, "ID service");

    const data = await providerGroupModel.getBranchesByService(idService);

    return res.status(200).json({
      success: true,
      message: "Referensi cabang layanan berhasil diambil.",
      data,
    });
  } catch (error) {
    return handleError(res, error);
  }
};
