import { db } from "../config/db.js";
import jwt from "jsonwebtoken";

import {
  randomInt,
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

import { sendFinishTreatmentOtpEmail } from "../utils/mailer.js";

// HELPERS
const errorWithStatus = (message, statusCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const normalizeHealthPassStatus = (value) => {
  return String(value || "")
    .trim()
    .toUpperCase();
};

const validateHealthPassTime = (healthPass) => {
  const now = new Date();
  const validFrom = new Date(healthPass.valid_from);
  const validUntil = new Date(healthPass.valid_until);

  if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
    throw errorWithStatus("Masa berlaku Health Pass tidak valid", 500);
  }

  if (now < validFrom) {
    throw errorWithStatus("Health Pass belum dapat digunakan", 409);
  }

  if (now > validUntil) {
    throw errorWithStatus("Health Pass sudah melewati masa berlaku", 409);
  }
};

// FINISH TREATMENT OTP - STATELESS JWT + HMAC
const FINISH_OTP_TTL_SECONDS = 300;

const FINISH_OTP_ISSUER = "stiQR-health";
const FINISH_OTP_AUDIENCE = "health-pass-finish-otp";
const FINISH_OTP_PURPOSE = "HEALTH_PASS_FINISH";

const FINISH_OTP_RE = /^\d{6}$/;
const FINISH_OTP_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// OTP SECRET
function getFinishOtpSecret() {
  const secret = process.env.HEALTH_PASS_FINISH_OTP_SECRET;

  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw errorWithStatus(
      "HEALTH_PASS_FINISH_OTP_SECRET harus minimal 32 byte",
      500,
    );
  }

  return secret;
}

// NORMALIZE EMAIL
function normalizeFinishOtpEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

// GENERATE OTP
function generateFinishOtp() {
  return randomInt(0, 1000000).toString().padStart(6, "0");
}

// HASH OTP
function hashFinishOtp({
  healthPassId,
  orderId,
  providerId,
  providerUserId,
  email,
  otp,
  jti,
}) {
  const payload = JSON.stringify([
    FINISH_OTP_PURPOSE,
    String(healthPassId),
    String(orderId),
    String(providerId),
    String(providerUserId),
    normalizeFinishOtpEmail(email),
    String(jti),
    String(otp),
  ]);

  return createHmac("sha256", getFinishOtpSecret())
    .update(payload)
    .digest("hex");
}

// CREATE OTP CHALLENGE
function createFinishOtpChallenge({
  id_health_pass,
  id_order,
  id_provider,
  id_provider_user,
  email_customer,
}) {
  const email = normalizeFinishOtpEmail(email_customer);

  if (!FINISH_OTP_EMAIL_RE.test(email)) {
    throw errorWithStatus("Email pasien tidak valid", 422);
  }

  const otp = generateFinishOtp();
  const jti = randomUUID();

  const otpHash = hashFinishOtp({
    healthPassId: id_health_pass,
    orderId: id_order,
    providerId: id_provider,
    providerUserId: id_provider_user,
    email,
    otp,
    jti,
  });

  const otpToken = jwt.sign(
    {
      purpose: FINISH_OTP_PURPOSE,

      id_order: String(id_order),
      id_provider: String(id_provider),

      id_provider_user: String(id_provider_user),

      email_customer: email,

      otp_hash: otpHash,
    },
    getFinishOtpSecret(),
    {
      algorithm: "HS256",

      subject: String(id_health_pass),

      issuer: FINISH_OTP_ISSUER,

      audience: FINISH_OTP_AUDIENCE,

      jwtid: jti,

      expiresIn: FINISH_OTP_TTL_SECONDS,
    },
  );

  return {
    otp,
    otp_token: otpToken,
    expires_in_seconds: FINISH_OTP_TTL_SECONDS,
  };
}

// VERIFY OTP CHALLENGE
function verifyFinishOtpChallenge({
  id_health_pass,
  id_order,
  id_provider,
  id_provider_user,
  email_customer,
  otp,
  otp_token,
}) {
  if (typeof otp !== "string" || !FINISH_OTP_RE.test(otp)) {
    throw errorWithStatus("OTP harus terdiri dari 6 digit angka", 400);
  }

  if (typeof otp_token !== "string" || !otp_token.trim()) {
    throw errorWithStatus("otp_token wajib diisi", 400);
  }

  let payload;

  try {
    payload = jwt.verify(otp_token, getFinishOtpSecret(), {
      algorithms: ["HS256"],

      issuer: FINISH_OTP_ISSUER,

      audience: FINISH_OTP_AUDIENCE,

      subject: String(id_health_pass),
    });
  } catch {
    throw errorWithStatus("OTP tidak valid atau sudah kedaluwarsa", 401);
  }

  const email = normalizeFinishOtpEmail(email_customer);

  const validPayload =
    payload.purpose === FINISH_OTP_PURPOSE &&
    payload.id_order === String(id_order) &&
    payload.id_provider === String(id_provider) &&
    payload.id_provider_user === String(id_provider_user) &&
    payload.email_customer === email &&
    typeof payload.jti === "string" &&
    /^[a-f0-9]{64}$/.test(String(payload.otp_hash || ""));

  if (!validPayload) {
    throw errorWithStatus(
      "OTP tidak sesuai dengan Health Pass atau Provider User",
      401,
    );
  }

  const actualHash = Buffer.from(
    hashFinishOtp({
      healthPassId: id_health_pass,

      orderId: id_order,

      providerId: id_provider,

      providerUserId: id_provider_user,

      email,

      otp,

      jti: payload.jti,
    }),
    "hex",
  );

  const expectedHash = Buffer.from(payload.otp_hash, "hex");

  if (
    actualHash.length !== expectedHash.length ||
    !timingSafeEqual(actualHash, expectedHash)
  ) {
    throw errorWithStatus("Kode OTP tidak sesuai", 401);
  }

  return true;
}

// REQUEST FINISH TREATMENT OTP
export async function requestFinishTreatmentOtp({
  id_health_pass,
  id_provider,
  id_provider_user,
}) {
  const healthPassId = String(id_health_pass || "").trim();

  const providerId = Number(id_provider);

  const providerUserId = Number(id_provider_user);

  if (!healthPassId) {
    throw errorWithStatus("ID Health Pass wajib diisi", 400);
  }

  if (
    !Number.isSafeInteger(providerId) ||
    providerId <= 0 ||
    !Number.isSafeInteger(providerUserId) ||
    providerUserId <= 0
  ) {
    throw errorWithStatus("Identitas Provider User tidak valid", 403);
  }

  // VALIDATE PROVIDER USER
  const [providerUsers] = await db.query(
    `
      SELECT
        id_provider_user,
        status_provider_user

      FROM provider_users

      WHERE id_provider_user = ?
        AND id_provider = ?

      LIMIT 1
    `,
    [providerUserId, providerId],
  );

  const providerUser = providerUsers[0];

  if (!providerUser) {
    throw errorWithStatus(
      "Provider User tidak ditemukan atau tidak berwenang",
      403,
    );
  }

  if (
    String(providerUser.status_provider_user || "")
      .trim()
      .toUpperCase() !== "ACTIVE"
  ) {
    throw errorWithStatus("Provider User tidak aktif", 403);
  }

  // GET HEALTH PASS
  const [rows] = await db.query(
    `
      ${HEALTH_PASS_SELECT}

      WHERE hp.id_health_pass = ?
        AND s.id_provider = ?

      LIMIT 1
    `,
    [healthPassId, providerId],
  );

  const healthPass = rows[0];

  if (!healthPass) {
    throw errorWithStatus(
      "Health Pass tidak ditemukan atau bukan milik provider ini",
      404,
    );
  }

  // VALIDATE HEALTH PASS STATUS
  const status = normalizeHealthPassStatus(healthPass.status_health_pass);

  if (
    status !== "REDEEMED" ||
    !healthPass.redeemed_at ||
    healthPass.finished_at
  ) {
    throw errorWithStatus(
      "Health Pass harus sudah REDEEMED dan belum FINISHED",
      409,
    );
  }

  if (
    normalizeHealthPassStatus(healthPass.payment_status) !== "APPROVED" ||
    normalizeHealthPassStatus(healthPass.order_status) !== "APPROVED"
  ) {
    throw errorWithStatus("Pembayaran atau order belum disetujui", 409);
  }

  // VALIDATE PATIENT EMAIL
  const email = normalizeFinishOtpEmail(healthPass.email_customer);

  if (!FINISH_OTP_EMAIL_RE.test(email)) {
    throw errorWithStatus("Email pasien tidak tersedia atau tidak valid", 422);
  }

  // GENERATE OTP + JWT
  const challenge = createFinishOtpChallenge({
    id_health_pass: healthPass.id_health_pass,

    id_order: healthPass.id_order,

    id_provider: providerId,

    id_provider_user: providerUserId,

    email_customer: email,
  });

  // SEND EMAIL
  await sendFinishTreatmentOtpEmail({
    email,

    name: healthPass.name_customer,

    otp: challenge.otp,

    serviceName: healthPass.name_service,

    providerName: healthPass.name_provider,
  });

  const [localPart, domain] = email.split("@");

  const maskedEmail = `${localPart.slice(0, 1)}***@${domain}`;

  // OTP asli tidak dikirim ke Provider User.
  // Hanya JWT challenge yang dikembalikan.

  return {
    otp_token: challenge.otp_token,

    expires_in_seconds: challenge.expires_in_seconds,

    recipient_email_masked: maskedEmail,
  };
}

// BASE SELECT
const HEALTH_PASS_SELECT = `
  SELECT
    hp.id_health_pass,
    hp.status_health_pass,

    CONCAT(
      DATE_FORMAT(
        hp.valid_from,
        '%Y-%m-%dT%H:%i:%s'
      ),
      '+07:00'
    ) AS valid_from,

    CONCAT(
      DATE_FORMAT(
        hp.valid_until,
        '%Y-%m-%dT%H:%i:%s'
      ),
      '+07:00'
    ) AS valid_until,

    CONCAT(
      DATE_FORMAT(
        hp.booking_at,
        '%Y-%m-%dT%H:%i:%s'
      ),
      '+07:00'
    ) AS booking_at,

    hp.redeemed_at,
    hp.redeemed_by,

    CONCAT(
      DATE_FORMAT(hp.finished_at, '%Y-%m-%dT%H:%i:%s'),
      '+07:00'
    ) AS finished_at,

    hp.finished_by,
    hp.doctor_notes,
    hp.id_order,

    o.id_customer,
    o.id_guest,
    o.id_service,
    o.payment_status,
    o.order_status,

    CASE
      WHEN o.id_guest IS NOT NULL
        THEN 'GUEST'

      WHEN o.id_customer IS NOT NULL
        THEN 'CUSTOMER'

      ELSE 'UNKNOWN'
    END AS recipient_type,

    CASE
      WHEN o.id_guest IS NOT NULL
        THEN g.name_guest

      ELSE c.name_customer
    END AS name_customer,

    CASE
      WHEN o.id_guest IS NOT NULL
        THEN g.email_guest

      ELSE c.email_customer
    END AS email_customer,

    CASE
      WHEN o.id_guest IS NOT NULL
        THEN g.phone_number_guest

      ELSE c.phone_number_customer
    END AS phone_number_customer,

    CASE
      WHEN o.id_guest IS NOT NULL
        THEN NULL

      ELSE DATE_FORMAT(
        c.dob_customer,
        '%Y-%m-%d'
      )
    END AS dob_customer,

    s.name_service,
    s.price_service,
    s.image_service,
    s.description_service,
    s.id_provider,

    p.name_provider

  FROM health_passes hp

  INNER JOIN orders o
    ON hp.id_order = o.id_order

  LEFT JOIN customers c
    ON o.id_customer = c.id_customer

  LEFT JOIN guests g
    ON o.id_guest = g.id_guest

  INNER JOIN services s
    ON o.id_service = s.id_service

  INNER JOIN providers p
    ON s.id_provider = p.id_provider
`;

// GET HEALTH PASS BY ID
export async function getHealthPassById(id_health_pass) {
  const [rows] = await db.query(
    `
      ${HEALTH_PASS_SELECT}

      WHERE hp.id_health_pass = ?

      LIMIT 1
    `,
    [id_health_pass],
  );

  return rows[0] || null;
}

// GET HEALTH PASS BY ORDER
export async function getHealthPassByOrder(id_order) {
  const [rows] = await db.query(
    `
      ${HEALTH_PASS_SELECT}

      WHERE hp.id_order = ?

      LIMIT 1
    `,
    [id_order],
  );

  return rows[0] || null;
}

// GET HEALTH PASS BY ORDER + CUSTOMER
export async function getHealthPassByOrderForCustomer(id_order, id_customer) {
  const [rows] = await db.query(
    `
      ${HEALTH_PASS_SELECT}

      WHERE hp.id_order = ?
        AND o.id_customer = ?

      LIMIT 1
    `,
    [id_order, id_customer],
  );

  return rows[0] || null;
}

// GET HEALTH PASSES BY CUSTOMER
export async function getHealthPassesByCustomer(id_customer) {
  const [rows] = await db.query(
    `
      ${HEALTH_PASS_SELECT}

      WHERE o.id_customer = ?

      ORDER BY hp.booking_at DESC
    `,
    [id_customer],
  );

  return rows;
}

// GET HEALTH PASSES BY PROVIDER
export async function getHealthPassesByProvider(id_provider) {
  const [rows] = await db.query(
    `
      ${HEALTH_PASS_SELECT}

      WHERE s.id_provider = ?

      ORDER BY hp.booking_at DESC
    `,
    [id_provider],
  );

  return rows;
}

// VALIDATE HEALTH PASS FOR PROVIDER
export async function validateHealthPassForProvider(
  id_health_pass,
  id_provider,
) {
  const healthPass = await getHealthPassById(id_health_pass);

  if (!healthPass) {
    throw errorWithStatus("Health Pass tidak ditemukan", 404);
  }

  // PROVIDER OWNERSHIP
  if (Number(healthPass.id_provider) !== Number(id_provider)) {
    throw errorWithStatus("Health Pass bukan milik provider ini", 403);
  }

  // ORDER MUST BE APPROVED
  if (
    normalizeHealthPassStatus(healthPass.payment_status) !== "APPROVED" ||
    normalizeHealthPassStatus(healthPass.order_status) !== "APPROVED"
  ) {
    throw errorWithStatus("Order Health Pass belum disetujui", 409);
  }

  // HEALTH PASS STATUS
  const status = normalizeHealthPassStatus(healthPass.status_health_pass);

  if (status === "REDEEMED") {
    throw errorWithStatus("Health Pass sudah pernah digunakan", 409);
  }

  if (status !== "ACTIVE") {
    throw errorWithStatus(
      `Health Pass tidak aktif. Status saat ini: ${status}`,
      409,
    );
  }

  // VALIDITY TIME
  validateHealthPassTime(healthPass);

  return healthPass;
}

// REDEEM HEALTH PASS
// Digunakan oleh QR redeem dan manual ID redeem.
export async function redeemHealthPass({
  id_health_pass,
  id_provider,
  redeemed_by,
}) {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. LOCK HEALTH PASS
    const [rows] = await connection.query(
      `
        SELECT
          hp.id_health_pass,
          hp.status_health_pass,

          CONCAT(
            DATE_FORMAT(
              hp.valid_from,
              '%Y-%m-%dT%H:%i:%s'
            ),
            '+07:00'
          ) AS valid_from,

          CONCAT(
            DATE_FORMAT(
              hp.valid_until,
              '%Y-%m-%dT%H:%i:%s'
            ),
            '+07:00'
          ) AS valid_until,

          CONCAT(
            DATE_FORMAT(
              hp.booking_at,
              '%Y-%m-%dT%H:%i:%s'
            ),
            '+07:00'
          ) AS booking_at,

          hp.redeemed_at,
          hp.redeemed_by,
          hp.id_order,

          -- ORDER INFORMATION
          o.id_customer,
          o.id_guest,
          o.id_service,
          o.payment_status,
          o.order_status,

          -- PROVIDER AND SERVICE
          s.id_provider,
          s.name_service,
          p.name_provider,

          -- RECIPIENT TYPE
          CASE
            WHEN o.id_guest IS NOT NULL
              THEN 'GUEST'
            ELSE 'CUSTOMER'
          END AS recipient_type,

          -- RECIPIENT NAME
          CASE
            WHEN o.id_guest IS NOT NULL
              THEN g.name_guest
            ELSE c.name_customer
          END AS name_customer,

          -- RECIPIENT EMAIL
          CASE
            WHEN o.id_guest IS NOT NULL
              THEN g.email_guest
            ELSE c.email_customer
          END AS email_customer,

          -- RECIPIENT PHONE NUMBER
          CASE
            WHEN o.id_guest IS NOT NULL
              THEN g.phone_number_guest
            ELSE c.phone_number_customer
          END AS phone_number_customer,

          -- DOB: CUSTOMER ONLY
          CASE
            WHEN o.id_guest IS NOT NULL
              THEN NULL
            ELSE DATE_FORMAT(
              c.dob_customer,
              '%Y-%m-%d'
            )
          END AS dob_customer

        FROM health_passes hp

        INNER JOIN orders o
          ON hp.id_order = o.id_order

        INNER JOIN services s
          ON o.id_service = s.id_service

        INNER JOIN providers p
          ON s.id_provider = p.id_provider

        -- CUSTOMER IS OPTIONAL FOR GUEST ORDERS
        LEFT JOIN customers c
          ON o.id_customer = c.id_customer

        -- GUEST IS OPTIONAL FOR CUSTOMER ORDERS
        LEFT JOIN guests g
          ON o.id_guest = g.id_guest

        WHERE hp.id_health_pass = ?

        LIMIT 1

        FOR UPDATE
      `,
      [id_health_pass],
    );

    if (rows.length === 0) {
      throw errorWithStatus("Health Pass tidak ditemukan", 404);
    }

    const healthPass = rows[0];

    // 2. VALIDATE PROVIDER
    if (Number(healthPass.id_provider) !== Number(id_provider)) {
      throw errorWithStatus("Health Pass bukan milik provider ini", 403);
    }

    // 3. VALIDATE ORDER
    if (
      normalizeHealthPassStatus(healthPass.payment_status) !== "APPROVED" ||
      normalizeHealthPassStatus(healthPass.order_status) !== "APPROVED"
    ) {
      throw errorWithStatus("Order Health Pass belum disetujui", 409);
    }

    // 4. VALIDATE STATUS
    const status = normalizeHealthPassStatus(healthPass.status_health_pass);

    if (status === "REDEEMED") {
      throw errorWithStatus("Health Pass sudah pernah digunakan", 409);
    }

    if (status !== "ACTIVE") {
      throw errorWithStatus(
        `Health Pass tidak dapat diredeem. Status: ${status}`,
        409,
      );
    }

    // 5. VALIDATE TIME
    validateHealthPassTime(healthPass);

    // 6. REDEEM
    const [result] = await connection.query(
      `
        UPDATE health_passes

        SET
          status_health_pass = 'REDEEMED',
          redeemed_at = NOW(),
          redeemed_by = ?

        WHERE id_health_pass = ?
          AND status_health_pass = 'ACTIVE'
      `,
      [redeemed_by, id_health_pass],
    );

    if (result.affectedRows !== 1) {
      throw errorWithStatus("Health Pass gagal diredeem", 409);
    }

    // 7. GET UPDATED HEALTH PASS
    const [updatedRows] = await connection.query(
      `
        SELECT
          id_health_pass,
          status_health_pass,

          CONCAT(
            DATE_FORMAT(
              valid_from,
              '%Y-%m-%dT%H:%i:%s'
            ),
            '+07:00'
          ) AS valid_from,

          CONCAT(
            DATE_FORMAT(
              valid_until,
              '%Y-%m-%dT%H:%i:%s'
            ),
            '+07:00'
          ) AS valid_until,

          CONCAT(
            DATE_FORMAT(
              booking_at,
              '%Y-%m-%dT%H:%i:%s'
            ),
            '+07:00'
          ) AS booking_at,

          redeemed_at,
          redeemed_by,
          id_order

        FROM health_passes

        WHERE id_health_pass = ?

        LIMIT 1
      `,
      [id_health_pass],
    );

    await connection.commit();

    return {
      ...healthPass,

      status_health_pass: "REDEEMED",

      redeemed_at: updatedRows[0]?.redeemed_at || null,

      redeemed_by: updatedRows[0]?.redeemed_by || redeemed_by,
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// ADMIN - GET ALL HEALTH PASSES
export async function getAllHealthPassesForAdmin() {
  const [rows] = await db.query(
    `
      ${HEALTH_PASS_SELECT}

      ORDER BY
        hp.booking_at DESC,
        hp.id_health_pass DESC
    `,
  );

  return rows;
}

// PROVIDER - FINISH HEALTH PASS WITH OTP
export async function finishHealthPass({
  id_health_pass,
  id_provider,
  finished_by,
  doctor_notes,
  otp,
  otp_token,
}) {
  const healthPassId = String(id_health_pass || "").trim();
  const providerId = Number(id_provider);
  const providerUserId = Number(finished_by);

  const doctorNotes =
    typeof doctor_notes === "string" ? doctor_notes.trim() : "";

  if (!healthPassId) {
    throw errorWithStatus("ID Health Pass wajib diisi", 400);
  }

  if (
    !Number.isSafeInteger(providerId) ||
    providerId <= 0 ||
    !Number.isSafeInteger(providerUserId) ||
    providerUserId <= 0
  ) {
    throw errorWithStatus("Identitas Provider User tidak valid", 403);
  }

  if (!doctorNotes) {
    throw errorWithStatus("Catatan treatment wajib diisi", 400);
  }

  if (doctorNotes.length > 10000) {
    throw errorWithStatus("Catatan treatment maksimal 10000 karakter", 400);
  }

  if (typeof otp !== "string" || !FINISH_OTP_RE.test(otp)) {
    throw errorWithStatus("OTP harus terdiri dari 6 digit angka", 400);
  }

  if (typeof otp_token !== "string" || !otp_token.trim()) {
    throw errorWithStatus("otp_token wajib diisi", 400);
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [providerUsers] = await connection.query(
      `
        SELECT
          id_provider_user,
          id_provider,
          status_provider_user
        FROM provider_users
        WHERE id_provider_user = ?
          AND id_provider = ?
        LIMIT 1
      `,
      [providerUserId, providerId],
    );

    const providerUser = providerUsers[0];

    if (!providerUser) {
      throw errorWithStatus(
        "Provider User tidak ditemukan atau bukan anggota provider ini",
        403,
      );
    }

    const providerUserStatus = String(providerUser.status_provider_user || "")
      .trim()
      .toUpperCase();

    if (providerUserStatus !== "ACTIVE") {
      throw errorWithStatus("Akun Provider User tidak aktif", 403);
    }

    const [rows] = await connection.query(
      `
        SELECT
          hp.id_health_pass,
          hp.id_order,
          hp.status_health_pass,
          hp.redeemed_at,
          hp.redeemed_by,
          hp.finished_at,
          hp.finished_by,

          o.payment_status,
          o.order_status,

          CASE
            WHEN o.id_guest IS NOT NULL
              THEN g.email_guest
            ELSE c.email_customer
          END AS email_customer,

          CASE
            WHEN o.id_guest IS NOT NULL
              THEN g.name_guest
            ELSE c.name_customer
          END AS name_customer,

          s.id_provider,
          s.name_service,
          p.name_provider

        FROM health_passes hp

        INNER JOIN orders o
          ON hp.id_order = o.id_order

        INNER JOIN services s
          ON o.id_service = s.id_service

        INNER JOIN providers p
          ON s.id_provider = p.id_provider

        LEFT JOIN customers c
          ON o.id_customer = c.id_customer

        LEFT JOIN guests g
          ON o.id_guest = g.id_guest

        WHERE hp.id_health_pass = ?

        LIMIT 1
        FOR UPDATE
      `,
      [healthPassId],
    );

    if (!rows.length) {
      throw errorWithStatus("Health Pass tidak ditemukan", 404);
    }

    const healthPass = rows[0];

    if (Number(healthPass.id_provider) !== providerId) {
      throw errorWithStatus("Health Pass bukan milik provider ini", 403);
    }

    const currentStatus = normalizeHealthPassStatus(
      healthPass.status_health_pass,
    );

    if (currentStatus === "FINISHED") {
      throw errorWithStatus("Treatment Health Pass sudah selesai", 409);
    }

    if (currentStatus !== "REDEEMED") {
      throw errorWithStatus(
        `Health Pass harus berstatus REDEEMED. Status saat ini: ${currentStatus}`,
        409,
      );
    }

    if (!healthPass.redeemed_at) {
      throw errorWithStatus("Data redeem Health Pass tidak lengkap", 409);
    }

    if (
      normalizeHealthPassStatus(healthPass.payment_status) !== "APPROVED" ||
      normalizeHealthPassStatus(healthPass.order_status) !== "APPROVED"
    ) {
      throw errorWithStatus("Pembayaran atau order belum disetujui", 409);
    }

    // Menggunakan JWT + HMAC existing.
    // Tidak menyimpan OTP ke database atau memory.

    verifyFinishOtpChallenge({
      id_health_pass: healthPass.id_health_pass,
      id_order: healthPass.id_order,
      id_provider: providerId,
      id_provider_user: providerUserId,
      email_customer: healthPass.email_customer,
      otp,
      otp_token,
    });

    const [result] = await connection.query(
      `
        UPDATE health_passes
        SET
          status_health_pass = 'FINISHED',
          finished_at = NOW(),
          finished_by = ?,
          doctor_notes = ?
        WHERE id_health_pass = ?
          AND status_health_pass = 'REDEEMED'
          AND redeemed_at IS NOT NULL
      `,
      [providerUserId, doctorNotes, healthPassId],
    );

    if (result.affectedRows !== 1) {
      throw errorWithStatus(
        "Treatment gagal diselesaikan atau status telah berubah",
        409,
      );
    }

    const [updatedRows] = await connection.query(
      `
        SELECT
          id_health_pass,
          id_order,
          status_health_pass,

          CONCAT(
            DATE_FORMAT(
              finished_at,
              '%Y-%m-%dT%H:%i:%s'
            ),
            '+07:00'
          ) AS finished_at,

          finished_by,
          doctor_notes

        FROM health_passes
        WHERE id_health_pass = ?
        LIMIT 1
      `,
      [healthPassId],
    );

    if (!updatedRows.length) {
      throw errorWithStatus(
        "Data Health Pass setelah update tidak ditemukan",
        500,
      );
    }

    await connection.commit();

    // Data untuk email dikembalikan setelah COMMIT.
    // Pengiriman email dilakukan di controller.

    return {
      ...updatedRows[0],

      notification: {
        email: healthPass.email_customer,
        name: healthPass.name_customer,
        healthPassId: healthPass.id_health_pass,
        serviceName: healthPass.name_service,
        providerName: healthPass.name_provider,
      },
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
