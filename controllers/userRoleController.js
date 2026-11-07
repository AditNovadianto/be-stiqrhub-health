import * as userRoleModel from "../models/userRoleModel.js";

const handleError = (res, error) => {
  console.error("[USER ROLE ERROR]", error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,
      message: "User role masih digunakan",
    });
  }

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Nama user role sudah digunakan",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

const isValidId = (value) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) {
    return false;
  }

  const number = Number(value);

  return Number.isSafeInteger(number);
};

const normalizeName = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized ? normalized : null;
};

export async function createUserRole(req, res) {
  try {
    const name = normalizeName(req.body?.name_user_role);

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Nama user role wajib diisi",
      });
    }

    if (name.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Nama user role maksimal 255 karakter",
      });
    }

    const userRole = await userRoleModel.createUserRole(name);

    return res.status(201).json({
      success: true,
      message: "User role berhasil dibuat",
      data: userRole,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAllUserRoles(req, res) {
  try {
    const userRoles = await userRoleModel.getAllUserRoles();

    return res.status(200).json({
      success: true,
      data: userRoles,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getUserRoleById(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID user role tidak valid",
      });
    }

    const userRole = await userRoleModel.getUserRoleById(Number(id));

    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: "User role tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: userRole,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function updateUserRole(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID user role tidak valid",
      });
    }

    const data = {};

    if (req.body?.name_user_role !== undefined) {
      const name = normalizeName(req.body.name_user_role);

      if (!name) {
        return res.status(400).json({
          success: false,
          message: "Nama user role tidak boleh kosong",
        });
      }

      if (name.length > 255) {
        return res.status(400).json({
          success: false,
          message: "Nama user role maksimal 255 karakter",
        });
      }

      data.name_user_role = name;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data yang diperbarui",
      });
    }

    const userRole = await userRoleModel.updateUserRole(Number(id), data);

    return res.status(200).json({
      success: true,
      message: "User role berhasil diperbarui",
      data: userRole,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function deleteUserRole(req, res) {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "ID user role tidak valid",
      });
    }

    await userRoleModel.deleteUserRole(Number(id));

    return res.status(200).json({
      success: true,
      message: "User role berhasil dihapus",
    });
  } catch (error) {
    return handleError(res, error);
  }
}
