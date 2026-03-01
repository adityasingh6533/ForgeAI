import { useEffect, useState } from "react";
import "./timeline.css";

const phases = [
  { name: "Planning", duration: 20 },
  { name: "Design", duration: 25 },
  { name: "Development", duration: 40 },
  { name: "Testing", duration: 20 },
  { name: "Deployment", duration: 15 }
];

export default function TimelineView({ day, playing }) {

  const [progressData, setProgressData] = useState(phases);

  useEffect(() => {
    if (!playing) return;

    setProgressData(prev =>
      prev.map((phase, index) => {
        const start = prev
          .slice(0, index)
          .reduce((acc, p) => acc + p.duration, 0);

        const end = start + phase.duration;

        let percent = 0;

        if (day >= end) percent = 100;
        else if (day > start)
          percent = ((day - start) / phase.duration) * 100;

        return { ...phase, progress: Math.min(percent, 100) };
      })
    );

  }, [day, playing]);

  return (
    <div className="timeline-container">
      {progressData.map((phase, i) => (
        <div key={i} className="timeline-row">

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
