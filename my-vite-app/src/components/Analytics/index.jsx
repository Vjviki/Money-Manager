import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

import "./index.css";

const COLORS = [
  "#4f46e5",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#06b6d4",
  "#a855f7",
  "#84cc16",
];

const Analytics = () => {
  const [summaryData, setSummaryData] = useState([]);
  const [categoryData, setCategoryData] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthDetails, setMonthDetails] = useState([]);
  const [monthlyData, setMontlyData] = useState([]);
  const [error, setError] = useState([]);

  const categoryTotals = monthDetails
    .filter((item) => item.type === "Expenses")
    .reduce((acc, curr) => {
      const category = curr.category || "Other";
      if (!acc[category]) {
        acc[category] = 0;
      }

      acc[category] += curr.amount;

      return acc;
    }, {});

  const categoryArray = Object.entries(categoryTotals);

  useEffect(() => {
    fetchAnalytics();
    analyticsData();
    fetchDate();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const jwtToken = Cookies.get("jwt_token");
      const url = "http://localhost:3000/";

      // now use user id
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      const data = await response.json();

      if (response.ok) {
        const formattedData = [
          { name: "Income", amount: data.income },
          { name: "Expenses", amount: data.expenses },
          { name: "Balance", amount: data.balance },
        ];

        setSummaryData(formattedData);
      }
    } catch (error) {
      console.log("Analytics error:", error);
    }
  };

  const analyticsData = async () => {
    const url = "http://localhost:3000/analytics";
    const jwtToken = Cookies.get("jwt_token");
    try {
      const options = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      };

      const response = await fetch(url, options);
      const data = await response.json();

      if (!response.ok) {
        throw new Error("Failed to fetch analytics");
      }
      setCategoryData(data);
      setError(null);
    } catch (err) {
      console.error("Analytics error:", err);
      setError("Failed to load analytics");
    }
  };

  const openDetails = async (month) => {
    setSelectedMonth(month);

    const jwtToken = Cookies.get("jwt_token");

    const response = await fetch(
      `http://localhost:3000/monthly-details/${month}`,
      {
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      },
    );

    const data = await response.json();
    setMonthDetails(data.transactions);
  };

  const downloadMonth = async (month) => {
    const jwtToken = Cookies.get("jwt_token");
    try {
      const response = await fetch(
        `http://localhost:3000/export-month/${month}`,
        {
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error("Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${month}.xlsx`;
      a.click();

      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      alert("Download failed. Try again.");
    }
  };

  const fetchDate = async () => {
    const url = "http://localhost:3000/monthly-summary";
    const jwtToken = Cookies.get("jwt_token");

    const options = {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    };

    const response = await fetch(url, options);
    const data = await response.json();
    setMontlyData(data);
  };

  return (
    <div className="analytics-container">
      <div className="analytics-wrapper">
        <h1 className="analytics-title">Financial Analytics</h1>
        <p className="analytics-subtitle">
          Track your income, expenses and savings insights
        </p>
        <div className="chart-grid">
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={summaryData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="amount" fill="#4f46e5" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-card">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart width={400} height={300}>
                <Pie
                  data={categoryData}
                  dataKey="total"
                  nameKey="category"
                  outerRadius="80%"
                  label
                >
                  {categoryData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="history-card">
        <h2 className="section-title">Past Transactions</h2>
        {monthlyData.map((item) => (
          <div className="month-card" key={item.month}>
            <h3>{item.month}</h3>
            <p>Expenses: ₹{item.expenses}</p>
            <p>Savings: ₹{item.savings}</p>

            <button
              className="view-btn"
              onClick={() => openDetails(item.month)}
            >
              📊 View Details
            </button>
          </div>
        ))}
        {selectedMonth && (
          <div className="modal">
            <div className="modal-content">
              <div className="modal-header">
                <h3>📅 {selectedMonth}</h3>
              </div>
              <div className="modal-body">
                {monthDetails.map((item) => (
                  <div key={item.id} className="transaction-row">
                    <span className="title">{item.title}</span>
                    <span
                      className="amount"
                      style={{
                        color: item.type === "Income" ? "green" : "red",
                      }}
                    >
                      ₹{item.amount}
                    </span>
                    <span className="date">{item.date}</span>
                  </div>
                ))}
              </div>
              <div className="category-summary">
                <h3>💸 Expense by Category</h3>

                {categoryArray.length === 0 ? (
                  <p>No expense data</p>
                ) : (
                  categoryArray.map(([category, total]) => (
                    <div key={category} className="category-row">
                      <span>{category}</span>
                      <span>₹{total}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="modal-actions">
                <button
                  className="download-btn"
                  onClick={() => downloadMonth(selectedMonth)}
                >
                  ⬇ Download Excel
                </button>

                <button
                  className="close-btn"
                  onClick={() => setSelectedMonth(null)}
                >
                  ✖ Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Analytics;
