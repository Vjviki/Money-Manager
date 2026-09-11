require("dotenv").config();
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "MY_SECRET_KEY";
const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

mongoose
  .connect(process.env.MONGO_URL)
  .then(() => {
    console.log("MongoDB Connected");
    app.listen(PORT, () => {
      console.log(`Server Running on ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Mongo Error:", err);
    process.exit(1);
  });

const User = mongoose.model(
  "User",
  new mongoose.Schema(
    {
      name: String,
      username: { type: String, unique: true },
      gender: { type: String, enum: ["Male", "Female", "Others"] },
      email: { type: String, unique: true },
      password: String,
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
  }),
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
  }),
);

const PasswordReset = mongoose.model(
  "PasswordReset",
  new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, unique: true, index: true },
    otp_hash: String,
    expires_at: Date,
    requested_at: Date,
    attempts: { type: Number, default: 0 },
  }),
);

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).send({ error: "Missing JWT Token" });
  }

  const jwtToken = authHeader.split(" ")[1];

  jwt.verify(jwtToken, JWT_SECRET, (error, payload) => {
    if (error) {
      return res.status(401).send({ error: "Invalid JWT Token" });
    }
    req.user = payload;
    next();
  });
};

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

app.post("/login", async (req, res) => {
  try {
    const username = String(req.body.username || "").trim();
    const password = String(req.body.password || "");

    if (!username || !password) {
      return res.status(400).json({ errorMessage: "Username and password are required" });
    }

    const dbUser = await User.findOne({ username });

    if (!dbUser) {
      return res.status(400).json({ errorMessage: "Invalid username or password" });
    }

    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

    if (!isPasswordMatched) {
      return res.status(400).json({ errorMessage: "Invalid username or password" });
    }

    const jwtToken = jwt.sign(
      { id: dbUser._id, username: dbUser.username },
      JWT_SECRET,
    );

    res.send({ jwtToken });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ errorMessage: "Unable to sign in right now" });
  }
});

app.post("/register", async (req, res) => {
  const { name, username, gender, email, password } = req.body;
  const existingUser = await User.findOne({ username });

  if (existingUser) {
    return res.status(400).json({ message: "User already exists" });
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  await User.create({
    name,
    username,
    gender,
    email: String(email || "").trim().toLowerCase(),
    password: hashedPassword,
  });

  res.json({ message: "User created successfully" });
});

app.post("/forgot-password/request", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
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

    const existingReset = await PasswordReset.findOne({ user_id: user._id });
    if (
      existingReset?.requested_at &&
      Date.now() - existingReset.requested_at.getTime() < OTP_RESEND_SECONDS * 1000
    ) {
      return res.status(429).send({ error: "Please wait a minute before requesting another code" });
    }

    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = await bcrypt.hash(otp, 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await PasswordReset.findOneAndUpdate(
      { user_id: user._id },
      {
        otp_hash: otpHash,
        expires_at: expiresAt,
        requested_at: now,
        attempts: 0,
      },
      { upsert: true, new: true },
    );

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
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!email || !otp || !newPassword) {
      return res.status(400).send({ error: "Email, verification code and new password are required" });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).send({ error: "Enter the 6-digit verification code" });
    }

    if (newPassword.length < 8) {
      return res.status(400).send({ error: "New password must be at least 8 characters" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).send({ error: "Invalid or expired verification code" });
    }

    const reset = await PasswordReset.findOne({ user_id: user._id });
    if (!reset || !reset.expires_at || reset.expires_at.getTime() < Date.now()) {
      if (reset) await PasswordReset.deleteOne({ _id: reset._id });
      return res.status(400).send({ error: "Invalid or expired verification code" });
    }

    if (reset.attempts >= MAX_OTP_ATTEMPTS) {
      await PasswordReset.deleteOne({ _id: reset._id });
      return res.status(429).send({ error: "Too many incorrect attempts. Request a new code." });
    }

    const otpMatches = await bcrypt.compare(otp, reset.otp_hash);
    if (!otpMatches) {
      reset.attempts += 1;
      await reset.save();
      return res.status(400).send({ error: "Invalid or expired verification code" });
    }

    const samePassword = await bcrypt.compare(newPassword, user.password);
    if (samePassword) {
      return res.status(400).send({ error: "Choose a password different from your current password" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await PasswordReset.deleteOne({ _id: reset._id });

    res.send({ message: "Password reset successfully. You can now sign in." });
  } catch (error) {
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

app.put("/change-password", authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).send({ error: "Current and new password are required" });
    }

    if (String(newPassword).length < 8) {
      return res.status(400).send({ error: "New password must be at least 8 characters" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).send({ error: "User not found" });
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      return res.status(400).send({ error: "Current password is incorrect" });
    }

    const samePassword = await bcrypt.compare(newPassword, user.password);
    if (samePassword) {
      return res.status(400).send({ error: "New password must be different from your current password" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.send({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).send({ error: "Unable to change password" });
  }
});

app.post("/", authenticateToken, async (req, res) => {
  const { title, amount, type, category, created_at, detected_id } = req.body;
  if (detected_id !== undefined && (typeof detected_id !== "string" || !detected_id.trim() || detected_id.length > 200)) {
    return res.status(400).send({ error: "Invalid detected transaction ID" });
  }
  try {
    // Ensure the unique index exists before accepting retryable notification uploads.
    if (detected_id) await Transaction.init();
    await Transaction.create({
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
  const transactions = await Transaction.find({ user_id: req.user.id });

  let income = 0;
  let expenses = 0;

  transactions.forEach((t) => {
    if (t.type === "Income") income += t.amount;
    else expenses += t.amount;
  });

  res.send({ income, expenses, balance: income - expenses });
});

app.get("/transactions", authenticateToken, async (req, res) => {
  const transactions = await Transaction.find({ user_id: req.user.id });
  res.send({ transactions });
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

app.post("/reset-month", authenticateToken, async (req, res) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const transactions = await Transaction.find({ user_id: req.user.id });

  const backupData = transactions.map((t) => ({
    user_id: req.user.id,
    title: t.title,
    amount: t.amount,
    type: t.type,
    category: t.category,
    date: t.created_at,
    backup_month: currentMonth,
  }));

  if (backupData.length > 0) {
    await Backup.insertMany(backupData);
  }

  await Transaction.deleteMany({ user_id: req.user.id });
  res.send({ message: "Monthly reset completed" });
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
