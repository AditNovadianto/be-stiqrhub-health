import * as providerCategoryModel from "../models/providerCategoryModel.js";

// HELPERS
const isValidId = (value) => {
  const number = Number(value);

  return Number.isSafeInteger(number) && number > 0;
};

const handleError = (res, error) => {
  console.error("[PROVIDER CATEGORY ERROR]", error);

  return res.status(error.statusCode || 500).json({
    success: false,

    message: error.message || "Internal server error",
  });
};

// GET ALL
export async function getAllProviderCategories(req, res) {
  try {
    const categories = await providerCategoryModel.getAllProviderCategories();

    return res.status(200).json({
      success: true,

      data: categories,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET ACTIVE
export async function getActiveProviderCategories(req, res) {
  try {
    const categories =
      await providerCategoryModel.getActiveProviderCategories();

    return res.status(200).json({
      success: true,

      data: categories,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// GET BY ID
export async function getProviderCategoryById(req, res) {
  try {
    const { id_provider_category } = req.params;

    if (!isValidId(id_provider_category)) {
      return res.status(400).json({
        success: false,

        message: "ID provider category tidak valid",
      });
    }

    const category = await providerCategoryModel.getProviderCategoryById(
      Number(id_provider_category),
    );

    if (!category) {
      return res.status(404).json({
        success: false,

        message: "Provider category tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,

      data: category,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// CREATE
export async function createProviderCategory(req, res) {
  try {
    const {
      name_provider_category,
      description_provider_category,
      status_provider_category,
    } = req.body;

    const category = await providerCategoryModel.createProviderCategory({
      name_provider_category,
      description_provider_category,
      status_provider_category,
    });

    return res.status(201).json({
      success: true,

      message: "Provider category berhasil dibuat",

      data: category,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// UPDATE
export async function updateProviderCategory(req, res) {
  try {
    const { id_provider_category } = req.params;

    if (!isValidId(id_provider_category)) {
      return res.status(400).json({
        success: false,

        message: "ID provider category tidak valid",
      });
    }

    const {
      name_provider_category,
      description_provider_category,
      status_provider_category,
    } = req.body;

    if (
      name_provider_category === undefined &&
      description_provider_category === undefined &&
      status_provider_category === undefined
    ) {
      return res.status(400).json({
        success: false,

        message: "Tidak ada data yang diperbarui",
      });
    }

    const category = await providerCategoryModel.updateProviderCategory(
      Number(id_provider_category),
      {
        name_provider_category,
        description_provider_category,
        status_provider_category,
      },
    );

    return res.status(200).json({
      success: true,

      message: "Provider category berhasil diperbarui",

      data: category,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

// DELETE
export async function deleteProviderCategory(req, res) {
  try {
    const { id_provider_category } = req.params;

    if (!isValidId(id_provider_category)) {
      return res.status(400).json({
        success: false,

        message: "ID provider category tidak valid",
      });
    }

    const result = await providerCategoryModel.deleteProviderCategory(
      Number(id_provider_category),
    );

    return res.status(200).json({
      success: true,

      message: "Provider category berhasil dihapus",

      data: result,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
