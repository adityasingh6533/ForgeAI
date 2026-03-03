import "./timeline.css";

export default function TimelineView({ steps = [], done = [], doing = null }) {
  const progressData = steps.map((step) => {
    if (done.includes(step)) {
      return { name: step, progress: 100 };
    }
    if (doing && step === doing) {
      return { name: step, progress: 55 };
    }
    return { name: step, progress: 0 };
  });

  return (
    <div className="timeline-container">
      {progressData.map((phase, index) => (
        <div key={`${phase.name}-${index}`} className="timeline-row">

          <span className="phase-name">
            {phase.name}
          </span>

          <div className="timeline-bar">
            <div
              className="timeline-fill"
              style={{ width: `${phase.progress || 0}%` }}
            />
          </div>

        </div>
      ))}
    </div>
  );
}
