const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kokohorcircle@gmail.com",
    pass: "xrik levq mszq eldc",
  },
});

const getOtpEmailTemplate = (otp, purpose = "verification") => {
  const title =
    purpose === "reset" ? "Reset Your Password" : "Verify Your Account";
  const message =
    purpose === "reset"
      ? "We received a request to reset your password. Use the secure code below to proceed."
      : "Welcome to Padiman Utility! We're excited to have you. Please use the code below to complete your registration.";

  // Green Theme
  const primaryColor = "#10B981"; // Main Green
  const lightGreen = "#ECFDF5"; // Soft light green background
  const accentGreen = "#059669"; // Darker green for text/accents

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background-color: #F8F9FA; font-family: sans-serif; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #F8F9FA; padding-bottom: 40px; }
    .main { background-color: #ffffff; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; border-radius: 20px; overflow: hidden; margin-top: 40px; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
    .header { background-color: ${primaryColor}; padding: 40px; text-align: center; }
    .header h1 { margin: 0; font-size: 32px; font-weight: 800; color: #ffffff; }
    .body-content { padding: 40px 30px; text-align: center; }
    .title { font-size: 22px; font-weight: 700; color: ${primaryColor}; margin-bottom: 12px; }
    .description { font-size: 16px; line-height: 1.6; color: #666; margin-bottom: 30px; }
    .otp-container { background-color: ${lightGreen}; border: 2px dashed ${primaryColor}; border-radius: 12px; padding: 24px; margin: 20px 0; display: inline-block; }
    .otp-code { font-family: monospace; font-size: 40px; font-weight: 800; letter-spacing: 8px; color: ${accentGreen}; margin: 0; }
    .footer { text-align: center; padding: 30px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main">
      <tr><td class="header"><h1>Padiman Utility</h1></td></tr>
      <tr>
        <td class="body-content">
          <div class="title">${title}</div>
          <p class="description">${message}</p>
          <div class="otp-container"><p class="otp-code">${otp}</p></div>
          <p>This code expires in <b>10 minutes</b></p>
        </td>
      </tr>
      <tr><td class="footer">&copy; 2026 Padiman Utility. All rights reserved.</td></tr>
    </table>
  </div>
</body>
</html>`;
};

const sendPruEmail = async (options) => {
  const {
    to,
    subject,
    html: providedHtml,
    text: providedText,
    purpose = "verification",
  } = options;

  if (!to || !subject) {
    throw new Error("Missing 'to' or 'subject' in email options");
  }

  let otp = null;
  const otpRegex = /(\d{6})/;

  if (providedHtml) {
    const match = providedHtml.match(otpRegex);
    if (match) otp = match[1];
  } else if (providedText) {
    const match = providedText.match(otpRegex);
    if (match) otp = match[1];
  }

  const html = otp
    ? getOtpEmailTemplate(otp, purpose)
    : providedHtml ||
      `<div style="font-family:sans-serif; padding:20px; color:#333;">${
        providedText || ""
      }</div>`;

  const mailOptions = {
    from: `"Padiman Utility" <${
      process.env.EMAIL_USER || "kokohorcircle@gmail.com"
    }>`,
    to,
    subject: `🚀 ${subject}`,
    text: providedText || "Your OTP is in the HTML version of this email.",
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log("✉️ Email sent successfully to:", to);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email error:", error.message);
    throw new Error("Email delivery failed");
  }
};

module.exports = sendPruEmail;
