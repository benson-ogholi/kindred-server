const mongoose = require("mongoose");

const RequestingSchema = new mongoose.Schema(
  {
    // ID of the target work or hire equipment item being requested
    targetItem: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "itemTypeModel", // Dynamic ref based on itemType
    },
    // Type of request: either hiring a work service or renting/hiring equipment
    itemType: {
      type: String,
      required: true,
      enum: ["work", "hireEquipment"],
    },
    // Dynamic model reference helper for Mongoose
    itemTypeModel: {
      type: String,
      required: true,
      enum: ["Work", "HireEquipment"],
    },
    // The user making the request (Requester)
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      required: true,
    },
    // The owner/provider of the work or equipment (Requested)
    requested: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PRUtility",
      required: true,
    },
    // Financial and agreement details
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    isPaid: {
      type: Boolean,
      default: false,
    },
    isAgreed: {
      type: Boolean,
      default: false,
    },
    isOngoing: {
      type: Boolean,
      default: false,
    },
    isDoneOrCompleted: {
      type: Boolean,
      default: false,
    },
    isConfirmed: {
      type: Boolean,
      default: false,
    },
    // General lifecycle status
    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "ongoing",
        "completed",
        "cancelled",
        "confirmed"
      ],
      default: "pending",
      required: true,
      trim: true,
    },
    // Rating and Review fields
    rating: {
      type: Number,
      min: 1,
      max: 5,
    },
    review: {
      type: String,
      trim: true,
    },
    // Optional metadata for extra flexible parameters
    meta: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// Indexes for optimized querying
RequestingSchema.index({ requester: 1 });
RequestingSchema.index({ requested: 1 });
RequestingSchema.index({ targetItem: 1 });
RequestingSchema.index({ status: 1 });

module.exports = mongoose.model("Requesting", RequestingSchema);
