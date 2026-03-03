import "./Kanban.css";

function toTask(name, progress, key) {
  return { id: `${name}-${key}`, name, progress };
}

export default function KanbanView({ todo = [], doing = null, done = [] }) {
  const todoTasks = todo.map((task, index) => toTask(task, 0, index));
  const inProgressTasks = doing ? [toTask(doing, 55, "doing")] : [];
  const doneTasks = done.map((task, index) => toTask(task, 100, index));

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
        {todoTasks.map(renderTask)}
      </div>

      <div className="kanban-col">
        <h3>IN PROGRESS</h3>
        {inProgressTasks.map(renderTask)}
      </div>

      <div className="kanban-col">
        <h3>DONE</h3>
        {doneTasks.map(renderTask)}
      </div>

    </div>
  );
}
