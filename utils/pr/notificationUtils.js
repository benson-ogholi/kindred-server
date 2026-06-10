// // utils/notificationUtils.js
// const { Expo } = require("expo-server-sdk");
// const nodemailer = require("nodemailer");
// const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");
// const Notification = require("../../models/padiman_route_models/Notification");

// // Initialize Expo SDK
// let expo = new Expo({
//   // accessToken: process.env.EXPO_ACCESS_TOKEN // Optional for high volume
// });

// // Nodemailer Transporter
// const transporter = nodemailer.createTransporter({
//   service: "gmail",
//   auth: {
//     user: process.env.EMAIL_USER,
//     pass: process.env.EMAIL_PASS, // Use App Password for Gmail
//   },
// });

// /**
//  * Send Email Notification
//  */
// const sendEmailNotification = async (user, messageData) => {
//   try {
//     const { title, body } = messageData;

//     const mailOptions = {
//       from: `"Padiman Route" <${process.env.EMAIL_USER}>`,
//       to: user.email,
//       subject: title,
//       html: `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
//           <h2 style="color: #1e3a8a;">${title}</h2>
//           <p style="font-size: 16px; line-height: 1.6;">${body}</p>
//           <hr style="margin: 20px 0;">
//           <p style="color: #666; font-size: 14px;">
//             This is an automated notification from Padiman Route.<br>
//             Do not reply to this email.
//           </p>
//         </div>
//       `,
//     };

//     await transporter.sendMail(mailOptions);
//     console.log(`📧 Email sent to ${user.email}`);
//   } catch (err) {
//     console.error("❌ Email sending failed:", err.message);
//   }
// };

// /**
//  * Send Push Notification + Save to Database
//  */
// const sendPushNotificationToUser = async (userId, messageData) => {
//   try {
//     if (!userId) throw new Error("User ID is required");

//     const { title, body, router, type = "GENERAL", data = {} } = messageData;

//     // Find user
//     const user = await Padiman_Route_User.findById(userId);
//     if (!user) {
//       console.log(`User ${userId} not found`);
//       return;
//     }

//     // Save notification to database
//     const savedNotification = await Notification.create({
//       user: userId,
//       title,
//       body,
//       type,
//       data: { ...data, router },
//       sentViaPush: true,
//     });

//     // Send Push Notification if tokens exist
//     if (user.exponentPushTokens && user.exponentPushTokens.length > 0) {
//       const messages = user.exponentPushTokens
//         .filter(Expo.isExpoPushToken)
//         .map((token) => ({
//           to: token,
//           sound: "default",
//           title,
//           body,
//           data: {
//             router,
//             notificationId: savedNotification._id.toString(),
//             type,
//             ...data,
//           },
//         }));

//       if (messages.length > 0) {
//         const chunks = expo.chunkPushNotifications(messages);

//         for (const chunk of chunks) {
//           try {
//             const tickets = await expo.sendPushNotificationsAsync(chunk);
//             console.log(`✅ Push notification sent to user ${userId}`);
//           } catch (err) {
//             console.error("Error sending push chunk:", err);
//           }
//         }
//       }
//     } else {
//       console.log(`⚠️ User ${userId} has no Expo push tokens`);
//     }
//   } catch (err) {
//     console.error("Error in sendPushNotificationToUser:", err.message);
//   }
// };

// /**
//  * Main Function - Send BOTH Push + Email
//  */
// const sendNotification = async (userId, messageData) => {
//   try {
//     if (!userId) throw new Error("User ID is required");

//     const user = await Padiman_Route_User.findById(userId);
//     if (!user) {
//       console.log(`User ${userId} not found`);
//       return;
//     }

//     // Send Push and Email in parallel
//     await Promise.allSettled([
//       sendPushNotificationToUser(userId, messageData),
//       sendEmailNotification(user, messageData),
//     ]);

//     console.log(
//       `✅ Full notification (Push + Email) processed for user ${userId}`
//     );
//   } catch (err) {
//     console.error("Error in sendNotification:", err.message);
//   }
// };

// module.exports = {
//   sendPushNotificationToUser,
//   sendNotification,
//   sendEmailNotification,
// };
