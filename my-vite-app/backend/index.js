const cors = require("cors");
const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");

const app = express();
app.use(cors());
app.use(express.json());
const dbpath = path.join(__dirname, "user.db");
let db = null;

const initilizeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initilizeDBAndServer();

const authenticateToken = (request, response, next) => {
  const authHeader = request.headers["authorization"];

  if (authHeader === undefined) {
    response.status(401).send({ error: "Missing JWT Token" });
  } else {
    const jwtToken = authHeader.split(" ")[1];
    jwt.verify(jwtToken, "MY_SECRET_KEY", (error, payload) => {
      if (error) {
        response.status(401).send({ error: "Invalid JWT Token" });
      } else {
        request.user = payload;
        next();
      }
    });
  }
};

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectQuery = `SELECT * FROM users WHERE username = '${username}';`;
  const dbUser = await db.get(selectQuery);
  if (dbUser === undefined) {
    response.status(400).json({ errorMessage: "Invalid user" });
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched === true) {
      const payload = {
        id: dbUser.id,
        username: dbUser.username,
      };
      const jwtToken = jwt.sign(payload, "MY_SECRET_KEY");
      response.send({ jwtToken });
    } else {
      response.status(400).json({ errorMessage: "Invalid password" });
    }
  }
});

app.post("/register", async (request, response) => {
  const { name, username, gender, email, password } = request.body;
  const hashedPassword = await bcrypt.hash(password, 10);
  const selectUserQuery = `SELECT * FROM users WHERE username = '${username}';`;
  const dbUser = await db.get(selectUserQuery);
  if (dbUser === undefined) {
    const createUserQuery = `INSERT INTO users (name, username, gender, email, password)
        VALUES ('${name}', '${username}', '${gender}', '${email}', '${hashedPassword}');`;
    await db.run(createUserQuery);
    response.status(200).json({ message: "User created successfully" });
  } else {
    response.status(400).json({ message: "User already exists" });
  }
});

app.get("/profile", authenticateToken, async (request, response) => {
  const username = request.user.username;
  const getUserQuery = `SELECT id, name, username, gender, email FROM users WHERE username = '${username}';`;
  const user = await db.get(getUserQuery);

  if (user === undefined) {
    response.status(404).send({ error: "User not found" });
  } else {
    response.send(user);
  }
});

app.post("/", authenticateToken, async (request, response) => {
  const username = request.user.username;
  const { title, amount, type, date, category} = request.body;

  const userQuery = `SELECT id FROM users WHERE username = ?`;
  const user = await db.get(userQuery, [username]);

  const id = user.id;

  const updateUserQuery = `INSERT INTO transactions (user_id, title, amount, type, created_at, category) VALUES (?, ?, ?, ?, ?, ?);`;
  await db.run(updateUserQuery, [id, title, amount, type, date, category]);
  response.json({
    message: "Transaction added successfully",
  });
});

app.get("/", authenticateToken, async (request, response) => {
  const username = request.user.username;

  const getUserQuery = `SELECT id FROM users WHERE username = ?`;
  const user = await db.get(getUserQuery, [username]);

  const incomeQuery = `
  SELECT IFNULL(SUM(amount), 0) AS income
  FROM transactions
  WHERE user_id = ? AND type = 'Income';
  `;

  const incomeResult = await db.get(incomeQuery, [user.id]);
  const income = incomeResult.income;

  const expensesQuery = `
  SELECT IFNULL(SUM(amount), 0) AS expenses
  FROM transactions
  WHERE user_id = ? AND type = 'Expenses';`;

  const expensesResult = await db.get(expensesQuery, [user.id]);
  const expenses = expensesResult.expenses;

  const balance = income - expenses;

  response.json({
    income,
    expenses,
    balance,
  });
});

app.get("/transactions", authenticateToken, async (request, response) => {
  try {
     const username = request.user.username;

    const userQuery = `SELECT id FROM users WHERE username = ?`;
    const user = await db.get(userQuery, [username]);

    const userTransactionDetailsQuery = `
      SELECT * FROM transactions WHERE user_id = ?;
    `;

    const transactions = await db.all(userTransactionDetailsQuery, [user.id]);

    response.json({ transactions });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    response.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/analytics", authenticateToken, async (req, res) => {
  const userId = req.user.id;

  const query = `
    SELECT category, SUM(amount) AS total
    FROM transactions
    WHERE user_id = ? AND type='Expenses'
    GROUP BY category
  `;

  const data = await db.all(query, [userId]);

  res.send(data);
});

app.post("/reset-month", authenticateToken, async (req, res) => {
  try {

    const currentMonth = new Date().toISOString().slice(0,7); 
    // example → 2026-06

    // 1️⃣ Move data to backup table
    await db.run(`
      INSERT INTO transactions_backup 
      (id,title,amount,type,category,date,backup_month)
      SELECT id,title,amount,type,category,created_at,'${currentMonth}'
      FROM transactions
    `)

    // 2️⃣ Delete current transactions
    await db.run(`DELETE FROM transactions`)

    res.send({message:"Monthly reset completed"})
    
  } catch (error) {
    res.status(500).send({error:error.message})
  }
})

app.get("/monthly-summary", authenticateToken, async (req, res) => {
  try {
    const data = await db.all(`
      SELECT 
        backup_month,
        SUM(CASE WHEN type='Expenses' THEN amount ELSE 0 END) as expenses,
        SUM(CASE WHEN type='Income' THEN amount ELSE 0 END) as income
      FROM transactions_backup
      GROUP BY backup_month
      ORDER BY backup_month DESC
    `);

    const result = data.map(each => ({
      month: each.backup_month,
      expenses: each.expenses,
      savings: each.income - each.expenses
    }));

    res.send(result);

  } catch (error) {
    res.status(500).send({ error: error.message });
  }
});

app.get("/monthly-details/:month", authenticateToken, async (req, res) => {
  const { month } = req.params;

  const data = await db.all(`
    SELECT * FROM transactions_backup
    WHERE backup_month = ?
  `, [month]);

  res.send({ transactions: data });
});

app.get("/export-month/:month", authenticateToken, async (req, res) => {
  const { month } = req.params;

  const data = await db.all(`
    SELECT * FROM transactions_backup
    WHERE backup_month = ?
  `, [month]);

  const ExcelJS = require("exceljs");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Monthly Report");

  sheet.columns = [
    { header: "Title", key: "title" },
    { header: "Category", key: "category" },
    { header: "Amount", key: "amount" },
    { header: "Type", key: "type" },
    { header: "Date", key: "date" },
  ];

  data.forEach(row => sheet.addRow(row));

  res.setHeader(
    "Content-Disposition",
    `attachment; filename=${month}.xlsx`
  );

  await workbook.xlsx.write(res);
  res.end();
});

app.delete("/transactions/:id", authenticateToken, async (req, res) => {
  const { id } = req.params
  const userId = req.user.id

  const deleteQuery = `
    DELETE FROM transactions
    WHERE id = ? AND user_id = ?
  `

  const result = await db.run(deleteQuery, [id, userId])

  if (result.changes === 0) {
    res.status(404).send({ error: "Transaction not found" })
  } else {
    res.send({ message: "Transaction deleted successfully" })
  }
})

module.exports = app;
