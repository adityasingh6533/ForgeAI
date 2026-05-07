import "../styles/Generate.css";
import { useNavigate } from "react-router-dom";

export default function Countdown() {
  const navigate = useNavigate();

  return (
    <div className="generate-page">
      <div className="generate-box">
        <h1>Forge AI</h1>
        <textarea
          readOnly
          value="Your project workspace is ready. Start with an idea and let Forge turn it into a clean execution plan."
        />
        <button onClick={() => navigate("/generate")}>Start With Your Idea</button>
      </div>
    </div>
  );
}
