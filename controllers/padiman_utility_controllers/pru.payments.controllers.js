const axios = require("axios");
const Requesting = require("../../models/padiman_utility_models/Requesting");
const PRUtility = require("../../models/padiman_utility_models/PRUtility");
const { sendNotification } = require("../../utils/pru/pru_push");

let PruPayment = require("../../models/padiman_utility_models/PruPayment");
if (PruPayment && PruPayment.PruPayment) {
  PruPayment = PruPayment.PruPayment;
}
if (!PruPayment || typeof PruPayment.findOneAndUpdate !== "function") {
  console.error("❌ PruPayment model failed to load");
}

let Wallet = require("../../models/padiman_utility_models/Wallet");
if (Wallet && Wallet.Wallet) {
  Wallet = Wallet.Wallet;
}

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY ||
  "sk_test_14dce601e7eb9845ed6fcf46fd67e7c27e8070a8";

// =============================================================================
// 1. INITIALIZE PAYSTACK TRANSACTION
// =============================================================================
exports.initializePayment = async (req, res) => {
  console.log("==================================================");
  console.log("🚀 [INITIALIZE_PAYMENT] Request received");

  try {
    const { requestingId, serviceType, email, amount } = req.body;
    const userId =
      (typeof req.user === "object"
        ? req.user?._id || req.user?.id
        : req.user) || req.body.userId;

    console.log(`ℹ️ [USER_ID resolved to]: ${userId}`);

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: "User authentication identifier context missing.",
      });
    }

    if (!requestingId) {
      return res.status(400).json({
        success: false,
        message: "requestingId is required.",
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "email is required.",
      });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "A valid amount is required.",
      });
    }

    const requesting = await Requesting.findById(requestingId);
    if (!requesting) {
      return res.status(404).json({
        success: false,
        message: "Requesting record missing",
      });
    }

    const agreedAmount = Number(amount);
    const resolvedServiceType = requesting.itemType || serviceType || "work";
    const paystackAmount = Math.round(agreedAmount * 100);
    const reference = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const targetUserId = requesting.requested || null;
    const payerUserId = requesting.requester || userId;

    const paystackPayload = {
      email,
      amount: paystackAmount,
      reference,
      metadata: {
        requestingId: String(requestingId),
        serviceType: resolvedServiceType,
        userId: String(payerUserId),
        targetUserId: targetUserId ? String(targetUserId) : null,
      },
    };

    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      paystackPayload,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (response.data.status) {
      await PruPayment.findOneAndUpdate(
        {
          reference,
          user: payerUserId,
          role: "payer",
        },
        {
          reference,
          user: payerUserId,
          role: "payer",
          amount: agreedAmount,
          status: "pending",
          requestingId,
          counterpartUser: targetUserId || null,
          itemType: resolvedServiceType,
          description: `Payment for ${resolvedServiceType}`,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      console.log("✅ [DB_RECORD_SAVED] Payment pending tracking logged.");

      return res.status(200).json({
        success: true,
        checkoutUrl: response.data.data.authorization_url,
        reference,
      });
    }

    return res.status(400).json({
      success: false,
      message: "Paystack initialization rejected",
    });
  } catch (error) {
    console.error(
      "❌ [PAYSTACK_INIT_ERROR]:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// =============================================================================
// 2. VERIFY PAYSTACK TRANSACTION
// Payment lands in ESCROW (earning status: pending).
// Withdrawable only after request is confirmed.
// =============================================================================
exports.verifyPayment = async (req, res) => {
  console.log("==================================================");
  console.log("🔍 [VERIFY_PAYMENT] Route reached");

  try {
    const { reference } = req.params;
    if (!reference || reference === ":reference" || reference === "undefined") {
      return res.status(400).json({
        success: false,
        message: "Valid transaction reference is required.",
      });
    }

    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
      }
    );

    const paystackData = response.data?.data;
    const {
      requestingId,
      userId: metadataUserId,
      targetUserId: metadataTargetUserId,
    } = paystackData.metadata || {};

    if (paystackData.status === "success") {
      const amountCredited = paystackData.amount / 100;
      const timeOfPayment = paystackData.paid_at || new Date().toISOString();

      let requesting = null;
      if (requestingId) {
        requesting = await Requesting.findByIdAndUpdate(
          requestingId,
          { isPaid: true },
          { new: true }
        );
      }

      const targetUserId =
        (requesting?.requested && requesting.requested.toString()) ||
        (metadataTargetUserId && String(metadataTargetUserId)) ||
        null;

      const requesterUserId =
        (requesting?.requester && requesting.requester.toString()) ||
        (metadataUserId && String(metadataUserId)) ||
        null;

      console.log(
        `ℹ️ [PARTIES] payer(requester)=${requesterUserId} | receiver(requested)=${targetUserId}`
      );

      if (!targetUserId) {
        console.warn(
          "⚠️ requested (service provider) missing on Requesting – wallet will not be credited"
        );
      }

      const customerInfo = paystackData.customer || {};
      let payerEmailStr = customerInfo.email || "unknown@paystack.com";
      let payerNameStr = "External Payer";

      if (customerInfo.first_name || customerInfo.last_name) {
        payerNameStr = `${customerInfo.first_name || ""} ${
          customerInfo.last_name || ""
        }`.trim();
      } else if (customerInfo.fullName) {
        payerNameStr = customerInfo.fullName;
      }

      if (requesterUserId) {
        const payerUser = await PRUtility.findById(requesterUserId).select(
          "fullName email"
        );
        if (payerUser?.fullName) payerNameStr = payerUser.fullName;
        if (payerUser?.email) payerEmailStr = payerUser.email;
      } else if (customerInfo.email) {
        const dbUser = await PRUtility.findOne({
          email: customerInfo.email.toLowerCase(),
        }).select("fullName email");
        if (dbUser?.fullName) payerNameStr = dbUser.fullName;
      }

      const resolvedServiceId = requesting?.targetItem || null;
      const resolvedServiceType = requesting?.itemType || "work";
      const itemType = requesting?.itemType || "work";

      // Already confirmed? → release immediately to withdrawable
      const isAlreadyConfirmed =
        requesting?.isConfirmed === true || requesting?.status === "confirmed";

      await PruPayment.deleteMany({
        reference,
        $or: [{ role: { $exists: false } }, { role: null }],
      });

      // ── PruPayments (both parties) ──
      let payerPayment = null;
      if (requesterUserId) {
        payerPayment = await PruPayment.findOneAndUpdate(
          { reference, user: requesterUserId, role: "payer" },
          {
            reference,
            user: requesterUserId,
            role: "payer",
            amount: amountCredited,
            status: "success",
            requestingId: requestingId || null,
            counterpartUser: targetUserId || null,
            itemType,
            description: `Payment for ${itemType}`,
            paystackRawResponse: paystackData,
            paidAt: new Date(timeOfPayment),
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        console.log(`✅ PruPayment (payer) for ${requesterUserId}`);
      } else {
        payerPayment = await PruPayment.findOneAndUpdate(
          { reference, role: "payer" },
          {
            reference,
            role: "payer",
            amount: amountCredited,
            status: "success",
            requestingId: requestingId || null,
            itemType,
            description: `Payment for ${itemType}`,
            paystackRawResponse: paystackData,
            paidAt: new Date(timeOfPayment),
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
      }

      let receiverPayment = null;
      if (targetUserId) {
        receiverPayment = await PruPayment.findOneAndUpdate(
          { reference, user: targetUserId, role: "receiver" },
          {
            reference,
            user: targetUserId,
            role: "receiver",
            amount: amountCredited,
            status: "success",
            requestingId: requestingId || null,
            counterpartUser: requesterUserId || null,
            itemType,
            description: `Received payment for ${itemType}`,
            paystackRawResponse: paystackData,
            paidAt: new Date(timeOfPayment),
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        );
        console.log(`✅ PruPayment (receiver) for ${targetUserId}`);
      }

      const updatedPayment = payerPayment || receiverPayment;

      // ══════════════════════════════════════════════════════
      // ESCROW: earning status "pending" until request confirmed
      // If already confirmed → status "success" + withdrawable
      // ══════════════════════════════════════════════════════
      if (targetUserId) {
        console.log(
          `📡 Wallet escrow sync for service provider: ${targetUserId}`
        );

        let wallet = await Wallet.findOne({ user: targetUserId });
        if (!wallet) {
          console.log(`⚠️ Creating wallet for ${targetUserId}`);
          wallet = new Wallet({
            user: targetUserId,
            balance: 0,
            withdrawableBalance: 0,
            earnings: [],
            withdrawals: [],
          });
        }

        const alreadyCredited = wallet.earnings.some(
          (earning) => earning.reference === reference
        );

        if (!alreadyCredited) {
          const earningStatus = isAlreadyConfirmed ? "success" : "pending";

          console.log(
            `💰 Logging ₦${amountCredited} as ${earningStatus.toUpperCase()} (${
              isAlreadyConfirmed ? "withdrawable" : "ESCROW"
            })...`
          );

          wallet.earnings.push({
            payment: receiverPayment?._id || updatedPayment?._id || null,
            negotiationId: requestingId || null,
            serviceId: resolvedServiceId || null,
            payerName: payerNameStr,
            payerEmail: payerEmailStr,
            amount: amountCredited,
            reference,
            source: resolvedServiceType,
            status: earningStatus, // pending = escrow
            createdAt: new Date(timeOfPayment),
          });

          // Only move into spendable balances when confirmed
          if (isAlreadyConfirmed) {
            wallet.balance = (wallet.balance || 0) + amountCredited;
            wallet.withdrawableBalance =
              (wallet.withdrawableBalance || 0) + amountCredited;
            console.log(
              `✅ Already confirmed — funds RELEASED. Balance: ₦${wallet.balance}, Withdrawable: ₦${wallet.withdrawableBalance}`
            );
          } else {
            console.log(
              `🔒 Funds held in ESCROW (pending). Not added to withdrawableBalance until request is confirmed.`
            );
          }

          await wallet.save();
        } else {
          console.log(
            `⚠️ Reference "${reference}" already in earnings for ${targetUserId}`
          );
        }
      } else {
        console.log(
          "❌ No requested (service provider) on Requesting – wallet credit skipped."
        );
      }

      // ── Notifications ──
      if (targetUserId) {
        try {
          await sendNotification(targetUserId, {
            title: isAlreadyConfirmed
              ? "Payment Received! 💰"
              : "Payment Received — In Escrow 🔒",
            body: isAlreadyConfirmed
              ? `₦${amountCredited} from ${payerNameStr} is now in your withdrawable balance.`
              : `Payment of ₦${amountCredited} from ${payerNameStr} is held in escrow until the request is confirmed.`,
            type: "PAYMENT",
            router: "/(screens)/success",
            data: {
              reference,
              requestingId,
              serviceId: resolvedServiceId
                ? resolvedServiceId.toString()
                : null,
              serviceType: resolvedServiceType,
              payerName: payerNameStr,
              payerEmail: payerEmailStr,
              timeOfPayment,
              amount: amountCredited,
              status: isAlreadyConfirmed ? "success" : "pending",
              role: "receiver",
              escrow: !isAlreadyConfirmed,
            },
          });
        } catch (nErr) {
          console.warn("⚠️ Receiver notification failed:", nErr.message);
        }
      }

      if (requesterUserId && String(requesterUserId) !== String(targetUserId)) {
        try {
          await sendNotification(requesterUserId, {
            title: "Payment Successful! ✅",
            body: `Your payment of ₦${amountCredited} was successful.`,
            type: "PAYMENT",
            router: "/(screens)/success",
            data: {
              reference,
              requestingId,
              amount: amountCredited,
              status: "success",
              role: "payer",
            },
          });
        } catch (nErr) {
          console.warn("⚠️ Payer notification failed:", nErr.message);
        }
      }

      console.log(
        "✅ Payment verified, PruPayments saved, funds in escrow (or released if already confirmed)."
      );

      return res.status(200).json({
        success: true,
        message: isAlreadyConfirmed
          ? "Payment captured and funds released to withdrawable balance."
          : "Payment captured and held in escrow until request is confirmed.",
        data: {
          paystackData,
          payerPayment,
          receiverPayment,
          requesting,
          escrow: !isAlreadyConfirmed,
          parties: {
            payer: requesterUserId,
            receiver: targetUserId,
          },
        },
      });
    }

    // Failed
    await PruPayment.findOneAndUpdate(
      {
        reference,
        role: "payer",
        ...(metadataUserId ? { user: metadataUserId } : {}),
      },
      {
        reference,
        status: "failed",
        role: "payer",
        user: metadataUserId || undefined,
        paystackRawResponse: paystackData,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    if (metadataUserId) {
      try {
        await sendNotification(metadataUserId, {
          title: "Payment Failed",
          body: `Your payment could not be completed. Reason: ${
            paystackData.gateway_response || "Transaction declined"
          }.`,
          type: "PAYMENT",
          router: "/(screens)/payment-failed",
          data: { reference, status: "failed" },
        });
      } catch (nErr) {
        console.warn("⚠️ Failed-payment notification error:", nErr.message);
      }
    }

    return res.status(400).json({
      success: false,
      message: "Transaction check failed.",
      status: paystackData.status,
    });
  } catch (error) {
    console.error(
      "❌ [PAYSTACK_VERIFY_ERROR]:",
      error.response?.data || error.message
    );

    const userIdFromReq = req.body?.userId || req.user?._id || req.user?.id;
    if (userIdFromReq) {
      try {
        await sendNotification(userIdFromReq, {
          title: "Payment Verification Error",
          body: "Something went wrong while verifying your payment. Please contact support.",
          type: "PAYMENT",
          router: "/(screens)/support",
          data: { error: "verify_error" },
        });
      } catch (_) {}
    }

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// =============================================================================
// Helper: release escrow for a Requesting into provider wallet
// =============================================================================
async function releaseEscrowForRequesting(requestingId) {
  const wallet = await Wallet.findOne({
    "earnings.negotiationId": requestingId,
  });

  if (!wallet) {
    return { released: false, reason: "no_wallet_earning" };
  }

  const earningIndex = wallet.earnings.findIndex(
    (e) =>
      e.negotiationId &&
      e.negotiationId.toString() === String(requestingId) &&
      e.status === "pending"
  );

  if (earningIndex === -1) {
    return { released: false, reason: "no_pending_earning" };
  }

  const targetEarning = wallet.earnings[earningIndex];
  targetEarning.status = "success";
  wallet.balance = (wallet.balance || 0) + (targetEarning.amount || 0);
  if (typeof wallet.withdrawableBalance !== "number") {
    wallet.withdrawableBalance = 0;
  }
  wallet.withdrawableBalance += targetEarning.amount || 0;

  await wallet.save();

  try {
    await sendNotification(wallet.user.toString(), {
      title: "Funds Cleared! 💰",
      body: `₦${Number(
        targetEarning.amount
      ).toLocaleString()} has been released from escrow to your withdrawable balance.`,
      type: "PAYMENT",
      router: "/(screens)/withdrawal",
      data: {
        requestingId: String(requestingId),
        amount: targetEarning.amount,
        status: "success",
      },
    });
  } catch (notifErr) {
    console.error("⚠️ Escrow release notification failed:", notifErr.message);
  }

  return {
    released: true,
    amount: targetEarning.amount,
    balance: wallet.balance,
    withdrawableBalance: wallet.withdrawableBalance,
  };
}

// =============================================================================
// 3. RELEASE ESCROW EARNINGS (manual / API)
// =============================================================================
exports.releaseEscrowEarnings = async (req, res) => {
  console.log("==================================================");
  console.log(
    `🚀 [RELEASE_ESCROW_EARNINGS] Requesting ID: ${req.params.requestingId}`
  );

  try {
    const { requestingId } = req.params;

    if (!requestingId) {
      return res.status(400).json({
        success: false,
        message: "Requesting reference identifier parameter missing.",
      });
    }

    const requesting = await Requesting.findById(requestingId);
    if (!requesting) {
      return res.status(404).json({
        success: false,
        message: "Requesting not found.",
      });
    }

    // Only release if confirmed
    const isConfirmed =
      requesting.isConfirmed === true || requesting.status === "confirmed";

    if (!isConfirmed) {
      return res.status(400).json({
        success: false,
        message:
          "Cannot release escrow. Request must be confirmed first (isConfirmed / status confirmed).",
      });
    }

    const result = await releaseEscrowForRequesting(requestingId);

    if (!result.released) {
      if (result.reason === "no_wallet_earning") {
        return res.status(404).json({
          success: false,
          message:
            "No wallet ledger record contains an earnings line matching this requesting identifier.",
        });
      }
      // already released or no pending
      return res.status(200).json({
        success: true,
        message: "No pending escrow to release (already released or missing).",
        data: { requestingId },
      });
    }

    return res.status(200).json({
      success: true,
      message: "Escrow funds released successfully into withdrawable balance.",
      data: {
        requestingId,
        amountReleased: result.amount,
        newSpendableBalance: result.balance,
        newWithdrawableBalance: result.withdrawableBalance,
        requesting,
      },
    });
  } catch (error) {
    console.error("❌ [RELEASE_ESCROW_ERROR]:", error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// export helper for requesting controller
exports.releaseEscrowForRequesting = releaseEscrowForRequesting;
