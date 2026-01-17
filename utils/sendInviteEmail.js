const nodemailer = require("nodemailer");

// Initialize transporter once (Singleton pattern)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "ikennaibenemee@gmail.com",
    pass: "xfuq qyry thjq ylaa",
  },
});

/**
 * Sends a styled family invitation email
 * @param {Object} options - to, familyName, inviterName, inviteCode
 */
const sendInviteEmail = async ({ to, familyName, inviterName, inviteCode }) => {
  const brandColor = "#EAB308"; // Kindred Gold

  const html = `
  <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #f0f0f0; border-radius: 12px;">
    <div style="text-align: center; margin-bottom: 24px;">
      <h1 style="color: #111827; font-size: 24px; margin-bottom: 8px;">Join the Family</h1>
      <p style="color: #64748B; font-size: 16px;">${inviterName} has invited you to join <strong>${familyName}</strong></p>
    </div>

    <div style="background-color: #FFFBEB; border: 2px dashed ${brandColor}; padding: 20px; border-radius: 16px; text-align: center; margin: 24px 0;">
      <span style="display: block; color: #92400E; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">Your Invite Code</span>
      <span style="font-family: monospace; font-size: 32px; font-weight: bold; color: #111827; letter-spacing: 4px;">${inviteCode}</span>
    </div>

    <div style="color: #334155; line-height: 1.6; font-size: 14px;">
      <p><strong>How to join:</strong></p>
      <ol style="padding-left: 20px;">
        <li style="margin-bottom: 8px;">Open the <strong>Kindred</strong> app.</li>
        <li style="margin-bottom: 8px;">Go to <strong>Join Family</strong>.</li>
        <li>Paste the code shown above.</li>
      </ol>
    </div>

    <hr style="border: none; border-top: 1px solid #E2E8F0; margin: 32px 0;" />

    <p style="color: #94A3B8; font-size: 12px; text-align: center;">
      If you don't have an account, download Kindred and sign up using this email address.
    </p>
  </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: `"Kindred" <${process.env.MAIL_USER}>`,
      to,
      subject: `👋 ${inviterName} invited you to ${familyName}`,
      html,
    });
    console.log(`✅ Email sent to ${to}: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error("❌ Email failed to send:", error);
    return { success: false, error: error.message };
  }
};

module.exports = sendInviteEmail;
