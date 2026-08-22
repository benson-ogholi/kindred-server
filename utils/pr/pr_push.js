const { Expo } = require("expo-server-sdk");
const nodemailer = require("nodemailer");

// Models — Safely points to isolated Mongoose model instances
const PadimanRouteNotification = require("../../models/padiman_route_models/Notification");
const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");

const expo = new Expo();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "kokohorcircle@gmail.com",
    // 💡 Tip: Move this app password to process.env.GMAIL_APP_PASS for production security!
    pass: process.env.GMAIL_APP_PASS || "xrik levq mszq eldc",
  },
});

/**
 * Helper: Sends HTML email notification
 */
const sendEmailNotification = async (user, messageData) => {
  try {
    const { title, body } = messageData;

    if (!user.email) return;

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
 * Helper: Dispatches push notification via Expo using user.expoPushToken
 */
const sendPushNotificationToUser = async (
  user,
  messageData,
  savedNotificationId
) => {
  try {
    const { title, body, router, type = "GENERAL", data = {} } = messageData;

    if (user.expoPushToken && Expo.isExpoPushToken(user.expoPushToken)) {
      const messages = [
        {
          to: user.expoPushToken,
          sound: "default",
          title,
          body,
          data: {
            router,
            notificationId: savedNotificationId,
            type,
            ...data,
          },
        },
      ];

      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      console.log(`✅ Push sent to user ${user._id}`);
    } else {
      console.log(
        `⚠️ User ${user._id} has no valid expoPushToken. Skipping push.`
      );
    }
  } catch (err) {
    console.error("❌ Push Error:", err);
  }
};

/**
 * Primary Notification Dispatcher
 * Saves to DB and fires Push & Email concurrently.
 */
const sendNotification = async (userId, messageData) => {
  try {
    const { title, body, router, type = "GENERAL", data = {} } = messageData;

    const user = await Padiman_Route_User.findById(userId);
    if (!user) {
      console.log(`User ${userId} not found for notification routing.`);
      return;
    }

    // 1. Save notification record in database
    const savedNotification = await PadimanRouteNotification.create({
      user: userId,
      title,
      body,
      type,
      data: { ...data, router },
      sentViaPush: !!user.expoPushToken,
    });

    // 2. Dispatch Push and Email in parallel
    await Promise.allSettled([
      sendPushNotificationToUser(
        user,
        messageData,
        savedNotification._id.toString()
      ),
      sendEmailNotification(user, messageData),
    ]);

    console.log(`✅ Notification processing complete for user ${userId}`);
  } catch (err) {
    console.error("❌ sendNotification Error:", err.message);
  }
};

// Only export sendNotification
module.exports = {
  sendNotification,
};
