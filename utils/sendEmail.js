// utils/sendEmail.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: 'ikennaibenemee@gmail.com',
    pass: 'xfuq qyry thjq ylaa',
  },
});

// Beautiful HTML template for OTP
const getOtpEmailTemplate = (otp, purpose = "verification") => {
  const title = purpose === "reset" ? "Reset Your Password" : "Verify Your Email";
  const message =
    purpose === "reset"
      ? "We received a request to reset your password. Use the code below to proceed."
      : "Thank you for signing up! Please use the code below to verify your email address.";

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; }
    .container { max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
    .header { background: #EAB308; padding: 30px; text-align: center; }
    .header h1 { color: #000000; margin: 0; font-size: 28px; font-weight: bold; }
    .content { padding: 40px 30px; text-align: center; color: #333333; }
    .content p { font-size: 16px; line-height: 1.6; margin: 0 0 20px; }
    .otp-code { font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #EAB308; background: #f9f9f9; padding: 20px; border-radius: 10px; margin: 30px auto; display: inline-block; border: 2px dashed #EAB308; }
    .footer { background: #f8f8f8; padding: 20px; text-align: center; font-size: 14px; color: #888888; }
    .footer a { color: #EAB308; text-decoration: none; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Kindred</h1>
    </div>
    <div class="content">
      <h2>${title}</h2>
      <p>${message}</p>
      <div class="otp-code">${otp}</div>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p>If you didn't request this, please ignore this email.</p>
    </div>
    <div class="footer">
      <p>&copy; 2025 Kindred. All rights reserved.<br>
      <a href="#">kindred.app</a></p>
    </div>
  </div>
</body>
</html>
  `;
};

const sendEmail = async (to, subject, text, purpose = "verification") => {
  const otpMatch = text.match(/(\d{6})/);
  const otp = otpMatch ? otpMatch[1] : null;

  const html = otp ? getOtpEmailTemplate(otp, purpose) : `<p>${text}</p>`;

  const mailOptions = {
    from: `"Kindred" <${process.env.EMAIL_FROM}>`,
    to,
    subject,
    text, // fallback plain text
    html,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("✉️ Beautiful email sent to:", to);
  } catch (error) {
    console.error("❌ Email send failed:", error.message);
    throw new Error("Failed to send email");
  }
};

module.exports = sendEmail;