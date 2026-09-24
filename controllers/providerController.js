import * as providerModel from "../models/providerModel.js";
import { sendOtpEmail } from "../utils/mailer.js";
import { s3 } from "../config/s3.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";

// CONSTANTS
const REGISTRATION_FIELDS = [
  "name_provider",
  "email_provider",
  "phone_number_provider",
  "address_provider",
  "province_provider",
  "city_provider",
  "district_provider",
  "postal_code_provider",
  "description_provider",
  "id_platform",
  "id_provider_category",
];

const UPDATE_FIELDS = REGISTRATION_FIELDS.filter(
  (field) => field !== "email_provider",
);

const DOCUMENT_FIELDS = [
  "logo_provider",
  "akta_pendirian_perusahaan",
  "nomor_induk_berusaha",
  "npwp",
  "sertifikat_standard",
  "persetujuan_lingkungan",
  "surat_izin_apotek",
];

// HELPERS
const isValidId = (id) =>
  /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));

const pickFields = (body, fields) => {
  const data = {};

  for (const field of fields) {
    if (body[field] !== undefined) {
      data[field] = body[field];
    }
  }

  return data;
};

// Mengambil URL yang dibuat multer-s3.
const getFileUrl = (files, field) => {
  return files?.[field]?.[0]?.location || null;
};

// Mengambil file yang sudah diunggah oleh middleware.
const getUploadedFiles = (files = {}) => {
  return Object.values(files).flat();
};

// Menghapus berkas berdasarkan object key.
const deleteFilesByKeys = async (keys = []) => {
  const uniqueKeys = [...new Set(keys.filter(Boolean))];

  if (uniqueKeys.length === 0) {
    return [];
  }

  const results = await Promise.allSettled(
    uniqueKeys.map((key) =>
      s3.send(
        new DeleteObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: key,
        }),
      ),
    ),
  );

  for (const result of results) {
    if (result.status === "rejected") {
      console.error("Gagal menghapus berkas S3:", result.reason);
    }
  }

  return results;
};

// Digunakan jika file sudah diunggah,
// tetapi data tidak berhasil disimpan.
const deleteUploadedFiles = async (files = {}) => {
  const keys = getUploadedFiles(files)
    .map((file) => file.key)
    .filter(Boolean);

  return deleteFilesByKeys(keys);
};

// Mengambil object key dari URL lama yang tersimpan
// di database.
//
// Hanya menerima format path yang dibuat oleh
// middleware uploadProvider.js saat ini.
const getObjectKeyFromUrl = (fileUrl) => {
  if (typeof fileUrl !== "string") {
    return null;
  }

  try {
    const url = new URL(fileUrl);

    if (url.protocol !== "https:") {
      return null;
    }

    const pathname = decodeURIComponent(url.pathname);

    const pattern =
      /(?:^|\/)(providers\/[a-f0-9-]{36}\/[a-z_]+\.(?:jpg|png|webp|pdf))$/;

    const match = pathname.match(pattern);

    return match?.[1] || null;
  } catch {
    return null;
  }
};

// Menghapus file yang URL-nya tersimpan di database.
const deleteStoredFiles = async (urls = []) => {
  const keys = urls.map(getObjectKeyFromUrl).filter(Boolean);

  return deleteFilesByKeys(keys);
};

const handleError = (res, error) => {
  console.error("Provider controller error:", error);

  if (error.code === "ER_DUP_ENTRY") {
    return res.status(409).json({
      success: false,
      message: "Data provider sudah terdaftar",
    });
  }

  if (error.statusCode === 409) {
    return res.status(409).json({
      success: false,
      message: error.message,
    });
  }

  return res.status(500).json({
    success: false,
    message: "Internal server error",
  });
};

// CREATE
export const createProvider = async (req, res) => {
  const files = req.files || {};
  let providerId = null;

  try {
    const { name_provider, email_provider } = req.body;

    if (
      typeof name_provider !== "string" ||
      !name_provider.trim() ||
      typeof email_provider !== "string" ||
      !email_provider.trim()
    ) {
      await deleteUploadedFiles(files);

      return res.status(400).json({
        success: false,
        message: "Nama dan email provider wajib diisi",
      });
    }

    const email = email_provider.trim().toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      await deleteUploadedFiles(files);

      return res.status(400).json({
        success: false,
        message: "Format email tidak valid",
      });
    }

    // Ambil field data yang diizinkan.
    const data = pickFields(req.body, REGISTRATION_FIELDS);

    data.name_provider = name_provider.trim();
    data.email_provider = email;

    // File sudah diunggah ke S3 oleh multer-s3.
    // Simpan URL dari file.location.
    for (const field of DOCUMENT_FIELDS) {
      data[field] = getFileUrl(files, field);
    }

    // Status awal PENDING_OTP diatur oleh model.
    providerId = await providerModel.createProvider(data);

    try {
      // Generate OTP dan JWT.
      const otpData = await providerModel.createProviderOtp(providerId);

      // Kirim OTP asli melalui email.
      await sendOtpEmail(otpData.email_provider, otpData.otp);

      // JWT diberikan kepada frontend.
      return res.status(201).json({
        success: true,
        message:
          "Provider berhasil didaftarkan. " + "OTP telah dikirim ke email.",
        data: {
          id_provider: providerId,
          name_provider: data.name_provider,
          email_provider: email,
          status_provider: "PENDING_OTP",
          otp_token: otpData.otp_token,
          expires_in_seconds: otpData.expires_in_seconds,
        },
      });
    } catch (otpError) {
      console.error("Gagal membuat atau mengirim OTP:", otpError);

      // Data provider sudah tersimpan.
      // Jangan menghapus data dan dokumennya.
      return res.status(202).json({
        success: true,
        message:
          "Registrasi tersimpan, tetapi OTP belum " +
          "berhasil dikirim. Silakan minta OTP baru.",
        data: {
          id_provider: providerId,
          email_provider: email,
          status_provider: "PENDING_OTP",
        },
      });
    }
  } catch (error) {
    // Bersihkan file yang terunggah jika INSERT gagal.
    if (!providerId) {
      await deleteUploadedFiles(files);
    }

    return handleError(res, error);
  }
};

// READ ALL
export const getAllProviders = async (req, res) => {
  try {
    const providers = await providerModel.getProviders();

    return res.status(200).json({
      success: true,
      providers,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// READ BY ID
export const getProviderById = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "ID provider tidak valid",
    });
  }

  try {
    const provider = await providerModel.getProviderById(id);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider tidak ditemukan",
      });
    }

    return res.status(200).json({
      success: true,
      provider,
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// UPDATE
export const updateProvider = async (req, res) => {
  const { id } = req.params;
  const files = req.files || {};

  let updated = false;

  try {
    if (!isValidId(id)) {
      await deleteUploadedFiles(files);

      return res.status(400).json({
        success: false,
        message: "ID provider tidak valid",
      });
    }

    const provider = await providerModel.getProviderById(id);

    if (!provider) {
      await deleteUploadedFiles(files);

      return res.status(404).json({
        success: false,
        message: "Provider tidak ditemukan",
      });
    }

    if (provider.status_provider !== "PENDING_OTP") {
      await deleteUploadedFiles(files);

      return res.status(409).json({
        success: false,
        message: "Provider hanya dapat diperbarui sebelum OTP diverifikasi",
      });
    }

    const data = pickFields(req.body, UPDATE_FIELDS);

    // Ganti URL dokumen hanya jika file baru dikirim.
    for (const field of DOCUMENT_FIELDS) {
      const url = getFileUrl(files, field);

      if (url) {
        data[field] = url;
      }
    }

    if (Object.keys(data).length === 0) {
      await deleteUploadedFiles(files);

      return res.status(400).json({
        success: false,
        message: "Tidak ada data untuk diperbarui",
      });
    }

    updated = await providerModel.updateProvider(id, data);

    if (!updated) {
      await deleteUploadedFiles(files);

      return res.status(409).json({
        success: false,
        message:
          "Tidak ada data yang diperbarui atau " +
          "status provider telah berubah",
      });
    }

    // Catat URL lama yang telah diganti.
    const oldUrls = DOCUMENT_FIELDS.filter(
      (field) =>
        data[field] && provider[field] && data[field] !== provider[field],
    ).map((field) => provider[field]);

    // Bersihkan file lama yang diganti.
    if (oldUrls.length > 0) {
      await deleteStoredFiles(oldUrls);
    }

    return res.status(200).json({
      success: true,
      message: "Provider berhasil diperbarui",
      data: {
        id_provider: Number(id),
      },
    });
  } catch (error) {
    if (!updated) {
      await deleteUploadedFiles(files);
    }

    return handleError(res, error);
  }
};

// DELETE
export const deleteProvider = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "ID provider tidak valid",
    });
  }

  try {
    const provider = await providerModel.getProviderById(id);

    if (!provider) {
      return res.status(404).json({
        success: false,
        message: "Provider tidak ditemukan",
      });
    }

    const success = await providerModel.deleteProvider(id);

    if (!success) {
      return res.status(409).json({
        success: false,
        message:
          "Provider tidak ditemukan atau " +
          "tidak dapat dihapus pada status saat ini",
      });
    }

    const documentUrls = DOCUMENT_FIELDS.map((field) => provider[field]).filter(
      Boolean,
    );

    // Database dihapus terlebih dahulu.
    // Kemudian bersihkan berkas yang tersimpan.
    if (documentUrls.length > 0) {
      await deleteStoredFiles(documentUrls);
    }

    return res.status(200).json({
      success: true,
      message: "Provider berhasil dihapus",
      data: {
        id_provider: Number(id),
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// RESEND OTP
export const resendProviderOtp = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "ID provider tidak valid",
    });
  }

  try {
    const otpData = await providerModel.createProviderOtp(id);

    await sendOtpEmail(otpData.email_provider, otpData.otp);

    return res.status(200).json({
      success: true,
      message: "OTP berhasil dikirim ke email",
      data: {
        id_provider: Number(id),
        email_provider: otpData.email_provider,
        otp_token: otpData.otp_token,
        expires_in_seconds: otpData.expires_in_seconds,
      },
    });
  } catch (error) {
    if (error.message === "Provider tidak ditemukan") {
      return res.status(404).json({
        success: false,
        message: "Provider tidak ditemukan",
      });
    }

    if (error.message === "Provider tidak berada dalam tahap verifikasi OTP") {
      return res.status(409).json({
        success: false,
        message: "Provider sudah melewati tahap verifikasi OTP",
      });
    }

    return handleError(res, error);
  }
};

// VERIFY OTP
export const verifyProviderOtp = async (req, res) => {
  const { id } = req.params;

  const { email_provider, otp, otp_token } = req.body;

  if (
    !isValidId(id) ||
    typeof email_provider !== "string" ||
    !email_provider.trim() ||
    !/^\d{6}$/.test(String(otp ?? "")) ||
    typeof otp_token !== "string" ||
    !otp_token.trim()
  ) {
    return res.status(400).json({
      success: false,
      message: "Data verifikasi OTP tidak valid",
    });
  }

  try {
    const success = await providerModel.verifyProviderOtp(
      id,
      email_provider.trim().toLowerCase(),
      String(otp),
      otp_token,
    );

    if (!success) {
      return res.status(400).json({
        success: false,
        message:
          "OTP tidak valid, sudah kedaluwarsa, " + "atau sudah digunakan",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Email berhasil diverifikasi. " +
        "Provider menunggu persetujuan tim internal.",
      data: {
        id_provider: Number(id),
        status_provider: "PENDING_APPROVAL",
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// APPROVE
export const approveProvider = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "ID provider tidak valid",
    });
  }

  try {
    // Model hanya membuat balance dan
    // mengubah status menjadi APPROVED.
    const success = await providerModel.approveProvider(id);

    return res.status(200).json({
      success,
      message: "Provider berhasil disetujui dan balance berhasil dibuat",
      data: {
        id_provider: Number(id),
        status_provider: "APPROVED",
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};

// REJECT
export const rejectProvider = async (req, res) => {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "ID provider tidak valid",
    });
  }

  try {
    const success = await providerModel.rejectProvider(id);

    if (!success) {
      return res.status(409).json({
        success: false,
        message: "Provider tidak ditemukan atau tidak sedang menunggu approval",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Pendaftaran provider berhasil ditolak",
      data: {
        id_provider: Number(id),
        status_provider: "REJECTED",
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
};
