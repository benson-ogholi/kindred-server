const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PadimanRouteUser",
      required: true,
    },
    negotiation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Negotiation",
    },
    // Request Type
    type: {
      type: String,
      enum: ["join-ride", "offer-ride", "send-package", "deliver-package"],
      required: true,
    },

    // Locations
    pickupLocation: {
      address: { type: String, required: true },
    },

    deliveryLocation: {
      address: { type: String, required: true },
    },

    // Timing
    pickupDate: {
      type: Date,
      required: true,
    },
    pickupTime: {
      type: String,
      required: true,
    },

    // === NEW FIELDS ===
    agreedPrice: {
      type: Number,
      default: 0,
    },

    isPaid: {
      type: Boolean,
      default: false,
    },
    finalPrice: {
      type: Number,
      default: 0,
    },
    currentLocation: {
      type: String,
    },
    // Rating System
    isRated: {
      type: Boolean,
      default: false,
    },
    rating: {
      score: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: String,
      ratedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "PadimanRouteUser",
      },
      ratedAt: Date,
    },

    // Status
    status: {
      type: String,
      enum: [
        "pending",
        "assigned",
        "in_progress",
        "completed",
        "cancelled",
        "expired",
        "confirmed"
      ],
      default: "pending",
    },
    handOverProof: {
      type: String,
    },

    inRideWith: {
      type: String,
    },
    assignedTo: {
      type: String,
    },

    // Flexible metadata — shape depends on `type`, see pr.request.controller.js
    // for what each type expects inside here (buildMetaForType).
    meta: {
      type: Object,
      default: {},
    },

    // Service Providers
    serviceProviders: [
      {
        providerId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "PadimanRouteUser",
        },
        requestId: {
          type: String,
        },
        bidAmount: Number,
        proposedTime: String,
        status: {
          type: String,
          enum: ["pending", "accepted", "rejected"],
          default: "pending",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Geospatial indexes
requestSchema.index({ "pickupLocation.coordinates": "2dsphere" });
requestSchema.index({ "deliveryLocation.coordinates": "2dsphere" });

module.exports = mongoose.model("Request", requestSchema);
