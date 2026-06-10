const jwt = require("jsonwebtoken");
const PadimanRouteAdminOtp = require("../../models/padiman_route_models/PadimanRouteAdminOtp");
const PadimanRouteAdmin = require("../../models/padiman_route_models/PadimanRouteAdmin");
const sendPrEmail = require("../../utils/pr/sendEmail");

const AdminController = {
  // 1. Send OTP
  sendOtp: async (req, res) => {
    try {
      const { email } = req.body;
      const otp = Math.floor(100000 + Math.random() * 900000).toString();

      // Upsert OTP
      await PadimanRouteAdminOtp.findOneAndUpdate(
        { email },
        { otp, createdAt: new Date() },
        { upsert: true, new: true }
      );

      // Send email using your custom template function
      await sendPrEmail(
        email,
        "Admin Login Verification",
        `Your OTP for Padiman Route Admin is: ${otp}.`,
        "verification"
      );

      res.status(200).json({ message: "OTP sent to your email." });
    } catch (error) {
      console.error("OTP Send Error:", error);
      res.status(500).json({ error: "Failed to send OTP." });
    }
  },

  // 2. Verify OTP and Generate Token
  verifyOtp: async (req, res) => {
    try {
      const { email, otp } = req.body;

      // 1. Check if OTP is valid
      const record = await PadimanRouteAdminOtp.findOne({ email, otp });

      if (!record) {
        return res.status(401).json({ error: "Invalid or expired OTP." });
      }

      // 2. Find admin or create one if they don't exist
      // Using findOneAndUpdate with upsert: true
      const admin = await PadimanRouteAdmin.findOneAndUpdate(
        { email },
        {
          $setOnInsert: {
            email,
            role: "admin",
            createdAt: new Date(),
          },
        },
        { upsert: true, new: true }
      );

      // 3. Delete OTP after successful verification
      await PadimanRouteAdminOtp.deleteOne({ _id: record._id });

      // 4. Generate JWT
      const token = jwt.sign(
        { id: admin._id, email: admin.email, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: "1h" }
      );

      res.status(200).json({
        token,
        message: admin.wasNew
          ? "Admin account created and login successful."
          : "Login successful.",
      });
    } catch (error) {
      console.error("Verification error:", error);
      res.status(500).json({ error: "Verification failed." });
    }
  },
};
module.exports = AdminController;
