import * as guestModel from "../models/guestModel.js";

// HELPERS
const errorWithStatus = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isValidIntegerId = (value) =>
  /^[1-9]\d*$/.test(String(value)) && Number.isSafeInteger(Number(value));

const handleError = (res, error) => {
  console.error("[GUEST ERROR]", {
    message: error.message,
    statusCode: error.statusCode || 500,
  });

  if (error.code === "ER_NO_REFERENCED_ROW_2") {
    return res.status(400).json({
      success: false,
      message: "Customer tidak valid",
    });
  }

  return res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : "Terjadi kesalahan pada server",
  });
};

export async function createGuest(req, res) {
  try {
    const id_customer = req.user?.id_customer;

    if (!isValidIntegerId(id_customer)) {
      throw errorWithStatus("Customer tidak terautentikasi", 401);
    }

    const { name_guest, email_guest, gender_guest, phone_number_guest } =
      req.body || {};

    // VALIDATE NAME
    if (typeof name_guest !== "string" || !name_guest.trim()) {
      throw errorWithStatus("Nama guest wajib diisi", 400);
    }

    const normalizedName = name_guest.trim();

    if (normalizedName.length > 255) {
      throw errorWithStatus("Nama guest maksimal 255 karakter", 400);
    }

    // VALIDATE EMAIL
    if (typeof email_guest !== "string" || !email_guest.trim()) {
      throw errorWithStatus("Email guest wajib diisi", 400);
    }

    const normalizedEmail = email_guest.trim().toLowerCase();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (normalizedEmail.length > 255 || !emailRegex.test(normalizedEmail)) {
      throw errorWithStatus("Format email guest tidak valid", 400);
    }

    // VALIDATE GENDER
    if (typeof gender_guest !== "string" || !gender_guest.trim()) {
      throw errorWithStatus("Gender guest wajib diisi", 400);
    }

    const normalizedGender = gender_guest.trim().toUpperCase();

    if (!["MALE", "FEMALE"].includes(normalizedGender)) {
      throw errorWithStatus("Gender guest harus MALE atau FEMALE", 400);
    }

    // VALIDATE PHONE
    let normalizedPhone = null;

    if (
      phone_number_guest !== undefined &&
      phone_number_guest !== null &&
      phone_number_guest !== ""
    ) {
      if (typeof phone_number_guest !== "string") {
        throw errorWithStatus("Nomor telepon guest harus berupa string", 400);
      }

      normalizedPhone = phone_number_guest.trim();

      if (normalizedPhone) {
        if (!/^\+?[0-9]{8,15}$/.test(normalizedPhone)) {
          throw errorWithStatus("Format nomor telepon guest tidak valid", 400);
        }
      } else {
        normalizedPhone = null;
      }
    }

    // CREATE GUEST
    const guest = await guestModel.createGuest({
      name_guest: normalizedName,
      email_guest: normalizedEmail,
      gender_guest: normalizedGender,
      phone_number_guest: normalizedPhone,
      id_customer: Number(id_customer),
    });

    console.log("[GUEST CREATED]", {
      id_guest: guest.id_guest,
      id_customer: guest.id_customer,
    });

    return res.status(201).json({
      success: true,
      message: "Guest berhasil ditambahkan",
      data: guest,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getAllGuests(req, res) {
  try {
    const id_customer = req.user?.id_customer;

    if (!isValidIntegerId(id_customer)) {
      throw errorWithStatus("Customer tidak terautentikasi", 401);
    }

    const guests = await guestModel.getAllGuests(Number(id_customer));

    return res.status(200).json({
      success: true,
      message: "Data guest berhasil diambil",
      data: guests,
    });
  } catch (error) {
    return handleError(res, error);
  }
}

export async function getGuestById(req, res) {
  try {
    const id_customer = req.user?.id_customer;
    const { id_guest } = req.params;

    if (!isValidIntegerId(id_customer)) {
      throw errorWithStatus("Customer tidak terautentikasi", 401);
    }

    if (!isValidIntegerId(id_guest)) {
      throw errorWithStatus("ID guest tidak valid", 400);
    }

    const guest = await guestModel.getGuestById(
      Number(id_guest),
      Number(id_customer),
    );

    if (!guest) {
      throw errorWithStatus("Guest tidak ditemukan", 404);
    }

    return res.status(200).json({
      success: true,
      message: "Detail guest berhasil diambil",
      data: guest,
    });
  } catch (error) {
    return handleError(res, error);
  }
}
