import { Component } from "react";
import Cookies from "js-cookie";

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

class MoneyManager extends Component {
  state = {
    transactionsList: [],
    titleInput: "",
    amountInput: "",
    dateInput: "",
    category: "Food",
    customCategory: "",
    optionId: transactionTypeOptions[0].optionId,
    profileData: {},
    userTransaction: {},
    filterType: "ALL",
    filterMonth: "",
  };

  componentDidMount() {
    this.fetchUserData();
  }

  fetchUserData = async () => {
    // 1️⃣ Fetch profile
    try {
      const url = "http://localhost:3000/profile";
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
      this.setState({ profileData });

      // 2️⃣ Fetch transaction summary (income/expenses/balance)

      const userUrl = "http://localhost:3000/";
      const userResponse = await fetch(userUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      const userData = await userResponse.json();
      this.setState({ userTransaction: userData });

      // 3️⃣ Fetch transaction list

      const urlTransactions = "http://localhost:3000/transactions";
      const optionsTrans = {
        method: "GET",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      };

      const responseTrans = await fetch(urlTransactions, optionsTrans);
      const transactionsData = await responseTrans.json();

      this.setState({ transactionsList: transactionsData.transactions });
    } catch (error) {
      console.error("Error fetching user data:", error);
    }
  };

  deleteTransaction = async (id) => {
    try {
      const jwtToken = Cookies.get("jwt_token");

      const url = `http://localhost:3000/transactions/${id}`;

      const options = {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      };

      const response = await fetch(url, options);

      if (response.ok) {
        const { transactionsList } = this.state;

        const updatedList = transactionsList.filter((each) => each.id !== id);

        this.setState({ transactionsList: updatedList });

        // refresh summary (balance, income, expenses)
        this.fetchUserData();
      } else {
        console.log("Failed to delete transaction");
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  onAddTransaction = async (event) => {
    event.preventDefault();
    const {
      titleInput,
      amountInput,
      optionId,
      dateInput,
      category,
      customCategory,
    } = this.state;
    if (titleInput === "") {
      alert("Please Enter Title");
      return;
    }

    if (amountInput === "") {
      alert("Please Enter Amount");
      return;
    }

    if (isNaN(amountInput)) {
      alert("Amount must be a valid number");
      return;
    }


    const finalCategory = category === "Custom" ? customCategory : category;

    const typeOption = transactionTypeOptions.find(
      (eachTransaction) => eachTransaction.optionId === optionId,
    );

    try {
      const jwtToken = Cookies.get("jwt_token");
      const url = `http://localhost:3000/`;
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
          date: dateInput,
        }),
      };

      const response = await fetch(url, options);
      if(response.ok){
        await this.fetchUserData

        this.setState({
        titleInput: "",
        amountInput: "",
        dateInput: "",
        category: "Food",
        customCategory: "",
        optionId: transactionTypeOptions[0].optionId,
      });
    } else {
      console.log("Failed to add transaction");
    }
    } catch (error) {
      console.error("Error adding transaction:", error);
    }
  };

  onChangeOptionId = (event) => {
    this.setState({ optionId: event.target.value });
  };

  onChangeAmountInput = (event) => {
    this.setState({ amountInput: event.target.value });
  };

  onChangeDateInput = (event) => {
    this.setState({ dateInput: event.target.value });
  };

  onChangeTitleInput = (event) => {
    this.setState({ titleInput: event.target.value });
  };

  onChangeNewCategory = (event) => {
    this.setState({ customCategory: event.target.value });
  };

  onChangeCategory = (event) => {
    this.setState({ category: event.target.value });
  };

  onChangeFilterType = (event) => {
    this.setState({ filterType: event.target.value });
  };

  onChangeFilterMonth = (event) => {
    this.setState({ filterMonth: event.target.value });
  };

  getFilteredTransactions = () => {
    const { transactionsList, filterType, filterMonth } = this.state;

    return transactionsList.filter((each) => {
      const typeMatch = filterType === "ALL" || each.type === filterType;

      const monthMatch =
        !filterMonth || each.created_at?.startsWith(filterMonth);
      return typeMatch && monthMatch;
    });
  };

  resetMonth = async () => {
    const confirmReset = window.confirm(
      "Are you sure you want to reset this month?",
    );

    if (!confirmReset) {
      return; // stop if user clicks Cancel
    }

    try {
      const jwtToken = Cookies.get("jwt_token");

      const response = await fetch("http://localhost:3000/reset-month", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
        },
      });

      if (response.ok) {
        alert("Month reset completed");
        this.fetchUserData();
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

  render() {
    const {
      titleInput,
      amountInput,
      optionId,
      category,
      customCategory,
      profileData,
      userTransaction,
    } = this.state;
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
            />
            <div className="transaction-details">
              <form
                className="transaction-form"
                onSubmit={this.onAddTransaction}
              >
                <h1 className="transaction-header">Add Transaction</h1>
                <label className="input-label" htmlFor="title">
                  TITLE
                </label>
                <input
                  type="text"
                  id="title"
                  value={titleInput}
                  onChange={this.onChangeTitleInput}
                  className="input"
                  placeholder="TITLE"
                />
                <label className="input-label">CATEGORY</label>

                <select
                  className="input"
                  value={category}
                  onChange={this.onChangeCategory}
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
                    onChange={this.onChangeNewCategory}
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
                  onChange={this.onChangeAmountInput}
                  placeholder="AMOUNT"
                />
                <label className="input-label" htmlFor="date">
                  DATE
                </label>
                <input
                  type="date"
                  id="date"
                  className="input"
                  value={this.state.dateInput}
                  onChange={this.onChangeDateInput}
                />
                <label className="input-label" htmlFor="select">
                  TYPE
                </label>
                <select
                  id="select"
                  className="input"
                  value={optionId}
                  onChange={this.onChangeOptionId}
                >
                  {transactionTypeOptions.map((eachOption) => (
                    <option
                      key={eachOption.optionId}
                      value={eachOption.optionId}
                    >
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
                    <select onChange={this.onChangeFilterType}>
                      <option value="ALL">All</option>
                      <option value="Income">Income</option>
                      <option value="Expenses">Expenses</option>
                    </select>

                    <input type="month" onChange={this.onChangeFilterMonth} />
                  </div>
                  <button className="reset-btn" onClick={this.resetMonth}>
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
                    {this.getFilteredTransactions().map((eachTransaction) => (
                      <TransactionItem
                        key={eachTransaction.id}
                        transactionDetails={eachTransaction}
                        deleteTransaction={this.deleteTransaction}
                      />
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }
}

export default MoneyManager;
