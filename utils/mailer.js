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

/**
 * Send OTP Email
 */
export const sendOtpEmail = async (email, otp) => {
  await transporter.sendMail({
    from: `"StiQR B2B" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "OTP Verification Code",
    html: `
      <div
        style="
          font-family: Arial, sans-serif;
          background-color: #f4f7fb;
          padding: 30px;
        "
      >
        <div
          style="
            max-width: 600px;
            margin: auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          "
        >
          <div
            style="
              background: linear-gradient(135deg, #091025, #032155);
              padding: 24px;
              text-align: center;
            "
          >
            <h1
              style="
                color: #ffffff;
                margin: 0;
                font-size: 24px;
              "
            >
              OTP Verification
            </h1>
          </div>

          <div
            style="
              padding: 30px;
              color: #1f2937;
            "
          >
            <p
              style="
                font-size: 15px;
                line-height: 1.7;
              "
            >
              Gunakan kode OTP berikut untuk melanjutkan proses verifikasi akun.
            </p>

            <div
              style="
                text-align: center;
                margin: 30px 0;
              "
            >
              <div
                style="
                  display: inline-block;
                  background: #f3f4f6;
                  padding: 20px 30px;
                  border-radius: 10px;
                "
              >
                <span
                  style="
                    font-size: 36px;
                    font-weight: bold;
                    letter-spacing: 8px;
                    color: #032155;
                  "
                >
                  ${otp}
                </span>
              </div>
            </div>

            <p
              style="
                font-size: 14px;
                color: #6b7280;
                line-height: 1.7;
              "
            >
              Kode OTP ini hanya berlaku selama
              <strong>5 menit</strong>.
            </p>

            <p
              style="
                font-size: 14px;
                color: #6b7280;
                line-height: 1.7;
              "
            >
              Jika kamu tidak meminta kode OTP ini, abaikan email ini.
            </p>
          </div>
        </div>
      </div>
    `,
  });
};

/**
 * Send Forgot Password Email
 */
export const sendForgotPasswordEmail = async (email, name, resetUrl) => {
  await transporter.sendMail({
    from: `"StiQR B2B" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Reset Password StiQR",
    html: `
      <div
        style="
          font-family: Arial, sans-serif;
          background-color: #f4f7fb;
          padding: 30px;
        "
      >
        <div
          style="
            max-width: 600px;
            margin: auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          "
        >
          <div
            style="
              background: linear-gradient(135deg, #091025, #032155);
              padding: 24px;
              text-align: center;
            "
          >
            <h1
              style="
                color: #ffffff;
                margin: 0;
                font-size: 24px;
              "
            >
              Reset Password
            </h1>
          </div>

          <div
            style="
              padding: 30px;
              color: #1f2937;
            "
          >
            <p style="font-size: 16px;">
              Hi <strong>${name}</strong>,
            </p>

            <p
              style="
                font-size: 15px;
                line-height: 1.7;
              "
            >
              Kami menerima permintaan untuk mengatur ulang password akun
              StiQR kamu.
            </p>

            <p
              style="
                font-size: 15px;
                line-height: 1.7;
              "
            >
              Silakan klik tombol di bawah ini untuk membuat password baru.
            </p>

            <div
              style="
                text-align: center;
                margin: 32px 0;
              "
            >
              <a
                href="${resetUrl}"
                style="
                  display: inline-block;
                  background: linear-gradient(135deg, #032155, #0ea5e9);
                  color: #ffffff;
                  text-decoration: none;
                  padding: 14px 26px;
                  border-radius: 10px;
                  font-weight: bold;
                "
              >
                Reset Password
              </a>
            </div>

            <p
              style="
                font-size: 14px;
                color: #6b7280;
                line-height: 1.7;
              "
            >
              Link ini hanya berlaku selama
              <strong>15 menit</strong>.
              Jika kamu tidak meminta reset password, abaikan email ini.
            </p>

            <p
              style="
                font-size: 14px;
                color: #6b7280;
                word-break: break-all;
                line-height: 1.7;
              "
            >
              Jika tombol tidak bisa diklik, salin link berikut:
              <br /><br />

              ${resetUrl}
            </p>
          </div>
        </div>
      </div>
    `,
  });
};

export { transporter };
