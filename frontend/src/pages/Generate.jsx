import "../styles/Generate.css";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Generate() {
  const [idea, setIdea] = useState("");
  const navigate = useNavigate();


  const handleGenerate = () => {
    if (!idea.trim()) return alert("Enter your idea first");
    console.log("Idea:", idea);
    navigate("/thinking", { state: { idea: idea.trim() } });
  };

  return (
    <div className="generate-page">
      <div className="generate-box">
        <h1>What do you want to build?</h1>

        <textarea
          placeholder="Example: A platform where students can share handwritten notes and earn rewards..."
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
        />

        <button onClick={handleGenerate}>Generate Execution Plan</button>
      </div>
    </div>
  );
}
