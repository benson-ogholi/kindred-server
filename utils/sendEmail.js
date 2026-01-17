const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "ikennaibenemee@gmail.com",
    pass: "xfuq qyry thjq ylaa",
  },
});

/**
 * Modern, Responsive OTP Template
 */
const getOtpEmailTemplate = (otp, purpose = "verification") => {
  const title =
    purpose === "reset" ? "Reset Your Password" : "Confirm Your Email";
  const message =
    purpose === "reset"
      ? "We received a request to reset your password. Use the secure code below to proceed."
      : "Welcome to Kindred! Please use the verification code below to complete your sign-up.";

  const brandColor = "#EAB308"; // Kindred Gold

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background-color: #F8FAFC; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #F8FAFC; padding-bottom: 40px; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; color: #1E293B; border-radius: 16px; overflow: hidden; margin-top: 40px; }
    .header { background-color: ${brandColor}; padding: 40px; text-align: center; }
    .header h1 { margin: 0; font-size: 32px; font-weight: 800; color: #000000; letter-spacing: -1px; }
    .body-content { padding: 40px 30px; text-align: center; }
    .title { font-size: 22px; font-weight: 700; color: #111827; margin-bottom: 12px; }
    .description { font-size: 16px; line-height: 1.6; color: #64748B; margin-bottom: 30px; }
    .otp-container { background-color: #FFFBEB; border: 2px solid #FEF3C7; border-radius: 12px; padding: 24px; margin: 20px 0; display: inline-block; min-width: 200px; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #B45309; margin: 0; }
    .expiry { font-size: 13px; color: #94A3B8; margin-top: 20px; }
    .footer { text-align: center; padding: 30px; font-size: 12px; color: #94A3B8; line-height: 1.5; }
    .footer a { color: ${brandColor}; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main">
      <tr>
        <td class="header">
          <h1>Kindred</h1>
        </td>
      </tr>
      <tr>
        <td class="body-content">
          <div class="title">${title}</div>
          <p class="description">${message}</p>
          <div class="otp-container">
            <p class="otp-code">${otp}</p>
          </div>
          <p class="description" style="margin-top: 30px; font-size: 14px;">
            If you didn't request this, you can safely ignore this email.
          </p>
          <div class="expiry">This code expires in <b>10 minutes</b></div>
        </td>
      </tr>
      <tr>
        <td class="footer">
          <p>&copy; 2026 Kindred Inc. <br> Built for families, by families.</p>
          <p><a href="https://kindred.app">Visit our website</a> | <a href="#">Support</a></p>
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
  `;
};

/**
 * Main send function
 */
const sendEmail = async (to, subject, text, purpose = "verification") => {
  // Extract 6-digit OTP if it exists in the text
  const otpMatch = text.match(/(\d{6})/);
  const otp = otpMatch ? otpMatch[1] : null;

  // Use professional HTML if it's an OTP, otherwise wrap text in a clean container
  const html = otp
    ? getOtpEmailTemplate(otp, purpose)
    : `<div style="font-family:sans-serif; padding:20px; color:#333; line-height:1.6;">${text}</div>`;

  const mailOptions = {
    from: `"Kindred" <${process.env.MAIL_USER}>`,
    to,
    subject: `✨ ${subject}`,
    text, // Fallback for Apple Watch/very old clients
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✉️ Premium email sent to:", to, "ID:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email error:", error.message);
    throw new Error("Email delivery failed");
  }
};

module.exports = sendEmail;
