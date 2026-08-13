import { useState } from "react";
import { EyeIcon, EyeOff } from "lucide-react";
import "./index.css";

const MoneyDetails = (props) => {
  const { balanceAmount, incomeAmount, expensesAmount, loading } = props;
  const [isHidden, setIsHidden] = useState(false);

  const hideShow = () => {
    setIsHidden((prevState) => !prevState);
  };

  return (
    <div className="money-details-container">
      <div className="balance-container">
        <img
          src="https://assets.ccbp.in/frontend/react-js/money-manager/balance-image.png"
          alt="balance"
          className="details-img"
        />
        <div>
          <p className="details-text">Your Balance</p>
          {loading ? (
            <div className="loader-container-details">
              <div className="spinner-details"></div>
            </div>
          ) : (
            <div className="amount-container">
              <p className="details-money" data-testid="balanceAmount">
                {isHidden ? `Rs ${balanceAmount}` : "Rs ****"}
              </p>
              <button
                type="button"
                className="hide-show-button"
                onClick={hideShow}
                aria-label={isHidden ? "Show Balance" : "Hide Balance"}
              >
                {isHidden ? (
                  <EyeIcon className="eye-icon" />
                ) : (
                  <EyeOff className="eye-icon" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="income-container">
        <img
          src="https://assets.ccbp.in/frontend/react-js/money-manager/income-image.png"
          alt="income"
          className="details-img"
        />
        <div>
          <p className="details-text">Your Income</p>
          {loading ? (
            <div className="loader-container-details">
              <div className="spinner-details"></div>
            </div>
          ) : (
            <div className="amount-container">
              <p className="details-money" data-testid="incomeAmount">
                {isHidden ? `Rs ${incomeAmount}` : "Rs ****"}
              </p>
              <button
                type="button"
                className="hide-show-button"
                onClick={hideShow}
                aria-label={isHidden ? "Show Balance" : "Hide Balance"}
              >
                {isHidden ? (
                  <EyeIcon className="eye-icon" />
                ) : (
                  <EyeOff className="eye-icon" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="expenses-container">
        <img
          src="https://assets.ccbp.in/frontend/react-js/money-manager/expenses-image.png"
          alt="expenses"
          className="details-img"
        />
        <div>
          <p className="details-text">Your Expenses</p>
          {loading ? (
            <div className="loader-container-details">
              <div className="spinner-details"></div>
            </div>
          ) : (
            <div className="amount-container">
              <p className="details-money" data-testid="expensesAmount">
                {isHidden ? `Rs ${expensesAmount}` : "Rs ****"}
              </p>
              <button
                type="button"
                className="hide-show-button"
                onClick={hideShow}
                aria-label={isHidden ? "Show Balance" : "Hide Balance"}
              >
                {isHidden ? (
                  <EyeIcon className="eye-icon" />
                ) : (
                  <EyeOff className="eye-icon" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MoneyDetails;
