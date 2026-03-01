import { useEffect, useState } from "react";
import "./Kanban.css";

const initialTasks = [
  { id: 1, name: "Setup Project", progress: 0 },
  { id: 2, name: "Authentication", progress: 0 },
  { id: 3, name: "Dashboard UI", progress: 0 },
  { id: 4, name: "API Integration", progress: 0 },
  { id: 5, name: "Deployment", progress: 0 }
];

export default function KanbanView({ day, playing }) {

  const [tasks, setTasks] = useState(initialTasks);

  // project total duration (same as engine max approx)
  const TOTAL_DAYS = 120;

  useEffect(() => {
    if (!playing) return;

    const percent = (day / TOTAL_DAYS) * 100;

    setTasks(prev =>
      prev.map((task, index) => ({
        ...task,
        progress: Math.min(100, percent - index * 15)
      }))
    );

  }, [day, playing]);

  // categorize
  const todo = tasks.filter(t => t.progress < 30);
  const progress = tasks.filter(t => t.progress >= 30 && t.progress < 80);
  const done = tasks.filter(t => t.progress >= 80);

  const renderTask = (task) => (
    <div key={task.id} className="task-card">
      <span>{task.name}</span>

      <div className="task-progress">
        <div
          className="task-fill"
          style={{ width: `${Math.max(0, task.progress)}%` }}
        />
      </div>
    </div>
  );

  return (
    <div className="kanban-board">

      <div className="kanban-col">
        <h3>TODO</h3>
        {todo.map(renderTask)}
      </div>

      <div className="kanban-col">
        <h3>IN PROGRESS</h3>
        {progress.map(renderTask)}
      </div>

      <div className="kanban-col">
        <h3>DONE</h3>
        {done.map(renderTask)}
      </div>

    </div>
  );
}