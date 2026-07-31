const { Expo } = require("expo-server-sdk");
const nodemailer = require("nodemailer");

// Models — Safely points to isolated Mongoose model instances
const PRUNOTIFY = require("../../models/padiman_utility_models/PRUNotify");
const PRUtility = require("../../models/padiman_utility_models/PRUNotify");

const expo = new Expo();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kokohorcircle@gmail.com",
    // 💡 Tip: Move this app password to an environment variable (.env) for production security!
    pass: "xrik levq mszq eldc",
  },
});

/**
 * Sends a stylized purple & dark themed HTML email notification
 */
const sendEmailNotification = async (user, messageData) => {
  try {
    const { title, body } = messageData;

    await transporter.sendMail({
      from: `"Padiman Route" <kokohorcircle@gmail.com>`,
      to: user.email,
      subject: title,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${title}</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #0B0A0F; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #FFFFFF;">
          <table align="center" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 40px auto; background-color: #12101A; border-radius: 12px; border: 1px solid #231E36; overflow: hidden; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);">
            
            <tr>
              <td style="padding: 24px; background: linear-gradient(135deg, #6D28D9, #4C1D95); text-align: center;">
                <span style="font-size: 20px; font-weight: bold; color: #FFFFFF; letter-spacing: 1px;">PADIMAN ROUTE</span>
              </td>
            </tr>

            <tr>
              <td style="padding: 40px 30px;">
                <h1 style="color: #FFFFFF; font-size: 22px; font-weight: 700; margin-top: 0; margin-bottom: 16px; line-height: 1.3;">
                  ${title}
                </h1>
                <p style="color: #A78BFA; font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
                  ${body}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding: 24px 30px; background-color: #0F0D18; border-top: 1px solid #231E36; text-align: center;">
                <p style="margin: 0; font-size: 12px; color: #6B7280; line-height: 1.5;">
                  This is an automated notification from Padiman Route.<br>
                  Please do not reply directly to this email.
                </p>
              </td>
            </tr>

          </table>
        </body>
        </html>
      `,
    });
    console.log(`📧 Email sent to ${user.email}`);
  } catch (err) {
    console.error("❌ Email failed:", err.message);
  }
};

/**
 * Dispatches push notifications to Expo client tokens
 */
const sendPushNotificationToUser = async (userOrId, messageData) => {
  try {
    const { title, body, router, type = "GENERAL", data = {} } = messageData;

    // Support receiving either a full User object or just a userId string
    let user = typeof userOrId === "object" ? userOrId : null;
    const userId = user ? user._id : userOrId;

    if (!user) {
      user = await PRUtility.findById(userId);
      if (!user) {
        console.log(`User ${userId} not found`);
        return;
      }
    }

    // Save notification trail in DB
    const savedNotification = await PRUNOTIFY.create({
      user: userId,
      title,
      body,
      type,
      data: { ...data, router },
      sentViaPush: true,
    });

    if (user.exponentPushTokens?.length > 0) {
      const messages = user.exponentPushTokens
        .filter(Expo.isExpoPushToken)
        .map((token) => ({
          to: token,
          sound: "default",
          title,
          body,
          data: {
            router,
            notificationId: savedNotification._id.toString(),
            type,
            ...data,
          },
        }));

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      console.log(`✅ Push sent to user ${userId}`);
    }
  } catch (err) {
    console.error("❌ Push Error logs:", err);
  }
};

/**
 * Orchestrates sending both Push and Email channels simultaneously
 */
const sendNotification = async (userId, messageData) => {
  try {
    const user = await PRUtility.findById(userId);
    if (!user) {
      console.log(`User ${userId} not found for notification routing.`);
      return;
    }

    // Performance Boost: Pass the pre-fetched user object straight down
    // to stop push notifications from wasting an extra database query.
    await Promise.allSettled([
      sendPushNotificationToUser(user, messageData),
      sendEmailNotification(user, messageData),
    ]);

    console.log(`✅ All notification pipelines processed for user ${userId}`);
  } catch (err) {
    console.error("❌ sendNotification Error:", err.message);
  }
};

module.exports = {
  sendNotification,
  sendPushNotificationToUser,
};
