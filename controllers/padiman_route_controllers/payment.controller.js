// controllers/paymentController.js

const axios = require("axios");
const Negotiation = require("../../models/padiman_route_models/Negotiation");
const Payment = require("../../models/padiman_route_models/Payment");
const { sendNotification } = require("../../utils/pr/pr_push");
const Wallet = require("../../models/padiman_route_models/Wallet");
const Padiman_Route_User = require("../../models/padiman_route_models/Padiman_Route_User");

const PAYSTACK_SECRET_KEY = "sk_test_14dce601e7eb9845ed6fcf46fd67e7c27e8070a8";

// 1. Initialize Paystack Transaction
exports.initializePayment = async (req, res) => {
  console.log("==================================================");
  console.log("🚀 [INITIALIZE_PAYMENT] Request received");

  try {
    const { negotiationId, serviceType, email } = req.body;
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

    const negotiation = await Negotiation.findById(negotiationId);
    if (!negotiation) {
      return res.status(404).json({ message: "Negotiation record missing" });
    }

    const agreedAmount = negotiation.agreedAmount || req.body.amount || 5000;
    const paystackAmount = agreedAmount * 100;
    const reference = `TX-${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    const paystackPayload = {
      email,
      amount: paystackAmount,
      reference,
      metadata: { negotiationId, serviceType, userId },
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
      // const newPayment = await Payment.create({
      //   negotiationId,
      //   userId,
      //   amount: agreedAmount,
      //   reference,
      //   serviceType,
      //   status: "pending",
      // });

      console.log("✅ [DB_RECORD_SAVED] Payment pending tracking logged.");

      return res.status(200).json({
        success: true,
        checkoutUrl: response.data.data.authorization_url,
        reference,
      });
    }

    return res
      .status(400)
      .json({ success: false, message: "Paystack initialization rejected" });
  } catch (error) {
    console.error(
      "❌ [PAYSTACK_INIT_ERROR]:",
      error.response?.data || error.message
    );

    if (req.body.userId || req.user) {
      const userId = req.body.userId || req.user?._id || req.user?.id;
      await sendNotification(userId, {
        title: "Payment Failed to Start",
        body: "We couldn't start your payment. Please try again.",
        type: "PAYMENT",
        router: "/(screens)/negotiation-chat",
        data: { error: "init_failed" },
      });
    }

    return res.status(500).json({ success: false, error: error.message });
  }
};
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
    const { negotiationId } = paystackData.metadata || {};

    if (paystackData.status === "success") {
      // Update Payment Record
      const updatedPayment = await Payment.findOneAndUpdate(
        { reference },
        { status: "success", paystackRawResponse: paystackData },
        { new: true }
      );

      // Update Negotiation Record
      const updatedNegotiation = await Negotiation.findByIdAndUpdate(
        negotiationId,
        { status: "ride agreed", isPaid: true },
        { new: true }
      );

      // TARGET RE-ROUTED: Credit the serviceProvider, not the negotiator/customer
      const targetUserId = updatedNegotiation?.serviceProvider;
      const amountCredited = paystackData.amount / 100; // Paystack converts Naira to Kobo values

      // Extract details cleanly for reuse across Wallet save and Push notification hooks
      const customerInfo = paystackData.customer || {};
      const payerEmailStr = customerInfo.email || "unknown@paystack.com";

      let payerNameStr = "External Payer";
      if (customerInfo.first_name || customerInfo.last_name) {
        payerNameStr = `${customerInfo.first_name || ""} ${
          customerInfo.last_name || ""
        }`.trim();
      } else if (customerInfo.fullName) {
        payerNameStr = customerInfo.fullName;
      } else if (customerInfo.email) {
        const dbUser = await Padiman_Route_User.findOne({
          email: customerInfo.email.toLowerCase(),
        });
        if (dbUser && dbUser.fullName) {
          payerNameStr = dbUser.fullName;
          console.log(
            `🎯 Payer profile matched via database lookup email trace: ${payerNameStr}`
          );
        }
      }

      const timeOfPayment = paystackData.paid_at || new Date().toISOString();
      const resolvedServiceId = updatedNegotiation?.service || null;
      const resolvedServiceType =
        updatedNegotiation?.serviceType || "ride_revenue_received";

      if (targetUserId) {
        console.log(
          `📡 Process Wallet sync for Service Provider User ID: ${targetUserId}`
        );

        // Fetch or initialize the destination wallet structure dynamically
        let wallet = await Wallet.findOne({ user: targetUserId });
        if (!wallet) {
          console.log(
            `⚠️ Wallet entry missing for user: ${targetUserId}. Instantiating new ledger.`
          );
          wallet = new Wallet({
            user: targetUserId,
            balance: 0,
            earnings: [],
            withdrawals: [],
          });
        }

        // Idempotency Check: Guard against duplicate calls crediting accounts twice
        const alreadyCredited = wallet.earnings.some(
          (earning) => earning.reference === reference
        );

        if (!alreadyCredited) {
          console.log(
            `💰 Crediting ₦${amountCredited} as PENDING earning to service provider...`
          );

          // NOTE: wallet.balance += amountCredited; is skipped here because earnings are pending escrow!
          wallet.earnings.push({
            payment: updatedPayment?._id || null,
            negotiationId: negotiationId || null,
            serviceId: resolvedServiceId,
            payerName: payerNameStr,
            payerEmail: payerEmailStr,
            amount: amountCredited,
            reference: reference,
            source: resolvedServiceType,
            status: "pending", // Logged explicitly as pending status
            createdAt: new Date(timeOfPayment),
          });

          await wallet.save();
          console.log(
            `✅ Wallet pending transaction logged successfully. Available Balance remains: ₦${wallet.balance}`
          );
        } else {
          console.log(
            `⚠️ Reference "${reference}" has already been processed into earnings. Skipping ledger alteration.`
          );
        }
      } else {
        console.log(
          "❌ Target serviceProvider context could not be parsed. Wallet update skipped."
        );
      }

      // ====================== SEND SUCCESS NOTIFICATION ======================
      await sendNotification(targetUserId, {
        title: "Payment Successful! 🎉",
        body: `Your payment of ₦${amountCredited} from ${payerNameStr} has been confirmed. It is currently held as pending.`,
        type: "PAYMENT",
        router: "/(screens)/success",
        data: {
          reference,
          negotiationId,
          serviceId: resolvedServiceId ? resolvedServiceId.toString() : null,
          serviceType: resolvedServiceType,
          payerName: payerNameStr,
          payerEmail: payerEmailStr,
          timeOfPayment: timeOfPayment,
          amount: amountCredited,
          status: "pending",
        },
      });
      // =====================================================================

      console.log(
        "✅ Payment verified, pending earnings saved to wallet, and notifications sent."
      );
      return res.status(200).json({
        success: true,
        message: "Payment captured successfully and wallet logged as pending.",
        data: paystackData,
      });
    } else {
      // ====================== SEND FAILED NOTIFICATION ======================
      await Payment.findOneAndUpdate(
        { reference },
        { status: "failed", paystackRawResponse: paystackData }
      );

      await sendNotification(metadataUserId, {
        title: "Payment Failed",
        body: `Your payment could not be completed. Reason: ${
          paystackData.gateway_response || "Transaction declined"
        }.`,
        type: "PAYMENT",
        router: "/(screens)/payment-failed",
        data: {
          reference,
          status: "failed",
        },
      });
      // =====================================================================

      return res.status(400).json({
        success: false,
        message: "Transaction check failed.",
        status: paystackData.status,
      });
    }
  } catch (error) {
    console.error(
      "❌ [PAYSTACK_VERIFY_ERROR]:",
      error.response?.data || error.message
    );

    const userIdFromReq = req.body?.userId || req.user?._id;
    if (userIdFromReq) {
      await sendNotification(userIdFromReq, {
        title: "Payment Verification Error",
        body: "Something went wrong while verifying your payment. Please contact support.",
        type: "PAYMENT",
        router: "/(screens)/support",
        data: { error: "verify_error" },
      });
    }

    return res.status(500).json({ success: false, error: error.message });
  }
};

exports.releaseEscrowEarnings = async (req, res) => {
  console.log("==================================================");
  console.log(
    `🚀 [RELEASE_ESCROW_EARNINGS] Triggered for Negotiation ID: ${req.params.negotiationId}`
  );
  console.log(`📥 [INCOMING_PARAMS]:`, JSON.stringify(req.params, null, 2));
  console.log(`📥 [INCOMING_BODY]:`, JSON.stringify(req.body, null, 2));
  console.log(
    `📥 [AUTHENTICATED_USER_CONTEXT]:`,
    req.user
      ? JSON.stringify(req.user, null, 2)
      : "No authenticated user injected on request"
  );

  try {
    const { negotiationId } = req.params;

    if (!negotiationId) {
      console.warn(
        "❌ [VALIDATION_FAILURE]: negotiationId parameter is completely missing from incoming request path."
      );
      return res.status(400).json({
        success: false,
        message: "Negotiation reference identifier parameter missing.",
      });
    }

    console.log(
      `🔍 [DB_QUERY]: Attempting to locate Wallet document holding negotiationId: ${negotiationId} in earnings array...`
    );
    // Locate the specific wallet containing this pending item matching the negotiation record
    const wallet = await Wallet.findOne({
      "earnings.negotiationId": negotiationId,
    });

    if (!wallet) {
      console.warn(
        `❌ [NOT_FOUND_FAILURE]: No wallet document matches the negotiation reference: ${negotiationId}`
      );
      return res.status(404).json({
        success: false,
        message:
          "No wallet ledger record contains an earnings line matching this negotiation identifier.",
      });
    }

    console.log(
      `📋 [WALLET_MATCHED]: Wallet ID found: ${wallet._id} for User Reference: ${wallet.user}`
    );
    console.log(
      `📊 [CURRENT_WALLET_STATE]: Balance: ₦${wallet.balance} | WithdrawableBalance: ₦${wallet.withdrawableBalance}`
    );

    // Find the specific structural nested earnings sub-document index
    const earningIndex = wallet.earnings.findIndex(
      (earning) =>
        earning.negotiationId &&
        earning.negotiationId.toString() === negotiationId
    );

    console.log(
      `🎯 [ARRAY_INDEX_MATCHED]: Nested index for target target earning within array is: ${earningIndex}`
    );

    if (earningIndex === -1) {
      console.error(
        `❌ [LOGICAL_CRITICAL_ERROR]: The top-level query matched this wallet, but sub-document findIndex could not pinpoint negotiationId: ${negotiationId} in array.`
      );
      return res.status(500).json({
        success: false,
        message:
          "Internal tracking mismatch relative to target earnings structural alignment.",
      });
    }

    const targetEarning = wallet.earnings[earningIndex];
    console.log(
      `📦 [TARGET_EARNING_DATA]:`,
      JSON.stringify(targetEarning, null, 2)
    );

    // Idempotency check: Guard if the status is already updated or not pending
    // if (targetEarning.status === "success") {
    //   console.log(
    //     `⚠️ [IDEMPOTENCY_BLOCK]: Escrow transaction was already executed successfully in a previous loop. Exiting safely.`
    //   );
    //   return res.status(200).json({
    //     success: true,
    //     message:
    //       "Escrow clearing redundant. This transaction item is already released and cleared.",
    //     balance: wallet.balance,
    //     withdrawableBalance: wallet.withdrawableBalance || wallet.balance,
    //   });
    // }

    if (targetEarning.status === "failed") {
      console.warn(
        `❌ [STATE_MUTATION_GUARD]: Target ledger line status is flagged as 'failed'. Escrow release aborted.`
      );
      return res.status(400).json({
        success: false,
        message:
          "Cannot release funds. This transaction was previously flagged as a failed process.",
      });
    }

    console.log(
      `🔄 [MUTATION_START]: Upgrading state status from '${targetEarning.status}' to 'success'`
    );
    // Execute safe operations: transition status and credit balances
    targetEarning.status = "success";

    console.log(
      `💸 [MATH_OP]: Adding ₦${targetEarning.amount} to primary balance ledger...`
    );
    // Credit standard tracking balance
    wallet.balance += targetEarning.amount;

    // Credit operational withdrawable balance tracking matrix safely
    if (typeof wallet.withdrawableBalance !== "number") {
      console.log(
        `🔧 [TYPE_FIX]: wallet.withdrawableBalance was not a valid number primitive type. Standardizing to 0.`
      );
      wallet.withdrawableBalance = 0;
    }

    console.log(
      `💸 [MATH_OP]: Adding ₦${targetEarning.amount} to withdrawable safe balance ledger...`
    );
    wallet.withdrawableBalance += targetEarning.amount;

    console.log(
      `💾 [DB_SAVE]: Writing modified balance updates to Mongo storage engine...`
    );
    // Persist wallet balance updates down into MongoDB
    await wallet.save();
    console.log(
      `✅ [ESCROW_RELEASED] ₦${targetEarning.amount} credited to user: ${wallet.user}. New Spendable: ₦${wallet.balance} | Withdrawable: ₦${wallet.withdrawableBalance}`
    );

    // ====================================================================
    // INTEGRATED: Toggle negotiation confirmation status state parameters
    // ====================================================================
    let updatedNegotiation = null;
    try {
      console.log(
        `🔄 [DB_UPDATE]: Triggering negotiation collection update for document target ID: ${negotiationId}...`
      );
      updatedNegotiation = await Negotiation.findByIdAndUpdate(
        negotiationId,
        { $set: { isConfirmed: true } },
        { new: true }
      );
      console.log(
        `🔒 [NEGOTIATION_CONFIRMED] isConfirmed status verified set to true for ID: ${negotiationId}`
      );
      console.log(
        `📄 [UPDATED_NEGOTIATION_PAYLOAD]:`,
        JSON.stringify(updatedNegotiation, null, 2)
      );
    } catch (negErr) {
      console.error(
        `⚠️ Failed to update negotiation isConfirmed flag parameters downstream:`,
        negErr.message,
        "\nStack trace:",
        negErr.stack
      );
    }
    // ====================================================================

    // Optionally dispatch background alerts to the Service Provider notifying them of unlocked funds
    try {
      console.log(
        `📱 [NOTIFICATION_DISPATCH]: Compiling background socket payload push alert targeting recipient User ID: ${wallet.user.toString()}...`
      );
      await sendNotification(wallet.user.toString(), {
        title: "Funds Cleared! 💰",
        body: `₦${targetEarning.amount.toLocaleString()} has been moved from escrow to your spendable available balance.`,
        type: "PAYMENT",
        router: "/(screens)/withdrawal",
        data: {
          negotiationId,
          amount: targetEarning.amount,
          status: "success",
        },
      });
      console.log(
        `🚀 [NOTIFICATION_SUCCESS]: Notification packet dispatched completely to notification servers.`
      );
    } catch (notifErr) {
      console.error(
        "⚠️ Push notification failed to send post escrow clear:",
        notifErr.message,
        "\nStack trace:",
        notifErr.stack
      );
    }

    console.log(
      `🏁 [RESPONSE_200]: Escrow release thread execution process finalized successfully.`
    );
    console.log("==================================================");

    return res.status(200).json({
      success: true,
      message:
        "Escrow funds released successfully and added directly into the live available balance ledger.",
      data: {
        negotiationId,
        amountReleased: targetEarning.amount,
        newSpendableBalance: wallet.balance,
        newWithdrawableBalance: wallet.withdrawableBalance,
        negotiation: updatedNegotiation,
      },
    });
  } catch (error) {
    console.error(
      "❌ [RELEASE_ESCROW_ERROR] Fatal processing exception encountered inside route controller logic:",
      error.message
    );
    console.error("💥 [FULL_ERROR_STACK]:", error.stack);
    console.log("==================================================");
    return res.status(500).json({ success: false, error: error.message });
  }
};
