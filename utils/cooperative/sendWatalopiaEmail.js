const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kokohorcircle@gmail.com",
    pass:  "xrik levq mszq eldc",
  },
});

// =======================
// BLUE THEME
// =======================
const COLORS = {
  primary: "#2563EB",
  light: "#EFF6FF",
  accent: "#1D4ED8",
  text: "#334155",
  muted: "#64748B",
  bg: "#F8FAFC",
  white: "#FFFFFF",
};

// =======================
// BASE LAYOUT
// =======================
const baseLayout = (content) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background-color: ${
      COLORS.bg
    }; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    .wrapper { width: 100%; table-layout: fixed; background-color: ${
      COLORS.bg
    }; padding-bottom: 40px; }
    .main { background-color: ${
      COLORS.white
    }; margin: 0 auto; width: 100%; max-width: 600px; border-spacing: 0; border-radius: 16px; overflow: hidden; margin-top: 40px; box-shadow: 0 10px 25px rgba(37, 99, 235, 0.08); }
    .header { background-color: ${
      COLORS.primary
    }; padding: 36px 40px; text-align: center; }
    .header h1 { margin: 0; font-size: 28px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px; }
    .body-content { padding: 40px 32px; text-align: center; }
    .title { font-size: 22px; font-weight: 700; color: ${
      COLORS.primary
    }; margin: 0 0 12px 0; }
    .description { font-size: 16px; line-height: 1.65; color: ${
      COLORS.muted
    }; margin: 0 0 28px 0; }
    .highlight-box { background-color: ${COLORS.light}; border: 2px dashed ${
  COLORS.primary
}; border-radius: 12px; padding: 22px 28px; margin: 24px 0; display: inline-block; }
    .otp-code { font-family: 'Courier New', monospace; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: ${
      COLORS.accent
    }; margin: 0; }
    .info-box { background-color: ${
      COLORS.light
    }; border-radius: 12px; padding: 20px 24px; text-align: left; margin: 24px 0; }
    .info-row { margin-bottom: 10px; font-size: 15px; }
    .info-label { color: ${
      COLORS.muted
    }; display: inline-block; min-width: 120px; }
    .info-value { color: ${COLORS.text}; font-weight: 600; }
    .footer { text-align: center; padding: 28px 20px; font-size: 12px; color: #94A3B8; }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main" cellpadding="0" cellspacing="0">
      <tr>
        <td class="header">
          <h1>Watalopia</h1>
        </td>
      </tr>
      <tr>
        <td class="body-content">
          ${content}
        </td>
      </tr>
      <tr>
        <td class="footer">
          &copy; ${new Date().getFullYear()} Watalopia. All rights reserved.<br>
          This is an automated message — please do not reply.
        </td>
      </tr>
    </table>
  </div>
</body>
</html>
`;

// =======================
// TEMPLATES
// =======================
const getOtpEmailTemplate = (otp, purpose = "verification") => {
  const isReset = purpose === "reset";
  const title = isReset ? "Reset Your Password" : "Verify Your Account";
  const message = isReset
    ? "We received a request to reset your password. Use the secure code below to continue."
    : "Welcome to Watalopia! Please use the code below to complete your registration.";

  return baseLayout(`
    <div class="title">${title}</div>
    <p class="description">${message}</p>
    <div class="highlight-box">
      <p class="otp-code">${otp}</p>
    </div>
    <p style="color:${COLORS.muted}; font-size:14px; margin-top:8px;">
      This code expires in <strong>10 minutes</strong>.
    </p>
  `);
};

const getAccountCreatedTemplate = (firstName) => {
  return baseLayout(`
    <div class="title">Welcome to Watalopia 🎉</div>
    <p class="description">
      Hi ${
        firstName || "there"
      }, your account has been created successfully.<br>
      We’re excited to have you on board.
    </p>
    <p style="color:${COLORS.muted}; font-size:15px;">
      You can now log in and start exploring cooperative savings, loans, and dividends.
    </p>
  `);
};

const getAdminCreatedAccountTemplate = (
  firstName,
  email,
  temporaryPassword
) => {
  return baseLayout(`
    <div class="title">Your Account Has Been Created</div>
    <p class="description">
      Hello ${
        firstName || "there"
      }, an administrator has created a Watalopia account for you.
    </p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Email:</span>
        <span class="info-value">${email}</span>
      </div>
      ${
        temporaryPassword
          ? `<div class="info-row">
               <span class="info-label">Temporary Password:</span>
               <span class="info-value">${temporaryPassword}</span>
             </div>`
          : ""
      }
    </div>
    <p style="color:${COLORS.muted}; font-size:14px;">
      Please log in and change your password as soon as possible.
    </p>
  `);
};

const getLoginNotificationTemplate = (
  firstName,
  time,
  device = "Unknown device"
) => {
  return baseLayout(`
    <div class="title">New Login Detected</div>
    <p class="description">
      Hi ${
        firstName || "there"
      }, we noticed a new login to your Watalopia account.
    </p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Time:</span>
        <span class="info-value">${time || new Date().toLocaleString()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Device:</span>
        <span class="info-value">${device}</span>
      </div>
    </div>
    <p style="color:${COLORS.muted}; font-size:14px;">
      If this wasn’t you, please reset your password immediately.
    </p>
  `);
};

const getRequestSubmittedTemplate = (firstName, request) => {
  return baseLayout(`
    <div class="title">Request Submitted Successfully</div>
    <p class="description">
      Hi ${
        firstName || "there"
      }, we have received your cooperative request and it is now pending review.
    </p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Title:</span>
        <span class="info-value">${request.title}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Type:</span>
        <span class="info-value">${(request.type || "").toUpperCase()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Transaction:</span>
        <span class="info-value">${request.transactionType}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Amount:</span>
        <span class="info-value">₦${Number(
          request.amount
        ).toLocaleString()}</span>
      </div>
    </div>
    <p style="color:${COLORS.muted}; font-size:14px;">
      You will receive another email once it has been reviewed.
    </p>
  `);
};

const getRequestStatusTemplate = (firstName, request, status) => {
  const isApproved = status === "approved";
  const title = isApproved ? "Request Approved ✅" : "Request Rejected";
  const message = isApproved
    ? "Great news! Your cooperative request has been approved."
    : "Unfortunately, your cooperative request was not approved at this time.";

  return baseLayout(`
    <div class="title">${title}</div>
    <p class="description">Hi ${firstName || "there"}, ${message}</p>
    <div class="info-box">
      <div class="info-row">
        <span class="info-label">Title:</span>
        <span class="info-value">${request.title}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Type:</span>
        <span class="info-value">${(request.type || "").toUpperCase()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Transaction:</span>
        <span class="info-value">${request.transactionType}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Amount:</span>
        <span class="info-value">₦${Number(
          request.amount
        ).toLocaleString()}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Status:</span>
        <span class="info-value" style="color:${
          isApproved ? "#059669" : "#DC2626"
        }">${status.toUpperCase()}</span>
      </div>
    </div>
  `);
};

const getDividendDisbursedTemplate = (firstName, amount, title) => {
  return baseLayout(`
    <div class="title">Dividend Credited 💰</div>
    <p class="description">
      Hi ${firstName || "there"}, a dividend has been disbursed to your account.
    </p>
    <div class="highlight-box">
      <p style="margin:0; font-size:28px; font-weight:800; color:${
        COLORS.accent
      };">
        ₦${Number(amount).toLocaleString()}
      </p>
    </div>
    <p style="color:${COLORS.muted}; font-size:15px; margin-top:16px;">
      ${title || "Dividend payout"}
    </p>
    <p style="color:${COLORS.muted}; font-size:14px;">
      The amount has been credited as a dividend transaction.
    </p>
  `);
};

// =======================
// MAIN SEND FUNCTION
// =======================
const sendWatalopiaEmail = async (options) => {
  const {
    to,
    subject,
    html: providedHtml,
    text: providedText,
    purpose = "verification",
    template,
    data = {},
  } = options;

  if (!to || !subject) {
    throw new Error("Missing 'to' or 'subject' in email options");
  }

  let html = providedHtml;

  // Backward compatible OTP detection
  if (!html && !template) {
    const otpRegex = /(\d{6})/;
    let otp = null;
    if (providedHtml) {
      const match = providedHtml.match(otpRegex);
      if (match) otp = match[1];
    } else if (providedText) {
      const match = providedText.match(otpRegex);
      if (match) otp = match[1];
    }
    if (otp) {
      html = getOtpEmailTemplate(otp, purpose);
    }
  }

  // Explicit template
  if (template) {
    switch (template) {
      case "otp":
        html = getOtpEmailTemplate(data.otp, purpose);
        break;
      case "accountCreated":
        html = getAccountCreatedTemplate(data.firstName);
        break;
      case "adminCreated":
        html = getAdminCreatedAccountTemplate(
          data.firstName,
          data.email,
          data.temporaryPassword
        );
        break;
      case "login":
        html = getLoginNotificationTemplate(
          data.firstName,
          data.time,
          data.device
        );
        break;
      case "requestSubmitted":
        html = getRequestSubmittedTemplate(data.firstName, data.request);
        break;
      case "requestStatus":
        html = getRequestStatusTemplate(
          data.firstName,
          data.request,
          data.status
        );
        break;
      case "dividend":
        html = getDividendDisbursedTemplate(
          data.firstName,
          data.amount,
          data.title
        );
        break;
      default:
        html =
          providedHtml ||
          `<div style="font-family:sans-serif;padding:20px;">${
            providedText || ""
          }</div>`;
    }
  }

  if (!html) {
    html = `<div style="font-family:sans-serif;padding:20px;color:#333;">${
      providedText || ""
    }</div>`;
  }

  const mailOptions = {
    from: `"Watalopia" <${
      process.env.EMAIL_USER || "kokohorcircle@gmail.com"
    }>`,
    to,
    subject: `🚀 ${subject}`,
    text:
      providedText || "Please view this email in an HTML-compatible client.",
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

module.exports = sendWatalopiaEmail;
