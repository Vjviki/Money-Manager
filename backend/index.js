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

// ✅ MongoDB Connection
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

/* ================= MODELS ================= */

// USER
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

// TRANSACTION
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

// BACKUP
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

/* ================= AUTH ================= */

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

/* ================= AUTH APIs ================= */

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

  console.log("JWT User:", req.user);
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

/* ================= USER ================= */

app.get("/profile", authenticateToken, async (req, res) => {
  const user = await User.findOne(
    { username: req.user.username },
    { password: 0 },
  );

  res.send(user);
});

/* ================= TRANSACTIONS ================= */

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

  res.send({
    income,
    expenses,
    balance: income - expenses,
  });
});

app.get("/transactions", authenticateToken, async (req, res) => {
  const transactions = await Transaction.find({ user_id: req.user.id });
  res.send({ transactions });
});

/* ================= ANALYTICS ================= */

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

/* ================= RESET ================= */

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

  await Backup.insertMany(backupData);
  await Transaction.deleteMany({ user_id: req.user.id });

  res.send({ message: "Monthly reset completed" });
});

/* ================= MONTHLY ================= */

app.get("/monthly-summary", authenticateToken, async (req, res) => {
  // console.log("✅ API HIT /monthly-summary");
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
    // await Backup.updateMany(
    //   {},
    //   {
    //     $set: {
    //       user_id: new mongoose.Types.ObjectId("69f496a146c04fcbbb6b0579"),
    //     },
    //   },
    // );

    // const one = await Backup.findOne();

    // console.log("DB user_id:", one.user_id);
    // console.log("DB user_id type:", typeof one.user_id);

    // console.log("REQ user_id:", req.user.id);
    // console.log("REQ user_id type:", typeof req.user.id);

    // const docs = await Backup.find().limit(2);
    // console.log(docs);

    res.send(
      data.map((d) => ({
        month: d._id,
        expenses: d.expenses,
        savings: d.income - d.expenses,
      })),
    );
    // console.log("Monthly Data:", data);
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

  console.log(data);

  res.send({ transactions: data });
});

/* ================= EXPORT ================= */

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

/* ================= DELETE ================= */

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
