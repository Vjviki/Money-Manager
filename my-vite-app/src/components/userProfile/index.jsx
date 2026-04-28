import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import "./index.css";

const UserProfileDetails = () => {
  const [userData, setUserData] = useState({});

  useEffect(() => {
    userProfile();
  }, []);

  const userProfile = async () => {
    try {
      const url = "http://localhost:3000/profile";
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
        setUserData(data);
        console.log(data)
      } else {
        console.log("Profile Data Error");
      }
    } catch (error) {
      console.log("Server Error", error);
    }
  };
  return (
    <div className="profile-container">
      <h1 className="profile-title">Profile</h1>

      {/* Profile Header */}
      <div className="profile-header">
        <img
          src="https://i.pravatar.cc/150"
          alt="profile"
          className="profile-img"
        />

        <div className="profile-info">
          <h2>{userData.name}</h2>
          <p>{userData.email}</p>
          <p>+91 987654321</p>
        </div>
      </div>

      {/* Account Summary */}
      <div className="account-summary">
        <h2>Account Summary</h2>

        <div className="summary-cards">
          <div className="card">
            <p>Total Balance</p>
            <h3>₹50,000</h3>
          </div>

          <div className="card">
            <p>Monthly Income</p>
            <h3>₹25,000</h3>
          </div>

          <div className="card">
            <p>Monthly Expense</p>
            <h3>₹15,000</h3>
          </div>

          <div className="card">
            <p>Savings</p>
            <h3>₹10,000</h3>
          </div>
        </div>
      </div>

      {/* Profile Information */}
      <div className="profile-details">
        <h2>Profile Information</h2>

        <div className="details-item">
          <span>Name:</span>
          <span>{userData.name}</span>
        </div>

        <div className="details-item">
          <span>Email:</span>
          <span>{userData.email}</span>
        </div>

        <div className="details-item">
          <span>Phone:</span>
          <span>+91 987654321</span>
        </div>

        <div className="details-item">
          <span>Location:</span>
          <span>Chennai</span>
        </div>
      </div>
    </div>
  );
};

export default UserProfileDetails;
