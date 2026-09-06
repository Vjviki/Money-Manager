import { useEffect, useState } from "react";
import "./index.css";

const LoadingState = ({ variant = "cards", rows = 3, label = "Loading your data..." }) => {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className={`loading-state loading-${variant}`} role="status" aria-live="polite">
      <div className="loading-buffer-line"><span /></div>
      <div className="loading-skeletons">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="loading-skeleton" key={index}>
            <div className="loading-skeleton-icon" />
            <div className="loading-skeleton-copy">
              <div className="loading-skeleton-line wide" />
              <div className="loading-skeleton-line short" />
            </div>
          </div>
        ))}
      </div>
      <p className="loading-label">{slow ? "This is taking a little longer than usual. Please keep the app open." : label}</p>
    </div>
  );
};

export default LoadingState;
