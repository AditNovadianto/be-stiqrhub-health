import * as providerRoleModel from "../models/providerRoleModel.js";

// HELPERS
const handleError = (res, error) => {
  console.error("[PROVIDER ROLE ERROR]", error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,

      message: error.message,
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,

      message: "Provider role masih digunakan",
    });
  }

  return res.status(500).json({
    success: false,

    message: "Internal server error",
  });
};

const isValidId = (value) => {
  const number = Number(value);

  return Number.isInteger(number) && number > 0;
};

const normalizeName = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized ? normalized : null;
};

// CREATE
export async function createProviderRole(req, res) {
  try {
    const name = normalizeName(req.body.name_provider_role);

    if (!name) {
      return res.status(400).json({
        success: false,

        message: "Nama provider role wajib diisi",
      });
    }

    const providerRole = await providerRoleModel.createProviderRole(name);

    return res.status(201).json({
      success: true,

      message: "Provider role berhasil dibuat",

      data: providerRole,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET ALL
export async function getAllProviderRoles(req, res) {
  try {
    const providerRoles = await providerRoleModel.getAllProviderRoles();

    return res.status(200).json({
      success: true,

      data: providerRoles,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET BY ID
export async function getProviderRoleById(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,

        message: "ID provider role tidak valid",
      });
    }

    const providerRole = await providerRoleModel.getProviderRoleById(
      Number(id),
    );

    if (!providerRole) {
      return res.status(404).json({
        success: false,

        message: "Provider role tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,

      data: providerRole,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// PATCH
export async function updateProviderRole(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,

        message: "ID provider role tidak valid",
      });
    }

    const data = {};

    if (req.body.name_provider_role !== undefined) {
      const name = normalizeName(req.body.name_provider_role);

      if (!name) {
        return res.status(400).json({
          success: false,

          message: "Nama provider role tidak boleh kosong",
        });
      }

      data.name_provider_role = name;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,

        message: "Tidak ada data yang diperbarui",
      });
    }

    const providerRole = await providerRoleModel.updateProviderRole(
      Number(id),
      data,
    );

    return res.status(200).json({
      success: true,

      message: "Provider role berhasil diperbarui",

      data: providerRole,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// DELETE
export async function deleteProviderRole(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,

        message: "ID provider role tidak valid",
      });
    }

    await providerRoleModel.deleteProviderRole(Number(id));

    return res.status(200).json({
      success: true,

      message: "Provider role berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
