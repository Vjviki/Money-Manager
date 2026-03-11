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

  useEffect(() => {
    fetchAnalytics();
    analyticsData();
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

    const options = {
      method: "GET",
      headers: {
        Authorization: `Bearer ${jwtToken}`,
      },
    };

    const response = await fetch(url, options);
    const data = await response.json();

    if (response.ok) {
      setCategoryData(data);
    }
  };

  return (
    <div className="analytics-container">
      <h1 className="analytics-title">Financial Analytics</h1>

      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={summaryData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="amount" fill="#4f46e5" />
        </BarChart>
        <PieChart width={400} height={300}>
          <Pie
            data={categoryData}
            dataKey="total"
            nameKey="category"
            outerRadius={120}
            fill="#8884d8"
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
  );
};

export default Analytics;
