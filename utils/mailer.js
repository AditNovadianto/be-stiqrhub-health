import nodemailer from "nodemailer";
import QRCode from "qrcode";

const transporter = nodemailer.createTransport({
  host: "mekongga.iixcp.rumahweb.net",
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
        STIQR Hub Health
      </div>
    </div>
  </div>
`;

// =====================================================
// SEND OTP EMAIL
// =====================================================

// Parameter name opsional agar kompatibel dengan
// pemanggilan lama: sendOtpEmail(email, otp).
export const sendOtpEmail = async (email, otp, name = "Pengguna") => {
  const safeName = escapeHtml(name);
  const safeOtp = escapeHtml(otp);

  const html = emailLayout(
    "Verifikasi OTP",
    `
      <p style="margin: 0 0 20px;">
        Hi <strong>${safeName}</strong>,
      </p>

      <p style="margin: 0 0 24px;">
        Gunakan kode OTP berikut untuk melanjutkan
        proses verifikasi akun:
      </p>

      <div style="
        text-align: center;
        margin: 28px 0;
      ">
        <div style="
          display: inline-block;
          background-color: #f3f4f6;
          border-radius: 10px;
          padding: 20px 28px;
        ">
          <span style="
            font-size: 36px;
            font-weight: bold;
            letter-spacing: 8px;
            color: #032155;
          ">
            ${safeOtp}
          </span>
        </div>
      </div>

      <p style="
        margin: 24px 0 0;
        color: #6b7280;
        font-size: 14px;
      ">
        Kode OTP ini hanya berlaku selama
        <strong>15 menit</strong>.
        Jangan berikan kode ini kepada siapa pun
        termasuk pihak yang mengatasnamakan
        STIQR Hub Health.
      </p>
    `,
  );

  return transporter.sendMail({
    from: `"STIQR Hub Health" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Kode Verifikasi OTP - STIQR Hub Health",
    text: [
      `Hi ${name},`,
      "",
      "Gunakan kode OTP berikut untuk melanjutkan proses verifikasi akun:",
      "",
      String(otp),
      "",
      "Kode OTP ini hanya berlaku selama 15 menit.",
      "Jangan berikan kode ini kepada siapa pun termasuk pihak yang mengatasnamakan STIQR Hub Health.",
    ].join("\n"),
    html,
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
        ulang password akun STIQR Hub Health kamu.
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
    from: `"STIQR Hub Health" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Reset Password - STIQR Hub Health",
    text: [
      `Hi ${name},`,
      "",
      "Kami menerima permintaan untuk mengatur ulang password akun STIQR Hub Health kamu.",
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

  const rupiah = new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  });

  const dateFormat = (value) => {
    if (!value) return "-";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "Asia/Jakarta",
    }).format(date);
  };

  // Gunakan QR token resmi dari backend.
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

  const safeName = escapeHtml(name || "Pelanggan");
  const safeService = escapeHtml(serviceName || "-");
  const safeProvider = escapeHtml(providerName || "-");
  const safeOrderId = escapeHtml(orderId);
  const safeHealthPassId = escapeHtml(healthPassId);

  const html = emailLayout(
    "Pembayaran Berhasil",
    `
      <p>Hi <strong>${safeName}</strong>,</p>

      <p>
        Terima kasih! Pembayaran kamu di
        <strong>STIQR Health</strong>
        telah berhasil.
      </p>

      <div style="
        padding: 20px;
        background: #f0f9ff;
        border-radius: 12px;
        margin: 24px 0;
      ">
        <p style="margin: 0 0 8px;">
          <strong>Layanan:</strong> ${safeService}
        </p>

        <p style="margin: 0 0 8px;">
          <strong>Klinik:</strong> ${safeProvider}
        </p>

        <p style="margin: 0 0 8px;">
          <strong>Rencana kunjungan:</strong>
          ${escapeHtml(dateFormat(bookingAt))}
        </p>

        <p style="margin: 0 0 8px;">
          <strong>Order ID:</strong> ${safeOrderId}
        </p>

        <p style="margin: 0;">
          <strong>Total pembayaran:</strong>
          ${rupiah.format(Number(total) || 0)}
        </p>
      </div>

      <div style="
        text-align: center;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 24px 12px;
      ">
        <h2 style="
          margin: 0 0 12px;
          color: #032155;
          font-size: 20px;
        ">
          Health Pass Kamu
        </h2>

        <p style="color: #6b7280;">
          Tunjukkan QR Code berikut kepada
          petugas klinik.
        </p>

        <img
          src="cid:stiqr-health-pass-qr"
          alt="QR Code Health Pass"
          width="240"
          height="240"
          style="display: block; margin: 16px auto;"
        />

        <p style="
          font-size: 14px;
          color: #032155;
          font-weight: bold;
          overflow-wrap: anywhere;
        ">
          ${safeHealthPassId}
        </p>

        <p style="color: #6b7280; font-size: 13px;">
          Berlaku sampai:
          ${escapeHtml(dateFormat(validUntil))}
        </p>
      </div>

      <p style="margin-top: 24px;">
        Kamu juga dapat mengakses Health Pass
        melalui menu <strong>Health Pass</strong>
        di STIQR Health Mini Program.
      </p>

      <p style="color: #6b7280; font-size: 13px;">
        QR Code bersifat pribadi.
        Jangan membagikannya kepada pihak lain.
      </p>
    `,
  );

  return transporter.sendMail({
    from: `"STIQR Hub Health" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Pembayaran Berhasil - Health Pass STIQR Health",
    text: [
      `Hi ${name || "Pelanggan"},`,
      "",
      "Pembayaran STIQR Health kamu berhasil.",
      `Layanan: ${serviceName || "-"}`,
      `Klinik: ${providerName || "-"}`,
      `Order ID: ${orderId}`,
      `Health Pass ID: ${healthPassId}`,
      `Total: ${rupiah.format(Number(total) || 0)}`,
      `Rencana kunjungan: ${dateFormat(bookingAt)}`,
      `Berlaku sampai: ${dateFormat(validUntil)}`,
      "",
      "QR Code Health Pass terlampir pada email ini.",
      "Tunjukkan QR Code kepada petugas klinik.",
    ].join("\n"),
    html,
    attachments: [
      {
        filename: "STIQR-Health-Pass.png",
        content: qrBuffer,
        contentType: "image/png",
        cid: "stiqr-health-pass-qr",
      },
    ],
  });
};

export { transporter };
