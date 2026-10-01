import * as detailServiceModel from "../models/detailServiceModel.js";

// CONSTANTS
const UPDATE_FIELDS = [
  "benefits",
  "location",
  "hour",
  "terms_and_conditions",
  "included_services",
];

// HELPERS
const isValidId = (id) =>
  /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));

const parseInteger = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);

  if (!Number.isFinite(number) || !Number.isInteger(number) || number < 0) {
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

const handleError = (res, error) => {
  console.error("Detail service controller error:", error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });
  }

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      message: "Service yang dipilih tidak ditemukan",
    });
  }

  if (error.code === "ER_ROW_IS_REFERENCED_2") {
    return res.status(409).json({
      success: false,
      message: "Detail service masih digunakan dan tidak dapat dihapus",
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE
export const createDetailService = async (req, res) => {
  try {
    const {
      benefits,
      location,
      hour,
      terms_and_conditions,
      included_services,
      id_service,
      id_provider,
    } = req.body;

    if (!isValidId(id_service) || !isValidId(id_provider)) {
      return res.status(400).json({
        success: false,
        message: "ID service dan ID provider wajib valid",
      });
    }

    if (
      benefits !== undefined &&
      benefits !== null &&
      typeof benefits !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Benefits harus berupa string",
      });
    }

    if (
      terms_and_conditions !== undefined &&
      terms_and_conditions !== null &&
      typeof terms_and_conditions !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Terms and conditions harus berupa string",
      });
    }

    if (
      included_services !== undefined &&
      included_services !== null &&
      typeof included_services !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Included services harus berupa string",
      });
    }

    const id_detail_service = await detailServiceModel.createDetailService(
      benefits?.trim() || null,
      location?.trim() || null,
      hour?.trim() || null,
      terms_and_conditions?.trim() || null,
      included_services?.trim() || null,
      id_service,
      id_provider,
    );

    return res.status(201).json({
      success: true,
      message: "Detail service berhasil dibuat",
      data: {
        id_detail_service,
        benefits: benefits?.trim() || null,
        location: location?.trim() || null,
        hour: hour?.trim() || null,
        terms_and_conditions: terms_and_conditions?.trim() || null,
        included_services: included_services?.trim() || null,
        id_service: Number(id_service),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// READ ALL
export const getAllDetailServices = async (req, res) => {
  try {
    const detailServices = await detailServiceModel.getAllDetailServices();

    return res.status(200).json({
      success: true,
      data: detailServices,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// READ BY ID
export const getDetailServiceById = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "ID detail service tidak valid",
    });
  }

  try {
    const detailService = await detailServiceModel.getDetailServiceById(id);

    if (!detailService) {
      return res.status(404).json({
        success: false,
        message: "Detail service tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      data: detailService,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// READ BY SERVICE
export const getDetailServicesByService = async (req, res) => {
  const { id_service } = req.params;

  if (!isValidId(id_service)) {
    return res.status(400).json({
      success: false,
      message: "ID service tidak valid",
    });
  }

  try {
    const detailServices =
      await detailServiceModel.getDetailServicesByService(id_service);

    return res.status(200).json({
      success: true,
      data: detailServices,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// UPDATE
export const updateDetailService = async (req, res) => {
  const { id } = req.params;
  const { id_provider } = req.body;

  try {
    if (!isValidId(id) || !isValidId(id_provider)) {
      return res.status(400).json({
        success: false,
        message: "ID detail service atau ID provider tidak valid",
      });
    }

    // Ambil hanya field yang diperbolehkan untuk di-update
    const data = pickFields(req.body, UPDATE_FIELDS);

    if (data.benefits !== undefined) {
      if (data.benefits !== null && typeof data.benefits !== "string") {
        return res.status(400).json({
          success: false,
          message: "Benefits harus berupa string",
        });
      }

      if (typeof data.benefits === "string") {
        data.benefits = data.benefits.trim();
      }
    }

    if (data.location !== undefined) {
      if (data.location !== null && typeof data.location !== "string") {
        return res.status(400).json({
          success: false,
          message: "Location harus berupa string",
        });
      }

      if (typeof data.location === "string") {
        data.location = data.location.trim();
      }
    }

    if (data.hour !== undefined) {
      if (data.hour !== null && typeof data.hour !== "string") {
        return res.status(400).json({
          success: false,
          message: "Hour harus berupa string",
        });
      }

      if (typeof data.hour === "string") {
        data.hour = data.hour.trim();
      }
    }

    if (data.terms_and_conditions !== undefined) {
      if (
        data.terms_and_conditions !== null &&
        typeof data.terms_and_conditions !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "Terms and conditions harus berupa string",
        });
      }

      if (typeof data.terms_and_conditions === "string") {
        data.terms_and_conditions = data.terms_and_conditions.trim();
      }
    }

    if (data.included_services !== undefined) {
      if (
        data.included_services !== null &&
        typeof data.included_services !== "string"
      ) {
        return res.status(400).json({
          success: false,
          message: "Included services harus berupa string",
        });
      }

      if (typeof data.included_services === "string") {
        data.included_services = data.included_services.trim();
      }
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data untuk diperbarui",
      });
    }

    const updated = await detailServiceModel.updateDetailService(
      id,
      id_provider,
      data,
    );

    if (!updated) {
      return res.status(409).json({
        success: false,
        message: "Detail service gagal diperbarui",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Detail service berhasil diperbarui",
      data: {
        id_detail_service: Number(id),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// DELETE
export const deleteDetailService = async (req, res) => {
  const { id } = req.params;
  const { id_provider } = req.body;

  if (!isValidId(id) || !isValidId(id_provider)) {
    return res.status(400).json({
      success: false,
      message: "ID detail service atau ID provider tidak valid",
    });
  }

  try {
    const success = await detailServiceModel.deleteDetailService(
      id,
      id_provider,
    );

    if (!success) {
      return res.status(409).json({
        success: false,
        message: "Detail service gagal dihapus",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Detail service berhasil dihapus",
      data: {
        id_detail_service: Number(id),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
