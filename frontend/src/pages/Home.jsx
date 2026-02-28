import "../styles/Home.css";

export default function Home() {
  return (
    <div className="home">

      <div className="hero">
        <h1>Build Projects Without Getting Stuck</h1>
        <p>
          Turn your idea into a clear execution roadmap —
          features, APIs, database, and next steps instantly.
        </p>

        <button className="cta-btn" onClick={()=> window.location.href="/generate"}>
          Start With Your Idea
        </button>
      </div>

      <div className="section">
        <h2>What This Solves</h2>

        <div className="grid">
          <div className="card">
            <h3>Confusion After Idea</h3>
            <p>You know what to build, but not what to do next.</p>
          </div>

          <div className="card">
            <h3>Random Tutorials</h3>
            <p>No more YouTube hopping and incomplete projects.</p>
          </div>

          <div className="card">
            <h3>Execution Gap</h3>
            <p>We convert ideas into step-by-step build plan.</p>
          </div>
        </div>
      </div>

      <div className="section">
        <h2>What You Get</h2>

        <div className="grid">
          <div className="card small">Features List</div>
          <div className="card small">Database Schema</div>
          <div className="card small">API Structure</div>
          <div className="card small">Execution Roadmap</div>
        </div>
      </div>

    </div>
  );
}