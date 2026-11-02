const nodemailer = require("nodemailer");

// Initialize transporter once (Singleton pattern)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.MAIL_USER || process.env.GMAIL_USER || "kokohorcircle@gmail.com",
    pass: process.env.MAIL_PASS || process.env.GMAIL_APP_PASS || "xrik levq mszq eldc",
  },
});

/**
 * Generates clean, responsive HTML template for OTP / Verification / Reset purposes
 */
const getOtpEmailTemplate = (otp, purpose = "verification") => {
  const isReset = purpose === "reset";
  const title = isReset ? "Reset Your Password" : "Verify Your Account";
  const message = isReset
    ? "We received a request to reset your password. Use the secure verification code below to proceed."
    : "Welcome to Kokohor Circle! Please use the verification code below to complete your setup.";

  // Brand Palette (Gold & Deep Dark theme consistent with Kokohor Circle)
  const primaryColor = "#EAB308"; // Kokohor Gold
  const lightBg = "#FFFBEB"; // Soft light gold container background
  const accentColor = "#92400E"; // Darker amber/gold text for OTP

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #0B0A0F; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #FFFFFF; }
    .wrapper { width: 100%; table-layout: fixed; background-color: #0B0A0F; padding-bottom: 40px; }
    .main { background-color: #12101A; margin: 40px auto; width: 100%; max-width: 600px; border-spacing: 0; border-radius: 12px; border: 1px solid #231E36; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5); }
    .header { background: linear-gradient(135deg, #CA8A04, #854D0E); padding: 30px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: 1px; text-transform: uppercase; }
    .body-content { padding: 40px 30px; text-align: center; }
    .title { font-size: 20px; font-weight: 700; color: ${primaryColor}; margin-bottom: 12px; }
    .description { font-size: 15px; line-height: 1.6; color: #A78BFA; margin-bottom: 30px; }
    .otp-container { background-color: ${lightBg}; border: 2px dashed ${primaryColor}; border-radius: 12px; padding: 20px; margin: 20px 0; display: inline-block; }
    .otp-code { font-family: monospace; font-size: 36px; font-weight: 800; letter-spacing: 6px; color: ${accentColor}; margin: 0; }
    .footer { text-align: center; padding: 24px 30px; background-color: #0F0D18; border-top: 1px solid #231E36; font-size: 12px; color: #6B7280; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" align="center" border="0" cellpadding="0" cellspacing="0" width="100%">
      <tr><td class="header"><h1>Kokohor Circle</h1></td></tr>
      <tr>
        <td class="body-content">
          <div class="title">${title}</div>
          <p class="description">${message}</p>
          <div class="otp-container"><p class="otp-code">${otp}</p></div>
          <p style="color: #9CA3AF; font-size: 14px; margin-top: 20px;">This code expires in <b>10 minutes</b>.</p>
        </td>
      </tr>
      <tr>
        <td class="footer">
          This is an automated notification from Kokohor Circle.<br>
          Please do not reply directly to this email.
        </td>
      </tr>
    </table>
  </div>
</body>
</html>`;
};

/**
 * Universal Unified Email Sender
 * Accepts either structured options object: { to, subject, text, html, purpose, template }
 * OR positional arguments (for legacy compatibility): (to, subject, text, purpose/template)
 */
const sendEmail = async (toOrOptions, subjectArg, textArg, purposeArg = "verification") => {
  let to, subject, providedHtml, providedText, purpose;

  if (typeof toOrOptions === "object" && toOrOptions !== null) {
    to = toOrOptions.to;
    subject = toOrOptions.subject;
    providedHtml = toOrOptions.html;
    providedText = toOrOptions.text;
    purpose = toOrOptions.purpose || toOrOptions.template || "verification";
  } else {
    to = toOrOptions;
    subject = subjectArg;
    providedText = textArg;
    purpose = purposeArg;
  }

  if (!to || !subject) {
    throw new Error("Missing 'to' or 'subject' in email parameters");
  }

  // Detect 6-digit OTP code if embedded in text or HTML
  let otp = null;
  const otpRegex = /(\d{6})/;
  if (providedHtml) {
    const match = providedHtml.match(otpRegex);
    if (match) otp = match[1];
  } else if (providedText) {
    const match = providedText.match(otpRegex);
    if (match) otp = match[1];
  }

  // Choose template: use OTP layout if code is detected or purpose is verification/reset, else custom/provided html
  let html;
  if (otp || purpose === "verification" || purpose === "reset") {
    html = getOtpEmailTemplate(otp || "123456", purpose);
  } else {
    html = providedHtml || `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="margin: 0; padding: 0; background-color: #0B0A0F; font-family: sans-serif; color: #FFFFFF;">
        <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 40px auto; background-color: #12101A; border-radius: 12px; border: 1px solid #231E36; overflow: hidden;">
          <tr>
            <td style="padding: 24px; background: linear-gradient(135deg, #CA8A04, #854D0E); text-align: center;">
              <span style="font-size: 20px; font-weight: bold; color: #FFFFFF; letter-spacing: 1px;">KOKOHOR CIRCLE</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px 30px;">
              <h1 style="color: #FFFFFF; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 16px;">${subject}</h1>
              <p style="color: #A78BFA; font-size: 16px; line-height: 1.6; margin: 0;">${providedText || ""}</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 30px; background-color: #0F0D18; border-top: 1px solid #231E36; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #6B7280;">Automated notification from Kokohor Circle.</p>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;
  }

  const mailOptions = {
    from: `"Kokohor Circle" <${process.env.MAIL_USER || process.env.GMAIL_USER || "kokohorcircle@gmail.com"}>`,
    to,
    subject: `✨ ${subject}`,
    text: providedText || "Please view this email in an HTML-compatible email client.",
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent successfully to ${to} [MessageID: ${info.messageId}]`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email delivery failed:", error.message);
    throw new Error(error.message);
  }
};

module.exports = sendEmail;