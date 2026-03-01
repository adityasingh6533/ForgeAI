import "./architecture.css";

export default function ArchitectureView() {
  return (
    <div className="arch">
      <div className="arch-box">Client (React)</div>
      <div className="arch-arrow">v</div>

      <div className="arch-box">API Server (Node)</div>
      <div className="arch-arrow">v</div>

      <div className="arch-box">Database (MongoDB)</div>
    </div>
  );
}
