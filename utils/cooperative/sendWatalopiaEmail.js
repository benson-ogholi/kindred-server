const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kokohorcircle@gmail.com",
    pass: "xrik levq mszq eldc",
  },
});

// =======================
// MODERN FINTECH THEME
// =======================
const COLORS = {
  primary: "#1d4ed8", // Deep royal blue
  primaryLight: "#dbeafe", // Soft blue tint
  accent: "#2563eb", // Vibrant blue
  successBg: "#ecfdf5", // Soft emerald background
  successText: "#047857", // Emerald text
  errorBg: "#fef2f2", // Soft red background
  errorText: "#b91c1c", // Red text
  textMain: "#0f172a", // Slate 900 (High contrast)
  textMuted: "#475569", // Slate 600
  bgWrapper: "#f1f5f9", // Slate 100
  cardBg: "#ffffff",
  border: "#e2e8f0",
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
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Watolopia</title>
  <style>
    /* Reset & Client-Specific Defaults */
    body {
      margin: 0;
      padding: 0;
      background-color: ${COLORS.bgWrapper};
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    table {
      border-collapse: collapse;
      mso-table-lspace: 0pt;
      mso-table-rspace: 0pt;
    }
    
    /* Structural Layout */
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: ${COLORS.bgWrapper};
      padding: 40px 0;
    }
    .main-container {
      background-color: ${COLORS.cardBg};
      margin: 0 auto;
      width: 100%;
      max-width: 580px;
      border-radius: 20px;
      overflow: hidden;
      border: 1px solid ${COLORS.border};
      box-shadow: 0 10px 30px -5px rgba(15, 23, 42, 0.05);
    }
    
    /* Header Styles */
    .header {
      background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
      padding: 36px 30px;
      text-align: center;
    }
    .brand-logo {
      display: inline-block;
      background: rgba(255, 255, 255, 0.15);
      color: #ffffff;
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.5px;
      padding: 8px 18px;
      border-radius: 30px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .header h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.3px;
    }

    /* Body Content */
    .body-content {
      padding: 40px 36px;
      text-align: left;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      color: ${COLORS.textMain};
      margin: 0 0 12px 0;
      letter-spacing: -0.3px;
    }
    .description {
      font-size: 15px;
      line-height: 1.6;
      color: ${COLORS.textMuted};
      margin: 0 0 24px 0;
    }

    /* Highlight & OTP Box */
    .highlight-box {
      background-color: ${COLORS.primaryLight};
      border: 1px dashed ${COLORS.primary};
      border-radius: 14px;
      padding: 24px;
      margin: 24px 0;
      text-align: center;
    }
    .otp-code {
      font-family: 'Courier New', Courier, monospace;
      font-size: 38px;
      font-weight: 800;
      letter-spacing: 12px;
      color: ${COLORS.primary};
      margin: 0;
      text-indent: 12px; /* Centers tracking spacing visually */
    }

    /* Info Table/Card Grid */
    .info-box {
      background-color: #f8fafc;
      border: 1px solid ${COLORS.border};
      border-radius: 14px;
      padding: 20px;
      margin: 24px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #edf2f7;
      font-size: 14px;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: ${COLORS.textMuted};
    }
    .info-value {
      color: ${COLORS.textMain};
      font-weight: 600;
    }

    /* Status Badges */
    .badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .badge-success { background-color: ${COLORS.successBg}; color: ${
  COLORS.successText
}; }
    .badge-error { background-color: ${COLORS.errorBg}; color: ${
  COLORS.errorText
}; }

    /* Footer */
    .footer {
      text-align: center;
      padding: 24px;
      font-size: 12px;
      color: #94a3b8;
      background-color: #f8fafc;
      border-top: 1px solid ${COLORS.border};
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <table class="main-container" cellpadding="0" cellspacing="0" align="center">
      <tr>
        <td class="header">
          <div class="brand-logo">Watolopia</div>
          <h1>Cooperative Savings & Loans</h1>
        </td>
      </tr>
      <tr>
        <td class="body-content">
          ${content}
        </td>
      </tr>
      <tr>
        <td class="footer">
          &copy; ${new Date().getFullYear()} Watolopia. All rights reserved.<br>
          This is an automated notification—please do not reply directly to this email.
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
    ? "We received a request to reset your password. Use the secure authorization code below to proceed safely."
    : "Welcome to Watolopia! Please use the verification code below to complete your secure onboarding.";

  return baseLayout(`
    <div class="title">${title}</div>
    <p class="description">${message}</p>
    <div class="highlight-box">
      <p class="otp-code">${otp}</p>
    </div>
    <p style="color:${COLORS.textMuted}; font-size:13px; text-align: center; margin-top: 12px;">
      This verification code expires in <strong>10 minutes</strong>. Never share this code with anyone.
    </p>
  `);
};

const getAccountCreatedTemplate = (firstName) => {
  return baseLayout(`
    <div class="title">Welcome aboard, ${firstName || "there"}! 🎉</div>
    <p class="description">
      Your account has been successfully created. We are thrilled to welcome you to a smarter way to manage your cooperative savings, build assets, and unlock dividends.
    </p>
    <div class="info-box">
      <p style="margin:0; font-size:14px; color:${
        COLORS.textMain
      }; font-weight:500;">
        ✨ <strong>Next Steps:</strong> Log into your dashboard to complete your profile setup and start exploring automated savings plans.
      </p>
    </div>
  `);
};

const getAdminCreatedAccountTemplate = (
  firstName,
  email,
  temporaryPassword
) => {
  return baseLayout(`
    <div class="title">Your Account Has Been Set Up</div>
    <p class="description">
      Hello ${
        firstName || "there"
      }, an administrator has provisioned a new Watolopia account for your profile.
    </p>
    <div class="info-box">
      <div style="margin-bottom: 8px;"><span style="color:${
        COLORS.textMuted
      };">Email:</span> <strong style="color:${
    COLORS.textMain
  };">${email}</strong></div>
      ${
        temporaryPassword
          ? `<div><span style="color:${COLORS.textMuted};">Temporary Password:</span> <strong style="color:${COLORS.textMain};">${temporaryPassword}</strong></div>`
          : ""
      }
    </div>
    <p style="color:${COLORS.textMuted}; font-size:13px;">
      For security reasons, please log in immediately and update your password.
    </p>
  `);
};

const getLoginNotificationTemplate = (
  firstName,
  time,
  device = "Unknown device"
) => {
  return baseLayout(`
    <div class="title">New Sign-in Alert 🛡️</div>
    <p class="description">
      Hi ${
        firstName || "there"
      }, we noticed a new sign-in to your Watolopia account.
    </p>
    <div class="info-box">
      <div style="margin-bottom: 8px;"><span style="color:${
        COLORS.textMuted
      };">Time:</span> <strong style="color:${COLORS.textMain};">${
    time || new Date().toLocaleString()
  }</strong></div>
      <div><span style="color:${
        COLORS.textMuted
      };">Device / Browser:</span> <strong style="color:${
    COLORS.textMain
  };">${device}</strong></div>
    </div>
    <p style="color:${COLORS.textMuted}; font-size:13px;">
      If this was you, you can safely ignore this message. If you didn’t authorize this, please secure your account immediately.
    </p>
  `);
};

const getRequestSubmittedTemplate = (firstName, request) => {
  return baseLayout(`
    <div class="title">Request Received Successfully 📝</div>
    <p class="description">
      Hi ${
        firstName || "there"
      }, we have successfully received your cooperative request. It is now queued for review by our administrative team.
    </p>
    <div class="info-box">
      <div style="margin-bottom: 6px;"><span style="color:${
        COLORS.textMuted
      };">Title:</span> <strong style="color:${COLORS.textMain};">${
    request.title
  }</strong></div>
      <div style="margin-bottom: 6px;"><span style="color:${
        COLORS.textMuted
      };">Type:</span> <strong style="color:${COLORS.textMain};">${(
    request.type || ""
  ).toUpperCase()}</strong></div>
      <div style="margin-bottom: 6px;"><span style="color:${
        COLORS.textMuted
      };">Transaction:</span> <strong style="color:${COLORS.textMain};">${
    request.transactionType
  }</strong></div>
      <div><span style="color:${
        COLORS.textMuted
      };">Amount:</span> <strong style="color:${COLORS.textMain};">₦${Number(
    request.amount
  ).toLocaleString()}</strong></div>
    </div>
    <p style="color:${COLORS.textMuted}; font-size:13px;">
      You will receive a follow-up notification as soon as your request is processed.
    </p>
  `);
};

const getRequestStatusTemplate = (firstName, request, status) => {
  const isApproved = status === "approved";
  const badgeClass = isApproved ? "badge-success" : "badge-error";
  const title = isApproved ? "Request Approved 🎉" : "Request Update";
  const message = isApproved
    ? "Great news! Your cooperative request has been carefully reviewed and officially approved."
    : "Unfortunately, your cooperative request could not be approved at this time.";

  return baseLayout(`
    <div class="title">${title}</div>
    <p class="description">Hi ${firstName || "there"}, ${message}</p>
    <div class="info-box">
      <div style="margin-bottom: 6px;"><span style="color:${
        COLORS.textMuted
      };">Title:</span> <strong style="color:${COLORS.textMain};">${
    request.title
  }</strong></div>
      <div style="margin-bottom: 6px;"><span style="color:${
        COLORS.textMuted
      };">Type:</span> <strong style="color:${COLORS.textMain};">${(
    request.type || ""
  ).toUpperCase()}</strong></div>
      <div style="margin-bottom: 6px;"><span style="color:${
        COLORS.textMuted
      };">Transaction:</span> <strong style="color:${COLORS.textMain};">${
    request.transactionType
  }</strong></div>
      <div style="margin-bottom: 6px;"><span style="color:${
        COLORS.textMuted
      };">Amount:</span> <strong style="color:${COLORS.textMain};">₦${Number(
    request.amount
  ).toLocaleString()}</strong></div>
      <div><span style="color:${
        COLORS.textMuted
      };">Status:</span> <span class="badge ${badgeClass}">${status}</span></div>
    </div>
  `);
};

const getDividendDisbursedTemplate = (firstName, amount, title) => {
  return baseLayout(`
    <div class="title">Dividend Credited 💸</div>
    <p class="description">
      Hi ${
        firstName || "there"
      }, earnings have been calculated and your dividend payout has been successfully credited to your account!
    </p>
    <div class="highlight-box">
      <p style="margin:0; font-size:32px; font-weight:800; color:${
        COLORS.primary
      };">
        ₦${Number(amount).toLocaleString()}
      </p>
      <p style="margin:6px 0 0 0; font-size:14px; color:${
        COLORS.textMuted
      }; font-weight:500;">
        ${title || "Dividend Payout"}
      </p>
    </div>
    <p style="color:${COLORS.textMuted}; font-size:13px; text-align: center;">
      Thank you for being an active contributor to the Watolopia cooperative ecosystem.
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

  // Explicit template parsing
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
          `<div style="padding:20px;">${providedText || ""}</div>`;
    }
  }

  if (!html) {
    html = `<div style="padding:20px;color:#0f172a;">${
      providedText || ""
    }</div>`;
  }

  const mailOptions = {
    from: `"Watolopia" <${
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
