const CooperativeLoan = require("../../models/cooperative/CooperativeLoan");
const { uploadToBackblaze } = require("../../utils/uploadToBackblaze");

// Get user loans
exports.getUserLoans = async (req, res) => {
  try {
    const loans = await CooperativeLoan.find({ userId: req.user._id });
    res.status(200).json({ success: true, data: loans });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create / Apply for a Loan with Multipart Form Data (Surety Forms Upload)
exports.createLoan = async (req, res) => {
  try {
    const { principalAmount, durationMonths, description } = req.body;

    const principal = Number(principalAmount) || 0;
    const duration = Number(durationMonths) || 12;
    const annualInterestRate = 20; // 20% per annum

    // Calculate Interest & Payable
    const interest = principal * (annualInterestRate / 100) * (duration / 12);
    const payable = principal + interest;

    const dueDate = new Date();
    dueDate.setMonth(dueDate.getMonth() + duration);

    // Handle uploaded surety forms via multer (req.files or req.file)
    const suretyForms = {};

    if (req.files) {
      if (req.files.form1 && req.files.form1[0]) {
        const file1 = req.files.form1[0];
        const url1 = await uploadToBackblaze(
          file1.buffer,
          file1.originalname,
          "loans/surety-forms"
        );
        suretyForms.form1 = url1;
      }
      if (req.files.form2 && req.files.form2[0]) {
        const file2 = req.files.form2[0];
        const url2 = await uploadToBackblaze(
          file2.buffer,
          file2.originalname,
          "loans/surety-forms"
        );
        suretyForms.form2 = url2;
      }
    }

    const loan = await CooperativeLoan.create({
      userId: req.user._id,
      principalAmount: principal,
      interestRate: annualInterestRate,
      durationMonths: duration,
      interest,
      payable,
      balance: payable,
      status: "pending", // Set to pending until reviewed by admin
      dueDate,
      suretyForms,
      transactions: [], // No disbursement transaction yet until approved
    });

    res.status(201).json({
      success: true,
      message: "Loan application submitted successfully and is pending review.",
      data: loan,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin Review / Approve or Reject Loan Request
exports.reviewLoan = async (req, res) => {
  try {
    const { loanId, status } = req.body; // status: "active" (approved) or "rejected"

    if (!["active", "rejected"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Use 'active' to approve or 'rejected'",
      });
    }

    const loan = await CooperativeLoan.findById(loanId);
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan application not found",
      });
    }

    loan.status = status;

    // If approved, push disbursement transaction
    if (status === "active") {
      loan.transactions.push({
        type: "disbursement",
        amount: loan.principalAmount,
        description: `Loan disbursement approved (${loan.durationMonths} months @ 20% p.a.)`,
        date: new Date(),
      });
    }

    await loan.save();
    res.status(200).json({
      success: true,
      message: `Loan application ${
        status === "active" ? "approved and disbursed" : "rejected"
      } successfully.`,
      data: loan,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Repay a Loan (Reduces loan balance)
exports.repayLoan = async (req, res) => {
  try {
    const { loanId, amount, reference, description } = req.body;
    const repayAmount = Number(amount);

    if (!repayAmount || repayAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid repayment amount",
      });
    }

    const loan = await CooperativeLoan.findOne({
      _id: loanId,
      userId: req.user._id,
    });
    if (!loan) {
      return res.status(404).json({ success: false, message: "Loan not found" });
    }

    if (loan.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Can only repay active loans",
      });
    }

    if (repayAmount > loan.balance) {
      return res.status(400).json({
        success: false,
        message: "Repayment amount exceeds remaining loan balance",
      });
    }

    loan.balance -= repayAmount;
    if (loan.balance <= 0) {
      loan.balance = 0;
      loan.status = "completed";
    }

    loan.transactions.push({
      type: "repayment",
      amount: repayAmount,
      reference,
      description: description || "Loan repayment",
      date: new Date(),
    });

    await loan.save();
    res.status(200).json({
      success: true,
      message: "Loan repayment recorded successfully",
      data: loan,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};