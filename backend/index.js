require("dotenv").config();
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { randomInt, randomUUID } = require("node:crypto");
const { authConfig, createAuth, validPassword, versionFilter, limiter, identityKey } = require("./auth");
const { secret: JWT_SECRET, hops } = authConfig(process.env);
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");
const { createArchiveService } = require("./archive");
const { createTransactionQueries } = require("./transaction-queries");

const app = express();
app.use(cors({ origin: "*" }));
app.set("trust proxy", hops);
app.use(express.json({ limit: "16kb" }));

const PORT = process.env.PORT || 3000;
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: String,
      username: { type: String, unique: true },
      gender: { type: String, enum: ["Male", "Female", "Others"] },
      email: { type: String, unique: true },
      password: { type: String, required: true },
      token_version: { type: Number, default: 0 },
      archive_revision: { type: Number, default: 0, select: false },
    },
    { timestamps: { createdAt: "created_at", updatedAt: false } },
  ),
);

const Transaction = mongoose.model(
  "Transaction",
  new mongoose.Schema({
    user_id: mongoose.Schema.Types.ObjectId,
    title: String,
    amount: Number,
    type: { type: String, enum: ["Income", "Expenses"] },
    category: String,
    detected_id: String,
    created_at: { type: Date, default: Date.now },
  }).index({ user_id: 1, detected_id: 1 }, {
    unique: true,
    partialFilterExpression: { detected_id: { $type: "string" } },
  }).index({ user_id: 1, created_at: -1, _id: -1 })
    .index({ user_id: 1, type: 1, created_at: -1, _id: -1 }),
);

const Backup = mongoose.model(
  "Backup",
  new mongoose.Schema({
    user_id: mongoose.Schema.Types.ObjectId,
    title: String,
    amount: Number,
    type: String,
    category: String,
    date: String,
    backup_month: String,
    source_id: mongoose.Schema.Types.ObjectId,
    detected_id: String,
  }).index({ user_id: 1, source_id: 1 }, {
    unique: true, partialFilterExpression: { source_id: { $type: "objectId" } },
  }).index({ user_id: 1, detected_id: 1 }).index({ user_id: 1, backup_month: 1 }),
);

const ArchiveReset = mongoose.model("ArchiveReset", new mongoose.Schema({
  user_id: mongoose.Schema.Types.ObjectId,
  request_id: String,
  archived_count: Number,
  created_at: { type: Date, default: Date.now },
}).index({ user_id: 1, request_id: 1 }, { unique: true }));
const archiveService = createArchiveService({ mongoose, User, Transaction, Backup, ArchiveReset });
const transactionQueries = createTransactionQueries(Transaction, mongoose);

const PasswordReset = mongoose.model(
  "PasswordReset",
  new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, unique: true, index: true },
    otp_hash: String,
    expires_at: { type: Date, expires: 0 },
    requested_at: Date,
    attempts: { type: Number, default: 0 },
  }),
);

const { authenticateToken, login, register, changePassword } = createAuth(User, JWT_SECRET);

const getMailTransporter = () => {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
};

app.post("/login", limiter(200), limiter(20, identityKey), login);
app.post("/register", limiter(20), register);
app.use("/forgot-password", limiter(30));

app.post("/forgot-password/request", async (req, res) => {
  try {
    if (typeof req.body?.email !== "string" || req.body.email.length > 254) {
      return res.status(400).send({ error: "Enter a valid email address" });
    }
    const email = req.body.email.trim().toLowerCase();
    const transporter = getMailTransporter();

    if (!email || !email.includes("@")) {
      return res.status(400).send({ error: "Enter a valid email address" });
    }

    if (!transporter) {
      return res.status(503).send({ error: "Password recovery email is not configured yet" });
    }

    const user = await User.findOne({ email });

    // Use the same success response whether or not an account exists.
    if (!user) {
      return res.send({ message: "If an account exists for this email, a verification code has been sent." });
    }

    const otp = String(randomInt(100000, 1000000));
    const otpHash = await bcrypt.hash(otp, 10);
    const now = new Date();
    try {
      await PasswordReset.findOneAndUpdate(
        { user_id: user._id, $or: [
          { requested_at: { $lte: new Date(now.getTime() - OTP_RESEND_SECONDS * 1000) } },
          { requested_at: { $exists: false } },
        ] },
        { $set: { otp_hash: otpHash, expires_at: new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60000),
          requested_at: now, attempts: 0 } },
        { upsert: true, new: true },
      );
    } catch (error) {
      if (error.code === 11000) return res.send({ message: "If an account exists for this email, a verification code has been sent." });
      throw error;
    }

    const from = process.env.MAIL_FROM || process.env.SMTP_USER;

    await transporter.sendMail({
      from,
      to: user.email,
      subject: "Money Manager password reset code",
      text: `Your Money Manager verification code is ${otp}. It expires in ${OTP_EXPIRY_MINUTES} minutes. If you did not request a password reset, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px;color:#1e293b">
          <h2 style="margin-bottom:8px">Money Manager</h2>
          <p>Use this verification code to reset your password:</p>
          <div style="font-size:30px;font-weight:800;letter-spacing:8px;padding:18px 0">${otp}</div>
          <p>This code expires in ${OTP_EXPIRY_MINUTES} minutes.</p>
          <p style="color:#64748b;font-size:13px">If you did not request a password reset, you can ignore this email.</p>
        </div>
      `,
    });

    res.send({ message: "If an account exists for this email, a verification code has been sent." });
  } catch (error) {
    console.error("Forgot password request error:", error);
    res.status(500).send({ error: "Unable to send verification code right now" });
  }
});

app.post("/forgot-password/reset", async (req, res) => {
  try {
    if (typeof req.body?.email !== "string" || req.body.email.length > 254 ||
        typeof req.body.otp !== "string" || typeof req.body.newPassword !== "string") {
      return res.status(400).send({ error: "Enter valid reset details" });
    }
    const email = req.body.email.trim().toLowerCase();
    const otp = req.body.otp.trim();
    const newPassword = req.body.newPassword;

    if (!email || !otp || !newPassword) {
      return res.status(400).send({ error: "Email, verification code and new password are required" });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).send({ error: "Enter the 6-digit verification code" });
    }

    if (!validPassword(newPassword)) {
      return res.status(400).send({ error: "New password must be at least 8 characters and at most 72 UTF-8 bytes" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send({ error: "Invalid or expired verification code" });
    }

    // Reserve an attempt before comparing, so parallel requests cannot exceed five checks.
    const reset = await PasswordReset.findOneAndUpdate(
      { user_id: user._id, expires_at: { $gt: new Date() }, attempts: { $lt: MAX_OTP_ATTEMPTS } },
      { $inc: { attempts: 1 } }, { new: true },
    );
    if (!reset || !(await bcrypt.compare(otp, reset.otp_hash))) {
      return res.status(400).send({ error: "Invalid, expired or exhausted verification code. Request a new code if needed." });
    }

    const samePassword = await bcrypt.compare(newPassword, user.password);
    if (samePassword) {
      return res.status(400).send({ error: "Choose a password different from your current password" });
    }

    const password = await bcrypt.hash(newPassword, 10);
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const consumed = await PasswordReset.deleteOne({ _id: reset._id, otp_hash: reset.otp_hash,
          expires_at: { $gt: new Date() }, attempts: { $lte: MAX_OTP_ATTEMPTS } }, { session });
        if (!consumed.deletedCount) throw Object.assign(new Error("Reset already used or expired"), { resetConflict: true });
        const changed = await User.updateOne({ _id: user._id, password: user.password, ...versionFilter(user) },
          { $set: { password }, $inc: { token_version: 1 } }, { session });
        if (!changed.modifiedCount) throw Object.assign(new Error("Account changed"), { resetConflict: true });
      });
    } finally { await session.endSession(); }

    res.send({ message: "Password reset successfully. You can now sign in." });
  } catch (error) {
    if (error.resetConflict) return res.status(400).send({ error: "Invalid or expired verification code" });
    console.error("Forgot password reset error:", error);
    res.status(500).send({ error: "Unable to reset password right now" });
  }
});

app.get("/profile", authenticateToken, async (req, res) => {
  const user = await User.findById(req.user.id, { password: 0 });

  if (!user) {
    return res.status(404).send({ error: "User not found" });
  }

  res.send(user);
});

app.put("/profile", authenticateToken, async (req, res) => {
  try {
    const { name, email, gender } = req.body;
    const cleanName = String(name || "").trim();
    const cleanEmail = String(email || "").trim().toLowerCase();
    const allowedGenders = ["Male", "Female", "Others"];

    if (!cleanName || !cleanEmail || !allowedGenders.includes(gender)) {
      return res.status(400).send({ error: "Please provide valid profile details" });
    }

    const emailInUse = await User.findOne({
      email: cleanEmail,
      _id: { $ne: req.user.id },
    });

    if (emailInUse) {
      return res.status(409).send({ error: "Email is already in use" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      { name: cleanName, email: cleanEmail, gender },
      { new: true, runValidators: true, projection: { password: 0 } },
    );

    if (!updatedUser) {
      return res.status(404).send({ error: "User not found" });
    }

    res.send({ message: "Profile updated successfully", user: updatedUser });
  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).send({ error: "Unable to update profile" });
  }
});

app.put("/change-password", authenticateToken, limiter(10, req => req.user.id), changePassword);

app.post("/", authenticateToken, async (req, res) => {
  const { title, amount, type, category, created_at, detected_id } = req.body;
  if (detected_id !== undefined && (typeof detected_id !== "string" || !detected_id.trim() || detected_id.length > 200)) {
    return res.status(400).send({ error: "Invalid detected transaction ID" });
  }
  try {
    // Ensure the unique index exists before accepting retryable notification uploads.
    if (detected_id) await Transaction.init();
    await archiveService.addTransaction({
      user_id: req.user.id, title, amount, type, category, created_at,
      ...(detected_id ? { detected_id } : {}),
    });
    res.send({ message: "Transaction added successfully" });
  } catch (error) {
    if (detected_id && error.code === 11000 && await Transaction.exists({ user_id: req.user.id, detected_id })) {
      return res.send({ message: "Transaction already added" });
    }
    console.error("Unable to save transaction", error);
    res.status(500).send({ error: "Unable to save transaction" });
  }
});

app.get("/", authenticateToken, async (req, res) => {
  try { res.json(await transactionQueries.summary(req.user.id)); }
  catch { res.status(503).json({ error: "Unable to load totals right now" }); }
});

app.get("/transactions", authenticateToken, async (req, res) => {
  try {
    // Older installed apps still expect a complete list. New screens opt in to
    // pagination with query parameters; retire this compatibility path later.
    if (Object.keys(req.query).length === 0) {
      const transactions = await Transaction.find({ user_id: req.user.id }).maxTimeMS(10000).lean();
      return res.json({ transactions });
    }
    res.json(await transactionQueries.list(req.user.id, req.query));
  } catch (error) {
    res.status(error.status === 400 ? 400 : 503).json({ error: error.status === 400
      ? "Invalid transaction filters" : "Unable to load transactions right now" });
  }
});

app.put("/transactions/:id", authenticateToken, async (req, res) => {
  const { title, amount, type, category, created_at } = req.body;

  if (!title || !category || !type || !created_at || Number(amount) <= 0) {
    return res.status(400).send({ error: "Invalid transaction data" });
  }

  const updated = await Transaction.findOneAndUpdate(
    { _id: req.params.id, user_id: req.user.id },
    {
      title: title.trim(),
      amount: Number(amount),
      type,
      category: category.trim(),
      created_at,
    },
    { new: true },
  );

  if (!updated) {
    return res.status(404).send({ error: "Transaction not found" });
  }

  res.send({ message: "Transaction updated successfully", transaction: updated });
});

app.get("/analytics", authenticateToken, async (req, res) => {
  const data = await Transaction.aggregate([
    {
      $match: {
        user_id: new mongoose.Types.ObjectId(req.user.id),
        type: "Expenses",
      },
    },
    {
      $group: {
        _id: "$category",
        total: { $sum: "$amount" },
      },
    },
  ]);

  res.send(
    data.map((d) => ({
      category: d._id,
      total: d.total,
    })),
  );
});

app.post("/reset-month", authenticateToken, limiter(20, req => req.user.id), async (req, res) => {
  const requestId = req.get("Idempotency-Key") || randomUUID();
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(requestId)) {
    return res.status(400).json({ error: "Invalid archive request ID" });
  }
  try {
    const archivedCount = await archiveService.archive(req.user.id, requestId);
    res.json({ message: "Archive completed", archivedCount, requestId });
  } catch (error) {
    console.error("Monthly archive failed:", error.message);
    res.status(error.status || 503).json({ error: error.status === 413
      ? "Too many transactions for one archive. Contact support."
      : "Unable to confirm archive completion. Retry the same request." });
  }
});

app.get("/monthly-summary", authenticateToken, async (req, res) => {
  try {
    const data = await Backup.aggregate([
      { $match: { user_id: new mongoose.Types.ObjectId(req.user.id) } },
      {
        $group: {
          _id: "$backup_month",
          income: {
            $sum: {
              $cond: [{ $eq: ["$type", "Income"] }, "$amount", 0],
            },
          },
          expenses: {
            $sum: {
              $cond: [{ $eq: ["$type", "Expenses"] }, "$amount", 0],
            },
          },
        },
      },
      { $sort: { _id: -1 } },
    ]);

    res.send(
      data.map((d) => ({
        month: d._id,
        expenses: d.expenses,
        savings: d.income - d.expenses,
      })),
    );
  } catch (error) {
    console.log(error);
    res.status(500).send({ error: error.message });
  }
});

app.get("/monthly-details/:month", authenticateToken, async (req, res) => {
  const data = await Backup.find({
    user_id: req.user.id,
    backup_month: req.params.month,
  });

  res.send({ transactions: data });
});

app.get("/export-month/:month", authenticateToken, async (req, res) => {
  const data = await Backup.find({
    user_id: req.user.id,
    backup_month: req.params.month,
  });

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Monthly Report");

  sheet.columns = [
    { header: "Title", key: "title" },
    { header: "Category", key: "category" },
    { header: "Amount", key: "amount" },
    { header: "Type", key: "type" },
    { header: "Date", key: "date" },
  ];

  data.forEach((row) => sheet.addRow(row));

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${req.params.month}.xlsx`,
  );

  await workbook.xlsx.write(res);
  res.end();
});

app.delete("/transactions/:id", authenticateToken, async (req, res) => {
  const result = await Transaction.deleteOne({
    _id: req.params.id,
    user_id: req.user.id,
  });

  if (result.deletedCount === 0) {
    res.status(404).send({ error: "Transaction not found" });
  } else {
    res.send({ message: "Transaction deleted successfully" });
  }
});

// Express 4 does not automatically catch rejected async route promises elsewhere.
// Auth handlers catch their errors; this handles malformed JSON and middleware failures.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.type === "entity.too.large" ? 413 : error.type === "entity.parse.failed" ? 400 : 500;
  res.status(status).json({ error: status === 500 ? "Unable to process request" : "Invalid request body" });
});

async function start() {
  await mongoose.connect(process.env.MONGO_URL);
  await Promise.all([User.init(), PasswordReset.init(), Transaction.init(), Backup.init(), ArchiveReset.init()]);
  return app.listen(PORT, () => console.log(`Server Running on ${PORT}`));
}
if (require.main === module) start().catch(() => {
  console.error("Database connection or required index initialization failed");
  process.exit(1);
});
module.exports = { app, start, User, PasswordReset, Transaction, Backup, ArchiveReset, archiveService };
