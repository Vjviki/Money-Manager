import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Cookies from "js-cookie";
import { Search } from "lucide-react";

import TransactionItem from "../TransactionItem";
import MoneyDetails from "../MoneyDetails";

import "./index.css";

const transactionTypeOptions = [
  {
    optionId: "INCOME",
    displayText: "Income",
  },
  {
    optionId: "EXPENSES",
    displayText: "Expenses",
  },
];

const MoneyManager = () => {
  const [transactionsList, setTransactionsList] = useState([]);
  const [titleInput, setTitleInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [dateInput, setDateInput] = useState("");
  const [category, setCategory] = useState("Food");
  const [customCategory, setCustomCategory] = useState("");
  const [optionId, setOptionId] = useState(transactionTypeOptions[0].optionId);
  const [profileData, setProfileData] = useState({});
  const [userTransaction, setUserTransaction] = useState({});
  const [filterType, setFilterType] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUserData();
  }, []);

  const fetchUserData = async () => {
    // 1️⃣ Fetch profile
    try {
      setLoading(true);
      const url = "https://money-manager-wmon.onrender.com/profile";
      const jwtToken = Cookies.get("jwt_token");

      const options = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      };

      const profileResponse = await fetch(url, options);

      if (!profileResponse.ok) {
        console.error("Failed to fetch profile");
        return;
      }

      const profileData = await profileResponse.json();
      setProfileData(profileData);

      // 2️⃣ Fetch transaction summary (income/expenses/balance)

      const userUrl = "https://money-manager-wmon.onrender.com/";
      const userResponse = await fetch(userUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      const userData = await userResponse.json();
      setUserTransaction(userData);

      // 3️⃣ Fetch transaction list

      const urlTransactions =
        "https://money-manager-wmon.onrender.com/transactions";
      const optionsTrans = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      };

      const responseTrans = await fetch(urlTransactions, optionsTrans);
      const transactionsData = await responseTrans.json();
      console.log("History:", transactionsData);

      setTransactionsList(transactionsData.transactions);
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteTransaction = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure want to delete this transaction?",
    );

    if (!confirmDelete) {
      return;
    }
    try {
      const jwtToken = Cookies.get("jwt_token");

      const url = `https://money-manager-wmon.onrender.com/transactions/${id}`;

      const options = {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      };

      const response = await fetch(url, options);

      if (response.ok) {
        const updatedList = transactionsList.filter((each) => each._id !== id);

        setTransactionsList(updatedList);

        // refresh summary (balance, income, expenses)
        fetchUserData();
      } else {
        console.log("Failed to delete transaction");
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const onAddTransaction = async (event) => {
    event.preventDefault();
    if (titleInput === "") {
      toast.error("Please Enter a Title");
      return;
    }

    if (amountInput === "") {
      toast.error("Please Enter a Amount");
      return;
    }

    if (isNaN(amountInput)) {
      toast.error("Amount must be a valid number");
      return;
    }

    const finalCategory = category === "Custom" ? customCategory : category;

    const typeOption = transactionTypeOptions.find(
      (eachTransaction) => eachTransaction.optionId === optionId,
    );

    try {
      const jwtToken = Cookies.get("jwt_token");
      const url = `https://money-manager-wmon.onrender.com/`;
      const options = {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: titleInput,
          amount: parseInt(amountInput),
          type: typeOption.displayText,
          category: finalCategory,
          created_at: dateInput,
        }),
      };

      const response = await fetch(url, options);
      if (response.ok) {
        (setTitleInput(""),
          setAmountInput(""),
          setDateInput(""),
          setCategory("Food"),
          setCustomCategory(""),
          setOptionId(transactionTypeOptions[0].optionId));

        await fetchUserData();
        toast.success("Transaction added!");
      } else {
        toast.error("Failed to add transaction");
      }
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  console.log("Data:", transactionsList);

  const getFilteredTransactions = () => {
    return transactionsList.filter((each) => {
      const typeMatch = filterType === "ALL" || each.type === filterType;

      const queryMatch = !searchQuery || each.category?.startsWith(searchQuery);
      return typeMatch && queryMatch;
    });
  };

  const ITEMS_PER_PAGE = 10;
  const [page, setPage] = useState(1);
  const paginated = getFilteredTransactions().slice(
    (page - 1) * ITEMS_PER_PAGE,
    page * ITEMS_PER_PAGE,
  );

  const totalTransactions = getFilteredTransactions().length;

  const totalPages = Math.ceil(totalTransactions / ITEMS_PER_PAGE);

  const resetMonth = async () => {
    const confirmReset = window.confirm(
      "Are you sure you want to reset this month?",
    );

    if (!confirmReset) {
      return; // stop if user clicks Cancel
    }

    try {
      const jwtToken = Cookies.get("jwt_token");

      const response = await fetch(
        "https://money-manager-wmon.onrender.com/reset-month",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${jwtToken}`,
          },
        },
      );

      if (response.ok) {
        toast.success("Month reset completed");
        fetchUserData();
      }
    } catch (error) {
      console.log("Reset error:", error);
    }
  };

  // getExpenses = () => {
  //   const { transactionsList } = this.state;
  //   let expensesAmount = 0;

  //   transactionsList.forEach((eachTransaction) => {
  //     if (eachTransaction.type === transactionTypeOptions[1].displayText) {
  //       expensesAmount += eachTransaction.amount;
  //     }
  //   });

  //   return expensesAmount;
  // };

  // getIncome = () => {
  //   const { transactionsList } = this.state;
  //   let incomeAmount = 0;
  //   transactionsList.forEach((eachTransaction) => {
  //     if (eachTransaction.type === transactionTypeOptions[0].displayText) {
  //       incomeAmount += eachTransaction.amount;
  //     }
  //   });

  //   return incomeAmount;
  // };

  // getBalance = () => {
  //   const { transactionsList } = this.state;
  //   let balanceAmount = 0;
  //   let incomeAmount = 0;
  //   let expensesAmount = 0;

  //   transactionsList.forEach((eachTransaction) => {
  //     if (eachTransaction.type === transactionTypeOptions[0].displayText) {
  //       incomeAmount += eachTransaction.amount;
  //     } else {
  //       expensesAmount += eachTransaction.amount;
  //     }
  //   });

  //   balanceAmount = incomeAmount - expensesAmount;

  //   return balanceAmount;
  // };

  const SkeletonCard = () => (
    <div className="skeleton-card">
      <div className="skeleton-line w-40" />
      <div className="skeleton-line w-24 large" />
    </div>
  );

  const balanceAmount = userTransaction.balance;
  const incomeAmount = userTransaction.income;
  const expensesAmount = userTransaction.expenses;

  return (
    <>
      <div className="app-container">
        <div className="responsive-container">
          <div className="header-container">
            <h1 className="heading">Hi, {profileData.name}</h1>
            <p className="header-content">
              Welcome back to your
              <span className="money-manager-text"> Money Manager</span>
            </p>
          </div>
          <MoneyDetails
            balanceAmount={balanceAmount}
            incomeAmount={incomeAmount}
            expensesAmount={expensesAmount}
            loading={loading}
          />
          <div className="transaction-details">
            <form className="transaction-form" onSubmit={onAddTransaction}>
              <h1 className="transaction-header">Add Transaction</h1>
              <label className="input-label" htmlFor="title">
                TITLE
              </label>
              <input
                type="text"
                id="title"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                className="input"
                placeholder="TITLE"
              />
              <label className="input-label">CATEGORY</label>

              <select
                className="input"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="Food">Food</option>
                <option value="Entertainment">Entertainment</option>
                <option value="Medical">Medical</option>
                <option value="Transport">Transport</option>
                <option value="Education">Education</option>
                <option value="Shopping">Shopping</option>
                <option value="Salary">Salary</option>
                <option value="Other">Other</option>

                <option value="Custom">➕ Add New Category</option>
              </select>

              {category === "Custom" && (
                <input
                  type="text"
                  placeholder="Enter new category"
                  className="input"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                />
              )}

              <label className="input-label" htmlFor="amount">
                AMOUNT
              </label>
              <input
                type="text"
                id="amount"
                className="input"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="AMOUNT"
              />
              <label className="input-label" htmlFor="date">
                DATE
              </label>
              <input
                type="date"
                id="date"
                className="input"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
              />
              <label className="input-label" htmlFor="select">
                TYPE
              </label>
              <select
                id="select"
                className="input"
                value={optionId}
                onChange={(e) => setOptionId(e.target.value)}
              >
                {transactionTypeOptions.map((eachOption) => (
                  <option key={eachOption.optionId} value={eachOption.optionId}>
                    {eachOption.displayText}
                  </option>
                ))}
              </select>
              <button type="submit" className="button">
                Add
              </button>
            </form>
            <div className="history-transactions">
              <h1 className="transaction-header">History</h1>
              <div className="filter-container">
                <div className="filter-type-month">
                  <select onChange={(e) => setFilterType(e.target.value)}>
                    <option value="ALL">All</option>
                    <option value="Income">Income</option>
                    <option value="Expenses">Expenses</option>
                  </select>

                  <div className="search-box">
                    <Search className="search-icon" size={18}/>
                    <input
                      type="search"
                      placeholder="Search..."
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                <button className="reset-btn" onClick={resetMonth}>
                  Reset Month
                </button>
              </div>
              <div className="transactions-table-container">
                <ul className="transactions-table">
                  <li className="table-header">
                    <p className="table-header-cell">Title</p>
                    <p className="table-header-cell">Category</p>
                    <p className="table-header-cell">Amount</p>
                    <p className="table-header-cell">Type</p>
                    <p className="table-header-cell">Date</p>
                  </li>
                  {loading ? (
                    <>
                      <SkeletonCard />
                      <SkeletonCard />
                      <SkeletonCard />
                    </>
                  ) : (
                    paginated.map((eachTransaction) => (
                      <TransactionItem
                        key={eachTransaction._id}
                        transactionDetails={eachTransaction}
                        deleteTransaction={deleteTransaction}
                      />
                    ))
                  )}
                </ul>
                <div className="pagination-container">
                  <button
                    type="button"
                    disabled={page === 1}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous
                  </button>

                  <p>
                    Page {page} of {totalPages}
                  </p>

                  <button
                    type="button"
                    disabled={page === totalPages}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MoneyManager;
