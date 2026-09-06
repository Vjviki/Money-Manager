import {
  Banknote,
  Car,
  CircleDollarSign,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Pencil,
  ShoppingBag,
  Trash2,
  Utensils,
} from "lucide-react";

import "./index.css";

const categoryConfig = {
  Food: { Icon: Utensils, className: "category-food" },
  Entertainment: { Icon: Gamepad2, className: "category-entertainment" },
  Medical: { Icon: HeartPulse, className: "category-medical" },
  Transport: { Icon: Car, className: "category-transport" },
  Education: { Icon: GraduationCap, className: "category-education" },
  Shopping: { Icon: ShoppingBag, className: "category-shopping" },
  Salary: { Icon: Banknote, className: "category-salary" },
};

const TransactionItem = (props) => {
  const { transactionDetails, deleteTransaction, editTransaction } = props;
  const { _id, title, amount, type, created_at, category } = transactionDetails;

  const config = categoryConfig[category] || {
    Icon: CircleDollarSign,
    className: "category-other",
  };
  const CategoryIcon = config.Icon;

  const transactionDate = new Date(created_at);
  const day = transactionDate.toLocaleDateString("en-IN", { day: "2-digit" });
  const monthYear = transactionDate.toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });

  const isIncome = type === "Income";

  return (
    <li className="table-row">
      <div className="transaction-date-cell">
        <span className="transaction-day">{day}</span>
        <span className="transaction-month-year">{monthYear}</span>
      </div>

      <div className="transaction-title-cell">
        <div className={`category-icon-wrap ${config.className}`}>
          <CategoryIcon size={20} strokeWidth={2.2} />
        </div>
        <div className="transaction-title-content">
          <p className="transaction-title">{title}</p>
          <span className={`category-badge ${config.className}`}>{category}</span>
        </div>
      </div>

      <p className={`transaction-amount ${isIncome ? "income-amount" : "expense-amount"}`}>
        ₹ {Number(amount).toLocaleString("en-IN")}
      </p>

      <div className="transaction-type-cell">
        <span className={`type-badge ${isIncome ? "income-badge" : "expense-badge"}`}>
          {isIncome ? "Income" : "Expense"}
        </span>
      </div>

      <div className="transaction-actions">
        <button
          className="edit-button"
          type="button"
          onClick={() => editTransaction(transactionDetails)}
          aria-label={`Edit ${title}`}
        >
          <Pencil size={18} strokeWidth={2.2} />
        </button>
        <button
          className="delete-button"
          type="button"
          onClick={() => deleteTransaction(_id)}
          data-testid="delete"
          aria-label={`Delete ${title}`}
        >
          <Trash2 size={18} strokeWidth={2.2} />
        </button>
      </div>
    </li>
  );
};

export default TransactionItem;
