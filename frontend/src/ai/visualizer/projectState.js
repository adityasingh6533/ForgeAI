const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const initialProjectState = {
  clarity: 0,
  speed: 0,
  risk: 100,
  scalability: 0,
  complexity: 100,
  deliveryTime: 0,
  teamLoad: 0,
};

export function createProjectStateFromBoard(snapshot) {
  const steps = Array.isArray(snapshot?.steps) ? snapshot.steps : [];
  const done = Array.isArray(snapshot?.done) ? snapshot.done : [];
  const completionRatio = steps.length ? done.length / steps.length : 0;
  const pendingCount = Math.max(steps.length - done.length, 0);

  const deliveryTime = steps.length * 3;
  const clarity = clamp(Math.round(completionRatio * 60), 0, 100);
  const speed = clamp(Math.round(completionRatio * 70), 0, 100);
  const risk = clamp(100 - Math.round(completionRatio * 50), 0, 100);
  const scalability = clamp(Math.round(completionRatio * 55), 0, 100);
  const complexity = clamp(100 - Math.round(completionRatio * 40), 0, 100);
  const teamLoad = clamp(Math.round((pendingCount / Math.max(steps.length, 1)) * 100), 0, 100);

  return {
    clarity,
    speed,
    risk,
    scalability,
    complexity,
    deliveryTime,
    teamLoad,
  };
}

export function applyReviewResult(state, payload) {
  const next = { ...state };
  const status = String(payload?.status || "").toLowerCase();
  const evidenceScore = Number(payload?.evidence?.score || 0);

  if (status === "correct") {
    next.clarity += 10 + evidenceScore;
    next.speed += 8;
    next.risk -= 10;
    next.complexity -= 4;
    next.deliveryTime -= 1;
    next.teamLoad -= 6;
  } else if (status === "partial") {
    next.clarity += 4 + Math.floor(evidenceScore / 2);
    next.speed += 2;
    next.risk -= 3;
    next.deliveryTime -= 0.5;
  } else if (status === "wrong") {
    next.risk += 6;
    next.complexity += 4;
    next.teamLoad += 6;
  }

  Object.keys(next).forEach((key) => {
    if (key === "deliveryTime") {
      next[key] = Math.max(0, Number(next[key] || 0));
    } else {
      next[key] = clamp(Number(next[key] || 0), 0, 100);
    }
  });

  return next;
}

export function applyLiveTryResult(state, payload) {
  const next = { ...state };
  const ok = Boolean(payload?.ok);

  if (ok) {
    next.risk -= 8;
    next.speed += 6;
    next.clarity += 4;
    next.teamLoad -= 4;
  } else {
    next.risk += 8;
    next.complexity += 6;
    next.teamLoad += 6;
  }

  Object.keys(next).forEach((key) => {
    if (key === "deliveryTime") {
      next[key] = Math.max(0, Number(next[key] || 0));
    } else {
      next[key] = clamp(Number(next[key] || 0), 0, 100);
    }
  });

  return next;
}

export function predictProjectOutcome(state) {
  const executionHealth =
    state.clarity * 0.22 +
    state.speed * 0.2 +
    state.scalability * 0.16 +
    (100 - state.risk) * 0.18 +
    (100 - state.teamLoad) * 0.12 +
    (100 - state.complexity) * 0.12;

  const score = clamp(Math.round(executionHealth), 0, 100);
  const deliveryFactor = clamp(Math.round(100 - state.deliveryTime), 0, 100);
  const successProbability = clamp(Math.round(score * 0.75 + deliveryFactor * 0.25), 0, 100);

  let maturity = "Early Stage";
  if (score >= 80) maturity = "Production Ready";
  else if (score >= 60) maturity = "Structured";

  let direction = "At Risk";
  let summary = "Execution evidence is weak and risk is elevated.";

  if (score >= 80) {
    direction = "Elite Trajectory";
    summary = "Validated progress is strong with stable delivery confidence.";
  } else if (score >= 60) {
    direction = "Positive Growth";
    summary = "Execution is moving in the right direction with measurable proof.";
  } else if (score >= 40) {
    direction = "Unstable but Recoverable";
    summary = "Progress exists but needs stronger proof and validation consistency.";
  }

  return {
    score,
    successProbability,
    maturity,
    direction,
    summary,
    estimatedDelivery: Math.round(state.deliveryTime),
  };
}
