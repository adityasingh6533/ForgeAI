import "./architecture.css";

function labelFromResult(result, index) {
  if (result?.type === "http") {
    const method = result?.method || "HTTP";
    const url = result?.url || result?.command || "request";
    return `${index + 1}. ${method} ${url}`;
  }
  const command = String(result?.command || "").trim();
  return `${index + 1}. ${command || "shell command"}`;
}

export default function ArchitectureView({ task = "", results = [] }) {
  if (!Array.isArray(results) || !results.length) {
    return (
      <div className="arch">
        <div className="arch-box">
          {task ? `No live execution results yet for: ${task}` : "No live execution results yet"}
        </div>
      </div>
    );
  }

  return (
    <div className="arch">
      {results.map((result, index) => (
        <div key={`${result?.command || result?.url || "result"}-${index}`}>
          <div className="arch-box">{labelFromResult(result, index)}</div>
          {index < results.length - 1 && <div className="arch-arrow">v</div>}
        </div>
      ))}
    </div>
  );
}
