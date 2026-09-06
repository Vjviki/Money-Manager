require("dotenv").config();
const cors = require("cors");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());

const PORT = process.env.PORT || 3000;

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
    created_at: { type: Date, default: Date.now },
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

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  if (!authHeader) {
    return res.status(401).send({ error: "Missing JWT Token" });
  }

  const jwtToken = authHeader.split(" ")[1];

  jwt.verify(jwtToken, "MY_SECRET_KEY", (error, payload) => {
    if (error) {
      return res.status(401).send({ error: "Invalid JWT Token" });
    }
    req.user = payload;
    next();
  });
};

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const dbUser = await User.findOne({ username });

  if (!dbUser) {
    return res.status(400).json({ errorMessage: "Invalid user" });
  }

  const isPasswordMatched = await bcrypt.compare(password, dbUser.password);

  if (isPasswordMatched) {
    const jwtToken = jwt.sign(
      { id: dbUser._id, username: dbUser.username },
      "MY_SECRET_KEY",
    );
    res.send({ jwtToken });
  } else {
    res.status(400).json({ errorMessage: "Invalid password" });
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
    email,
    password: hashedPassword,
  });

  res.json({ message: "User created successfully" });
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
  const { title, amount, type, category, created_at } = req.body;

  await Transaction.create({
    user_id: req.user.id,
    title,
    amount,
    type,
    category,
    created_at,
  });

  res.send({ message: "Transaction added successfully" });
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
