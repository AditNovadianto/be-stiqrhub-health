import nodemailer from "nodemailer";
import QRCode from "qrcode";
import path from "node:path";

// Logo email disimpan di folder assets pada root backend.
// Jalankan backend dari root project melalui npm run dev.
const EMAIL_LOGO_PATH = path.resolve(
  process.cwd(),
  "assets",
  "logo-stiqrhub-health.jpeg",
);

const EMAIL_LOGO_CID = "stiqr-health-logo";

const transporter = nodemailer.createTransport({
  host: "smtp.stiqr.id",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );

const emailLayout = (title, content) => `
  <div style="
    font-family: Arial, sans-serif;
    background-color: #f4f7fb;
    padding: 30px 16px;
  ">
    <div style="
      max-width: 600px;
      margin: auto;
      background: #ffffff;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0,0,0,0.08);
    ">
      <div style="
        background-color: #032155;
        padding: 26px;
        text-align: center;
      ">
        <h1 style="
          color: #ffffff;
          margin: 0;
          font-size: 24px;
        ">
          ${title}
        </h1>
      </div>

      <div style="
        padding: 32px 30px;
        color: #1f2937;
        font-size: 15px;
        line-height: 1.8;
      ">
        ${content}
      </div>

      <div style="
        border-top: 1px solid #e5e7eb;
        padding: 20px;
        text-align: center;
        color: #9ca3af;
        font-size: 12px;
      ">
        STIQR Health
      </div>
    </div>
  </div>
`;

/**
 * ============================================================
 * SEND OTP EMAIL
 * ============================================================
 */

export const sendOtpEmail = async (email, otp, name = "Pengguna") => {
  const OTP_VALIDITY_MINUTES = 15;

  const safeName = escapeHtml(name || "Pengguna");
  const safeOtp = escapeHtml(otp);

  const html = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

        <title>
          Kode Verifikasi OTP - STIQR Health
        </title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background-color: #F4F7FB;
          font-family: Arial, Helvetica, sans-serif;
          color: #172B4D;
        "
      >
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          width="100%"
          style="background-color: #F4F7FB;"
        >
          <tr>
            <td
              align="center"
              style="padding: 32px 16px;"
            >
              <!-- MAIN EMAIL CONTAINER -->

              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                width="100%"
                style="
                  max-width: 600px;
                  background-color: #FFFFFF;
                  border: 1px solid #E2EAF3;
                  border-radius: 16px;
                "
              >
                <tr>
                  <td
                    style="
                      padding: 40px 32px;
                      font-size: 15px;
                      line-height: 1.75;
                      color: #172B4D;
                    "
                  >
                    <!-- ================================= -->
                    <!-- STIQR HEALTH LOGO -->
                    <!-- ================================= -->

                    <div
                      style="
                        margin: 0 0 32px;
                        text-align: left;
                      "
                    >
                      <img
                        src="cid:${EMAIL_LOGO_CID}"
                        alt="STIQR Health"
                        width="115"
                        style="
                          display: block;
                          width: 115px;
                          max-width: 100%;
                          height: auto;
                          border: 0;
                        "
                      />
                    </div>

                    <!-- ================================= -->
                    <!-- GREETING -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 24px;
                        font-size: 16px;
                        color: #172B4D;
                      "
                    >
                      Halo,
                      <strong>${safeName}</strong>.
                    </p>

                    <!-- ================================= -->
                    <!-- OTP DESCRIPTION -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 22px;
                        font-size: 15px;
                        color: #172B4D;
                      "
                    >
                      Masukkan kode ini untuk verifikasi
                      akun STIQR Health-mu:
                    </p>

                    <!-- ================================= -->
                    <!-- OTP CODE -->
                    <!-- ================================= -->

                    <div
                      style="
                        margin: 0 0 25px;
                        padding: 22px 12px;
                        background-color: #F0F6FF;
                        border: 1px solid #DCEAFF;
                        border-radius: 12px;
                        text-align: center;
                      "
                    >
                      <span
                        style="
                          display: inline-block;
                          font-size: 32px;
                          font-weight: 600;
                          letter-spacing: 7px;
                          line-height: 1.4;
                          color: #003A7A;
                        "
                      >
                        ${safeOtp}
                      </span>
                    </div>

                    <!-- ================================= -->
                    <!-- OTP EXPIRATION -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 22px;
                        font-size: 15px;
                      "
                    >
                      Kode ini hanya berlaku selama
                      <strong>
                        ${OTP_VALIDITY_MINUTES} menit
                      </strong>.
                    </p>

                    <!-- ================================= -->
                    <!-- SECURITY WARNING -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 22px;
                        font-size: 15px;
                      "
                    >
                      Jangan berikan kode ini ke siapa pun,
                      termasuk pihak STIQR.
                    </p>

                    <!-- ================================= -->
                    <!-- AUTOMATED MESSAGE -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 38px;
                        font-size: 15px;
                      "
                    >
                      Email ini dibuat secara otomatis.
                      Mohon untuk tidak membalas.
                    </p>

                    <!-- ================================= -->
                    <!-- TAGLINE -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 40px;
                        font-size: 15px;
                        font-style: italic;
                        font-weight: 700;
                        color: #003A7A;
                      "
                    >
                      Sehat Lebih Dekat, Hidup Lebih Baik
                    </p>

                    <!-- ================================= -->
                    <!-- SIGNATURE -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0;
                        font-size: 17px;
                        font-weight: 600;
                        color: #003A7A;
                      "
                    >
                      STIQR Health
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    "STIQR Health",
    "",
    `Halo, ${name || "Pengguna"}.`,
    "",
    "Masukkan kode ini untuk verifikasi akun STIQR Health-mu:",
    "",
    String(otp),
    "",
    `Kode ini hanya berlaku selama ${OTP_VALIDITY_MINUTES} menit.`,
    "",
    "Jangan berikan kode ini ke siapa pun, termasuk pihak STIQR.",
    "",
    "Email ini dibuat secara otomatis. Mohon untuk tidak membalas.",
    "",
    "Sehat Lebih Dekat, Hidup Lebih Baik",
    "",
    "STIQR Health",
  ].join("\n");

  return transporter.sendMail({
    from: `"STIQR Health" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Kode Verifikasi OTP - STIQR Health",
    text,
    html,
    attachments: [
      {
        filename: "logo-stiqrhub-health.jpeg",
        path: EMAIL_LOGO_PATH,
        cid: EMAIL_LOGO_CID,
        contentType: "image/jpeg",
        contentDisposition: "inline",
      },
    ],
  });
};

// =====================================================
// SEND FORGOT PASSWORD EMAIL
// =====================================================

export const sendForgotPasswordEmail = async (email, name, resetUrl) => {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(resetUrl);

  const html = emailLayout(
    "Reset Password",
    `
      <p style="margin: 0 0 20px;">
        Hi <strong>${safeName}</strong>,
      </p>

      <p style="margin: 0 0 20px;">
        Kami menerima permintaan untuk mengatur
        ulang password akun STIQR Health kamu.
      </p>

      <p style="margin: 0 0 26px;">
        Silakan klik tombol di bawah ini untuk
        membuat password baru.
      </p>

      <div style="
        text-align: center;
        margin: 32px 0;
      ">
        <a
          href="${safeUrl}"
          style="
            display: inline-block;
            background-color: #032155;
            color: #ffffff;
            text-decoration: none;
            padding: 14px 28px;
            border-radius: 10px;
            font-weight: bold;
            font-size: 15px;
          "
        >
          Reset Password
        </a>
      </div>

      <p style="
        margin: 0 0 24px;
        font-size: 14px;
        color: #6b7280;
      ">
        Link ini hanya berlaku selama
        <strong>15 menit</strong>.
        Jika kamu tidak melakukan permintaan
        reset password, silakan abaikan email ini.
      </p>

      <p style="
        margin: 0 0 10px;
        font-size: 14px;
        color: #6b7280;
      ">
        Jika tombol di atas tidak dapat diklik,
        silakan salin dan buka link berikut:
      </p>

      <p style="
        margin: 0;
        font-size: 14px;
        word-break: break-all;
      ">
        <a
          href="${safeUrl}"
          style="color: #032155;"
        >
          ${safeUrl}
        </a>
      </p>
    `,
  );

  return transporter.sendMail({
    from: `"STIQR Health" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Reset Password - STIQR Health",
    text: [
      `Hi ${name},`,
      "",
      "Kami menerima permintaan untuk mengatur ulang password akun STIQR Health kamu.",
      "",
      "Silakan klik tombol di bawah ini untuk membuat password baru.",
      "",
      resetUrl,
      "",
      "Link ini hanya berlaku selama 15 menit. Jika kamu tidak melakukan permintaan reset password, silakan abaikan email ini.",
      "",
      "Jika tombol di atas tidak dapat diklik, silakan salin dan buka link berikut:",
      "",
      resetUrl,
    ].join("\n"),
    html,
  });
};

// =====================================================
// SEND PAYMENT SUCCESS + HEALTH PASS EMAIL
// =====================================================

export const sendHealthPassEmail = async ({
  email,
  name,
  orderId,
  serviceName,
  providerName,
  bookingAt,
  total,
  healthPassId,
  validUntil,
  qrToken,
}) => {
  if (!email || !qrToken || !healthPassId) {
    throw new Error("Email, Health Pass ID, dan QR token wajib tersedia");
  }

  const dateFormat = (value) => {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "-";
    }

    return new Intl.DateTimeFormat("id-ID", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Asia/Jakarta",
    }).format(date);
  };

  const rupiah = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });

  const customerName = name || "Pengguna";
  const treatmentName = serviceName || "-";
  const clinicName = providerName || "-";

  const safeName = escapeHtml(customerName);
  const safeService = escapeHtml(treatmentName);
  const safeProvider = escapeHtml(clinicName);

  const safeHealthPassId = escapeHtml(String(healthPassId));

  const safeOrderId = escapeHtml(String(orderId ?? "-"));

  const formattedBookingDate = dateFormat(bookingAt);
  const formattedExpiryDate = dateFormat(validUntil);

  const safeBookingDate = escapeHtml(formattedBookingDate);

  const safeExpiryDate = escapeHtml(formattedExpiryDate);

  const safeTotal = rupiah.format(Number(total) || 0);

  const qrBuffer = await QRCode.toBuffer(qrToken, {
    type: "png",
    width: 320,
    margin: 2,
    errorCorrectionLevel: "M",
    color: {
      dark: "#032155",
      light: "#FFFFFF",
    },
  });

  const html = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />

        <title>
          Pembayaran Berhasil - STIQR Health
        </title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background-color: #F4F7FB;
          font-family: Arial, Helvetica, sans-serif;
          color: #172B4D;
        "
      >
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          width="100%"
          style="background-color: #F4F7FB;"
        >
          <tr>
            <td
              align="center"
              style="padding: 32px 16px;"
            >
              <!-- ================================= -->
              <!-- MAIN EMAIL CONTAINER -->
              <!-- ================================= -->

              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                width="100%"
                style="
                  max-width: 600px;
                  background-color: #FFFFFF;
                  border: 1px solid #E2EAF3;
                  border-radius: 16px;
                "
              >
                <tr>
                  <td
                    style="
                      padding: 40px 32px;
                      font-size: 15px;
                      line-height: 1.75;
                      color: #172B4D;
                    "
                  >
                    <!-- ================================= -->
                    <!-- STIQR HEALTH LOGO -->
                    <!-- ================================= -->

                    <div
                      style="
                        margin: 0 0 32px;
                        text-align: left;
                      "
                    >
                      <img
                        src="cid:${EMAIL_LOGO_CID}"
                        alt="STIQR Health"
                        width="115"
                        style="
                          display: block;
                          width: 115px;
                          max-width: 100%;
                          height: auto;
                          border: 0;
                        "
                      />
                    </div>

                    <!-- ================================= -->
                    <!-- GREETING -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 24px;
                        font-size: 16px;
                        color: #172B4D;
                      "
                    >
                      Halo,
                      <strong>${safeName}</strong>.
                    </p>

                    <!-- ================================= -->
                    <!-- PAYMENT SUCCESS -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 22px;
                        font-size: 17px;
                        font-weight: 700;
                        color: #003A7A;
                      "
                    >
                      Pembayaran Health Pass kamu sudah
                      berhasil! 🎉
                    </p>

                    <p
                      style="
                        margin: 0 0 22px;
                        font-size: 15px;
                      "
                    >
                      Health Pass kamu sudah siap digunakan.
                    </p>

                    <p
                      style="
                        margin: 0 0 16px;
                        font-size: 15px;
                      "
                    >
                      Ini detail Health Pass kamu:
                    </p>

                    <!-- ================================= -->
                    <!-- HEALTH PASS DETAILS -->
                    <!-- ================================= -->

                    <table
                      role="presentation"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      width="100%"
                      style="
                        margin: 0 0 28px;
                        background-color: #F5F9FF;
                        border: 1px solid #DCEAFF;
                        border-radius: 12px;
                      "
                    >
                      <tr>
                        <td
                          style="
                            padding: 20px;
                            font-size: 14px;
                            line-height: 1.8;
                            color: #172B4D;
                          "
                        >
                          <!-- TREATMENT -->

                          <p style="margin: 0 0 10px;">
                            <strong>Treatment:</strong>
                            ${safeService}
                          </p>

                          <!-- CLINIC -->

                          <p style="margin: 0 0 10px;">
                            <strong>Klinik:</strong>
                            ${safeProvider}
                          </p>

                          <!-- VALIDITY -->

                          <p style="margin: 0 0 10px;">
                            <strong>Masa Berlaku:</strong>
                            ${safeBookingDate} –
                            ${safeExpiryDate}
                          </p>

                          <!-- HEALTH PASS CODE -->

                          <p style="margin: 0 0 10px;">
                            <strong>Kode Health Pass:</strong>
                            <span
                              style="
                                overflow-wrap: anywhere;
                                color: #003A7A;
                                font-weight: 700;
                              "
                            >
                              ${safeHealthPassId}
                            </span>
                          </p>

                          <!-- ORDER ID -->

                          <p style="margin: 0 0 10px;">
                            <strong>Order ID:</strong>
                            ${safeOrderId}
                          </p>

                          <!-- TOTAL PAYMENT -->

                          <p style="margin: 0;">
                            <strong>Total Pembayaran:</strong>
                            ${safeTotal}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- ================================= -->
                    <!-- HEALTH PASS QR CODE -->
                    <!-- ================================= -->

                    <table
                      role="presentation"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      width="100%"
                      style="
                        margin: 0 0 28px;
                        border: 1px solid #DCEAFF;
                        border-radius: 12px;
                      "
                    >
                      <tr>
                        <td
                          align="center"
                          style="
                            padding: 24px 14px;
                            text-align: center;
                          "
                        >
                          <h2
                            style="
                              margin: 0 0 12px;
                              font-size: 17px;
                              font-weight: 700;
                              color: #003A7A;
                            "
                          >
                            QR Health Pass Kamu
                          </h2>

                          <p
                            style="
                              margin: 0 0 16px;
                              font-size: 13px;
                              line-height: 1.7;
                              color: #526787;
                            "
                          >
                            Tunjukkan QR Code ini kepada
                            staf klinik untuk verifikasi
                            kunjungan.
                          </p>

                          <img
                            src="cid:stiqr-health-pass-qr"
                            alt="QR Code Health Pass"
                            width="240"
                            height="240"
                            style="
                              display: block;
                              width: 240px;
                              max-width: 100%;
                              height: auto;
                              margin: 0 auto 16px;
                              border: 0;
                            "
                          />

                          <p
                            style="
                              margin: 0;
                              font-size: 13px;
                              font-weight: 700;
                              color: #003A7A;
                              overflow-wrap: anywhere;
                            "
                          >
                            ${safeHealthPassId}
                          </p>
                        </td>
                      </tr>
                    </table>

                    <!-- ================================= -->
                    <!-- VISIT INSTRUCTION -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 26px;
                        font-size: 15px;
                        line-height: 1.8;
                      "
                    >
                      Saat datang ke klinik, tunjukkan
                      QR Health Pass kamu untuk di-scan
                      atau berikan kode Health Pass kamu
                      kepada staf untuk proses verifikasi
                      kunjungan.
                    </p>

                    <!-- ================================= -->
                    <!-- CLOSING -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 38px;
                        font-size: 15px;
                      "
                    >
                      Selamat menikmati treatment
                      pilihanmu! 💚
                    </p>

                    <!-- ================================= -->
                    <!-- TAGLINE -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0 0 40px;
                        font-size: 15px;
                        font-style: italic;
                        font-weight: 700;
                        color: #003A7A;
                      "
                    >
                      Sehat Lebih Dekat, Hidup Lebih Baik.
                    </p>

                    <!-- ================================= -->
                    <!-- SIGNATURE -->
                    <!-- ================================= -->

                    <p
                      style="
                        margin: 0;
                        font-size: 17px;
                        font-weight: 700;
                        color: #003A7A;
                      "
                    >
                      STIQR Health
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    "STIQR Health",
    "",
    `Halo, ${customerName}.`,
    "",
    "Pembayaran Health Pass kamu sudah berhasil! 🎉",
    "",
    "Health Pass kamu sudah siap digunakan.",
    "",
    "Ini detail Health Pass kamu:",
    "",
    `- Treatment: ${treatmentName}`,
    `- Klinik: ${clinicName}`,
    `- Masa Berlaku: ${formattedBookingDate} – ${formattedExpiryDate}`,
    `- Kode Health Pass: ${healthPassId}`,
    `- Order ID: ${orderId ?? "-"}`,
    `- Total Pembayaran: ${safeTotal}`,
    "",
    "QR Health Pass terlampir pada email ini.",
    "",
    "Saat datang ke klinik, tunjukkan QR Health Pass kamu untuk di-scan atau berikan kode Health Pass kamu kepada staf untuk proses verifikasi kunjungan.",
    "",
    "Selamat menikmati treatment pilihanmu! 💚",
    "",
    "Sehat Lebih Dekat, Hidup Lebih Baik.",
    "",
    "STIQR Health",
  ].join("\n");

  return transporter.sendMail({
    from: `"STIQR Health" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Pembayaran Berhasil - Health Pass STIQR Health",
    text,
    html,
    attachments: [
      {
        filename: "logo-stiqrhub-health.jpeg",
        path: EMAIL_LOGO_PATH,
        cid: EMAIL_LOGO_CID,
        contentType: "image/jpeg",
        contentDisposition: "inline",
      },

      {
        filename: "STIQR-Health-Pass.png",
        content: qrBuffer,
        contentType: "image/png",
        cid: "stiqr-health-pass-qr",
        contentDisposition: "inline",
      },
    ],
  });
};

// ============================================================
// SEND OTP EMAIL - FINISH TREATMENT
// ============================================================

export async function sendFinishTreatmentOtpEmail({
  email,
  name,
  otp,
  serviceName,
  providerName,
}) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email penerima OTP tidak valid");
  }

  if (typeof otp !== "string" || !/^\d{6}$/.test(otp)) {
    throw new Error("Kode OTP harus terdiri dari 6 digit angka");
  }

  const safeName = escapeHtml(name || "Pasien");
  const safeService = escapeHtml(serviceName || "Layanan kesehatan");
  const safeProvider = escapeHtml(providerName || "Provider");
  const safeOtp = escapeHtml(otp);

  const html = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1.0"
        />
        <title>
          Konfirmasi Penyelesaian Treatment - STIQR Health
        </title>
      </head>

      <body style="
        margin: 0;
        padding: 0;
        background-color: #F4F7FB;
        font-family: Arial, Helvetica, sans-serif;
        color: #172B4D;
      ">
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          width="100%"
          style="background-color: #F4F7FB;"
        >
          <tr>
            <td align="center" style="padding: 32px 16px;">

              <!-- MAIN CONTAINER -->
              <table
                role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                width="100%"
                style="
                  max-width: 600px;
                  background-color: #FFFFFF;
                  border: 1px solid #E2EAF3;
                  border-radius: 16px;
                "
              >
                <tr>
                  <td style="
                    padding: 40px 32px;
                    font-size: 15px;
                    line-height: 1.75;
                    color: #172B4D;
                  ">

                    <!-- LOGO -->
                    <div style="
                      margin: 0 0 32px;
                      text-align: left;
                    ">
                      <img
                        src="cid:${EMAIL_LOGO_CID}"
                        alt="STIQR Health"
                        width="115"
                        style="
                          display: block;
                          width: 115px;
                          max-width: 100%;
                          height: auto;
                          border: 0;
                        "
                      />
                    </div>

                    <!-- GREETING -->
                    <p style="
                      margin: 0 0 24px;
                      font-size: 16px;
                    ">
                      Halo, <strong>${safeName}</strong>.
                    </p>

                    <!-- DESCRIPTION -->
                    <p style="
                      margin: 0 0 20px;
                      font-size: 15px;
                    ">
                      Kami menerima permintaan konfirmasi
                      penyelesaian treatment dari provider
                      layanan kesehatan Anda.
                    </p>

                    <!-- TREATMENT DETAILS -->
                    <div style="
                      margin: 0 0 24px;
                      padding: 18px 20px;
                      background-color: #F8FAFD;
                      border: 1px solid #E2EAF3;
                      border-radius: 12px;
                    ">
                      <p style="
                        margin: 0 0 12px;
                        font-size: 13px;
                        color: #64748B;
                      ">
                        Informasi Treatment
                      </p>

                      <p style="margin: 0 0 8px;">
                        <strong>Provider:</strong>
                        ${safeProvider}
                      </p>

                      <p style="margin: 0;">
                        <strong>Layanan:</strong>
                        ${safeService}
                      </p>
                    </div>

                    <!-- OTP INSTRUCTION -->
                    <p style="
                      margin: 0 0 22px;
                      font-size: 15px;
                    ">
                      Jika treatment Anda
                      <strong>benar-benar telah selesai</strong>,
                      berikan kode berikut kepada petugas
                      yang menangani Anda sebagai konfirmasi
                      penyelesaian layanan.
                    </p>

                    <!-- OTP CODE -->
                    <div style="
                      margin: 0 0 24px;
                      padding: 22px 12px;
                      background-color: #F0F6FF;
                      border: 1px solid #DCEAFF;
                      border-radius: 12px;
                      text-align: center;
                    ">
                      <p style="
                        margin: 0 0 10px;
                        font-size: 13px;
                        color: #64748B;
                      ">
                        Kode Konfirmasi Treatment
                      </p>

                      <span style="
                        display: inline-block;
                        font-size: 32px;
                        font-weight: 600;
                        letter-spacing: 7px;
                        line-height: 1.4;
                        color: #003A7A;
                      ">
                        ${safeOtp}
                      </span>
                    </div>

                    <!-- EXPIRATION -->
                    <p style="
                      margin: 0 0 22px;
                      font-size: 15px;
                    ">
                      Kode ini hanya berlaku selama
                      <strong>5 menit</strong>.
                    </p>

                    <!-- SECURITY WARNING -->
                    <div style="
                      margin: 0 0 25px;
                      padding: 16px 18px;
                      background-color: #FFF8EB;
                      border: 1px solid #FDE5B4;
                      border-radius: 10px;
                    ">
                      <p style="
                        margin: 0;
                        font-size: 14px;
                        line-height: 1.7;
                        color: #92400E;
                      ">
                        <strong>Penting:</strong>
                        Jangan berikan kode OTP apabila
                        treatment belum selesai atau
                        Anda tidak mengenali permintaan ini.
                        Kode ini hanya digunakan untuk
                        konfirmasi penyelesaian treatment,
                        bukan untuk login atau pembayaran.
                      </p>
                    </div>

                    <!-- HELP -->
                    <p style="
                      margin: 0 0 24px;
                      font-size: 15px;
                    ">
                      Jika Anda mengalami kendala atau
                      tidak merasa melakukan treatment
                      tersebut, silakan hubungi dukungan
                      STIQR Health.
                    </p>

                    <!-- AUTOMATED MESSAGE -->
                    <p style="
                      margin: 0 0 38px;
                      font-size: 15px;
                    ">
                      Email ini dibuat secara otomatis.
                      Mohon untuk tidak membalas.
                    </p>

                    <!-- TAGLINE -->
                    <p style="
                      margin: 0 0 40px;
                      font-size: 15px;
                      font-style: italic;
                      font-weight: 700;
                      color: #003A7A;
                    ">
                      Sehat Lebih Dekat, Hidup Lebih Baik
                    </p>

                    <!-- SIGNATURE -->
                    <p style="
                      margin: 0;
                      font-size: 17px;
                      font-weight: 600;
                      color: #003A7A;
                    ">
                      STIQR Health
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    "STIQR Health",
    "",
    `Halo, ${name || "Pasien"}.`,
    "",
    "Kami menerima permintaan konfirmasi penyelesaian treatment.",
    "",
    `Provider: ${providerName || "Provider"}`,
    `Layanan: ${serviceName || "Layanan kesehatan"}`,
    "",
    "Jika treatment benar-benar telah selesai,",
    "berikan kode berikut kepada petugas:",
    "",
    `Kode OTP: ${otp}`,
    "",
    "Kode ini berlaku selama 5 menit.",
    "",
    "PENTING:",
    "Jangan berikan OTP apabila treatment belum selesai",
    "atau Anda tidak mengenali permintaan ini.",
    "",
    "Kode ini bukan untuk login atau pembayaran.",
    "",
    "Email ini dibuat secara otomatis. Mohon tidak membalas.",
    "",
    "Sehat Lebih Dekat, Hidup Lebih Baik",
    "",
    "STIQR Health",
  ].join("\n");

  return transporter.sendMail({
    from: `"STIQR Health" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Kode OTP Konfirmasi Treatment - STIQR Health",
    text,
    html,
    attachments: [
      {
        filename: "logo-stiqrhub-health.jpeg",
        path: EMAIL_LOGO_PATH,
        cid: EMAIL_LOGO_CID,
        contentType: "image/jpeg",
        contentDisposition: "inline",
      },
    ],
  });
}

// ============================================================
// SEND EMAIL - TREATMENT FINISHED
// ============================================================

export async function sendTreatmentFinishedEmail({
  email,
  name,
  healthPassId,
  serviceName,
  providerName,
  treatmentDate,
}) {
  if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Email pasien tidak valid");
  }

  const safeName = escapeHtml(name || "Pengguna");
  const safeService = escapeHtml(serviceName || "Layanan kesehatan");
  const safeProvider = escapeHtml(providerName || "Klinik / Provider");
  const safeHealthPass = escapeHtml(healthPassId || "-");

  const date = treatmentDate ? new Date(treatmentDate) : null;

  const formattedDate =
    date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("id-ID", {
          day: "numeric",
          month: "long",
          year: "numeric",
          timeZone: "Asia/Jakarta",
        }).format(date)
      : "-";

  const safeDate = escapeHtml(formattedDate);

  const html = `
    <!DOCTYPE html>
    <html lang="id">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport"
          content="width=device-width, initial-scale=1.0" />
        <title>Treatment Selesai - STIQR Health</title>
      </head>

      <body style="
        margin:0;
        padding:0;
        background:#F4F7FB;
        font-family:Arial,Helvetica,sans-serif;
        color:#172B4D;
      ">
        <table role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          width="100%">
          <tr>
            <td align="center" style="padding:32px 16px;">

              <table role="presentation"
                cellpadding="0"
                cellspacing="0"
                border="0"
                width="100%"
                style="
                  max-width:600px;
                  background:#FFFFFF;
                  border:1px solid #E2EAF3;
                  border-radius:16px;
                ">
                <tr>
                  <td style="
                    padding:40px 32px;
                    font-size:15px;
                    line-height:1.75;
                  ">

                    <!-- LOGO -->
                    <div style="margin-bottom:32px;">
                      <img
                        src="cid:${EMAIL_LOGO_CID}"
                        alt="STIQR Health"
                        width="115"
                        style="
                          display:block;
                          width:115px;
                          height:auto;
                          border:0;
                        "
                      />
                    </div>

                    <!-- GREETING -->
                    <p style="margin:0 0 24px;">
                      Halo, <strong>${safeName}</strong>.
                    </p>

                    <!-- THANK YOU -->
                    <p style="
                      margin:0 0 24px;
                      font-size:16px;
                      font-style:italic;
                      font-weight:700;
                      color:#003A7A;
                      line-height:1.6;
                    ">
                      Terima kasih sudah menggunakan
                      Health Pass dari STIQR Health
                      untuk menikmati treatment pilihanmu!
                    </p>

                    <p style="margin:0 0 16px;">
                      Ini detail treatment kamu:
                    </p>

                    <!-- TREATMENT DETAILS -->
                    <table role="presentation"
                      cellpadding="0"
                      cellspacing="0"
                      border="0"
                      width="100%"
                      style="
                        margin-bottom:24px;
                        background:#F8FAFD;
                        border:1px solid #E2EAF3;
                        border-radius:12px;
                      ">
                      <tr>
                        <td style="padding:18px 20px;">

                          <p style="margin:0 0 10px;">
                            <strong>Health Pass:</strong>
                            ${safeHealthPass}
                          </p>

                          <p style="margin:0 0 10px;">
                            <strong>Treatment:</strong>
                            ${safeService}
                          </p>

                          <p style="margin:0 0 10px;">
                            <strong>Klinik:</strong>
                            ${safeProvider}
                          </p>

                          <p style="margin:0;">
                            <strong>Tanggal Treatment:</strong>
                            ${safeDate}
                          </p>

                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 22px;">
                      Terima kasih telah mempercayakan
                      kebutuhan treatment kamu kepada
                      STIQR Health.
                    </p>

                    <p style="margin:0 0 30px;">
                      Yuk, nikmati pengalaman treatment
                      lainnya dengan harga terbaik dari
                      STIQR Health!
                    </p>

                    <!-- TAGLINE -->
                    <p style="
                      margin:0 0 38px;
                      font-size:15px;
                      font-style:italic;
                      font-weight:700;
                      color:#003A7A;
                    ">
                      Sehat Lebih Dekat, Hidup Lebih Baik.
                    </p>

                    <!-- SIGNATURE -->
                    <p style="
                      margin:0;
                      font-size:17px;
                      font-weight:700;
                      color:#003A7A;
                    ">
                      STIQR Health
                    </p>

                  </td>
                </tr>
              </table>

            </td>
          </tr>
        </table>
      </body>
    </html>
  `;

  const text = [
    "STIQR Health",
    "",
    `Halo, ${name || "Pengguna"}.`,
    "",
    "Terima kasih sudah menggunakan Health Pass dari STIQR Health untuk menikmati treatment pilihanmu!",
    "",
    "Ini detail treatment kamu:",
    `Health Pass: ${healthPassId || "-"}`,
    `Treatment: ${serviceName || "-"}`,
    `Klinik: ${providerName || "-"}`,
    `Tanggal Treatment: ${formattedDate}`,
    "",
    "Terima kasih telah mempercayakan kebutuhan treatment kamu kepada STIQR Health.",
    "",
    "Yuk, nikmati pengalaman treatment lainnya dengan harga terbaik dari STIQR Health!",
    "",
    "Sehat Lebih Dekat, Hidup Lebih Baik.",
    "",
    "STIQR Health",
  ].join("\n");

  return transporter.sendMail({
    from: `"STIQR Health" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Terima Kasih! Treatment Kamu Telah Selesai - STIQR Health",
    html,
    text,
    attachments: [
      {
        filename: "logo-stiqrhub-health.jpeg",
        path: EMAIL_LOGO_PATH,
        cid: EMAIL_LOGO_CID,
        contentType: "image/jpeg",
        contentDisposition: "inline",
      },
    ],
  });
}

export { transporter };
