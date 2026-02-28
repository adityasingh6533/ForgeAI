import { Routes, Route } from "react-router-dom";
import "./App.css";
import Home from "./pages/Home";
import Generate from "./pages/Generate";
import Thinking from "./pages/Thinking";
import Plan from "./pages/Plan";
import Board from "./pages/Board";

function App() {
  return (
    <div className="App">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/generate" element={<Generate />} />
        <Route path="/thinking" element={<Thinking />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/board" element={<Board />} />
      </Routes>
    </div>
  );
}

export default App;
