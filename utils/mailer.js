import nodemailer from "nodemailer";

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

export { transporter };
