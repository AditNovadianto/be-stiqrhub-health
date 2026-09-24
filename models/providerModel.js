import { db } from "../config/db.js";
import jwt from "jsonwebtoken";
import {
  randomInt,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

// OTP HELPERS
const OTP_SECRET = process.env.PROVIDER_OTP_SECRET;

function getOtpSecret() {
  if (!OTP_SECRET || Buffer.byteLength(OTP_SECRET) < 32) {
    throw new Error("PROVIDER_OTP_SECRET harus minimal 32 byte");
  }

  return OTP_SECRET;
}

function generateOtp() {
  return randomInt(0, 1000000).toString().padStart(6, "0");
}

function hashOtp(id, email, otp, jti) {
  return createHmac("sha256", getOtpSecret())
    .update(`${id}:${email}:${jti}:${otp}`)
    .digest("hex");
}

// CREATE
export const createProvider = async (data) => {
  try {
    const {
      name_provider,
      email_provider,
      phone_number_provider,
      address_provider,
      province_provider,
      city_provider,
      district_provider,
      postal_code_provider,
      logo_provider,
      description_provider,
      akta_pendirian_perusahaan,
      nomor_induk_berusaha,
      npwp,
      sertifikat_standard,
      persetujuan_lingkungan,
      surat_izin_apotek,
      id_provider_category,
    } = data;

    const [result] = await db.query(
      `INSERT INTO providers (
        name_provider,
        email_provider,
        phone_number_provider,
        address_provider,
        province_provider,
        city_provider,
        district_provider,
        postal_code_provider,
        logo_provider,
        description_provider,
        status_provider,
        akta_pendirian_perusahaan,
        nomor_induk_berusaha,
        npwp,
        sertifikat_standard,
        persetujuan_lingkungan,
        surat_izin_apotek,
        id_platform,
        id_provider_category
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
      [
        name_provider,
        email_provider,
        phone_number_provider,
        address_provider,
        province_provider,
        city_provider,
        district_provider,
        postal_code_provider,
        logo_provider ?? null,
        description_provider ?? null,
        "PENDING_OTP",
        akta_pendirian_perusahaan ?? null,
        nomor_induk_berusaha ?? null,
        npwp ?? null,
        sertifikat_standard ?? null,
        persetujuan_lingkungan ?? null,
        surat_izin_apotek ?? null,
        1,
        id_provider_category,
      ],
    );

    return result.insertId;
  } catch (error) {
    console.error("Error creating provider:", error);
    throw error;
  }
};

// READ
export async function getProviders() {
  try {
    const [rows] = await db.query(
      "SELECT * FROM providers ORDER BY id_provider DESC",
    );

    return rows;
  } catch (error) {
    console.error("Error fetching providers:", error);
    throw error;
  }
}

export async function getProviderById(id_provider) {
  try {
    const [rows] = await db.query(
      "SELECT * FROM providers WHERE id_provider = ?",
      [id_provider],
    );

    return rows[0] ?? null;
  } catch (error) {
    console.error("Error fetching provider:", error);
    throw error;
  }
}

// UPDATE
export async function updateProvider(id_provider, data) {
  try {
    const allowedFields = [
      "name_provider",
      "phone_number_provider",
      "address_provider",
      "province_provider",
      "city_provider",
      "district_provider",
      "postal_code_provider",
      "logo_provider",
      "description_provider",
      "akta_pendirian_perusahaan",
      "nomor_induk_berusaha",
      "npwp",
      "sertifikat_standard",
      "persetujuan_lingkungan",
      "surat_izin_apotek",
      "id_provider_category",
    ];

    const fields = [];
    const values = [];

    for (const field of allowedFields) {
      if (data[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(data[field]);
      }
    }

    if (fields.length === 0) {
      return false;
    }

    const [result] = await db.query(
      `UPDATE providers
       SET ${fields.join(", ")}
       WHERE id_provider = ?
       AND status_provider = 'PENDING_OTP'`,
      [...values, id_provider],
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error updating provider:", error);
    throw error;
  }
}

// DELETE
export async function deleteProvider(id_provider) {
  try {
    const [result] = await db.query(
      `DELETE FROM providers
       WHERE id_provider = ?
       AND status_provider IN ('PENDING_OTP', 'REJECTED')`,
      [id_provider],
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error deleting provider:", error);
    throw error;
  }
}

// GENERATE OTP
export async function createProviderOtp(id_provider) {
  try {
    const provider = await getProviderById(id_provider);

    if (!provider) {
      throw new Error("Provider tidak ditemukan");
    }

    if (provider.status_provider !== "PENDING_OTP") {
      throw new Error("Provider tidak berada dalam tahap verifikasi OTP");
    }

    const otp = generateOtp();
    const jti = randomUUID();
    const email = provider.email_provider.trim().toLowerCase();

    const otpHash = hashOtp(provider.id_provider, email, otp, jti);

    const otpToken = jwt.sign(
      {
        purpose: "PROVIDER_OTP",
        email_provider: email,
        otp_hash: otpHash,
      },
      getOtpSecret(),
      {
        algorithm: "HS256",
        subject: String(provider.id_provider),
        issuer: "stiQR-b2b",
        audience: "provider-otp",
        jwtid: jti,
        expiresIn: "5m",
      },
    );

    return {
      id_provider: provider.id_provider,
      email_provider: email,
      otp,
      otp_token: otpToken,
      expires_in_seconds: 300,
    };
  } catch (error) {
    console.error("Error creating OTP:", error);
    throw error;
  }
}

// VERIFY OTP
export async function verifyProviderOtp(
  id_provider,
  email_provider,
  otp,
  otp_token,
) {
  if (
    typeof email_provider !== "string" ||
    typeof otp_token !== "string" ||
    !/^\d{6}$/.test(String(otp))
  ) {
    return false;
  }

  const email = email_provider.trim().toLowerCase();

  let payload;

  try {
    // jwt.verify memeriksa signature dan expiration.
    payload = jwt.verify(otp_token, getOtpSecret(), {
      algorithms: ["HS256"],
      issuer: "stiQR-b2b",
      audience: "provider-otp",
      subject: String(id_provider),
    });
  } catch (error) {
    if (
      error.name === "TokenExpiredError" ||
      error.name === "JsonWebTokenError" ||
      error.name === "NotBeforeError"
    ) {
      return false;
    }

    throw error;
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    payload.purpose !== "PROVIDER_OTP" ||
    payload.email_provider !== email ||
    typeof payload.jti !== "string" ||
    typeof payload.otp_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.otp_hash)
  ) {
    return false;
  }

  const expectedHash = hashOtp(id_provider, email, String(otp), payload.jti);

  const submittedBuffer = Buffer.from(expectedHash, "hex");

  const storedBuffer = Buffer.from(payload.otp_hash, "hex");

  if (
    submittedBuffer.length !== storedBuffer.length ||
    !timingSafeEqual(submittedBuffer, storedBuffer)
  ) {
    return false;
  }

  // Update bersyarat memastikan OTP hanya dapat
  // menyelesaikan verifikasi satu kali.
  const [result] = await db.query(
    `UPDATE providers
     SET status_provider = 'PENDING_APPROVAL'
     WHERE id_provider = ?
      AND email_provider = ?
      AND status_provider = 'PENDING_OTP'`,
    [id_provider, email],
  );

  return result.affectedRows === 1;
}

// APPROVE
export async function approveProvider(id_provider) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Ambil dan kunci data provider selama approval.
    const [rows] = await connection.query(
      `SELECT *
       FROM providers
       WHERE id_provider = ?
       FOR UPDATE`,
      [id_provider],
    );

    const provider = rows[0];

    if (!provider || provider.status_provider !== "PENDING_APPROVAL") {
      const error = new Error("Provider belum memenuhi syarat approval");

      error.statusCode = 409;
      throw error;
    }

    await connection.query(
      `INSERT INTO balances (
        total_amount,
        total_amount_dana,
        id_provider
      ) VALUES (?, ?, ?)`,
      [0, 0, id_provider],
    );

    // Ubah status provider menjadi APPROVED.
    const [result] = await connection.query(
      `UPDATE providers
       SET status_provider = 'APPROVED'
       WHERE id_provider = ?
         AND status_provider = 'PENDING_APPROVAL'`,
      [id_provider],
    );

    if (result.affectedRows !== 1) {
      throw new Error("Gagal menyetujui provider");
    }

    await connection.commit();

    return true;
  } catch (error) {
    await connection.rollback();

    console.error("Error approving provider:", error);
    throw error;
  } finally {
    connection.release();
  }
}

// REJECT
export async function rejectProvider(id_provider) {
  try {
    const [result] = await db.query(
      `UPDATE providers
       SET status_provider = 'REJECTED'
       WHERE id_provider = ?
       AND status_provider = 'PENDING_APPROVAL'`,
      [id_provider],
    );

    return result.affectedRows > 0;
  } catch (error) {
    console.error("Error rejecting provider:", error);
    throw error;
  }
}
