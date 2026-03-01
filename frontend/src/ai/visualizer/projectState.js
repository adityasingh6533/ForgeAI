export const ACTIONS = {
  ADD_KANBAN: "ADD_KANBAN",
  ADD_TIMELINE: "ADD_TIMELINE",
  ARCH_UPGRADE: "ARCH_UPGRADE",
  OPTIMIZE: "OPTIMIZE",
};

// ---------------- INITIAL WORLD ----------------

export const initialProjectState = {
  clarity: 50,
  speed: 50,
  risk: 50,
  scalability: 50,
  complexity: 50,
  deliveryTime: 90,
  teamLoad: 70,

  workflow: "chaotic",
  architecture: "monolith",
  tracking: "none",
  automation: false
};

// ---------------- IMPACT ENGINE ----------------

export function applyImpact(state, action) {

  let s = { ...state };

  switch(action){

    case "ADD_KANBAN":
      s.workflow = "kanban";
      s.clarity += 20;
      s.teamLoad -= 15;
      s.risk -= 10;
      s.speed += 10;
      break;

    case "ADD_TIMELINE":
      s.tracking = "timeline";
      s.clarity += 15;
      s.deliveryTime -= 15;
      s.risk -= 8;
      break;

    case "ARCH_UPGRADE":
      s.architecture = "client-server";
      s.scalability += 25;
      s.complexity -= 10;
      s.deliveryTime -= 20;
      break;

    case "OPTIMIZE":
      s.automation = true;
      s.speed += 20;
      s.teamLoad -= 20;
      s.deliveryTime -= 25;
      s.risk -= 10;
      break;

    default:
      return s;
  }

  // clamp numeric metrics
  Object.keys(s).forEach(key=>{
    if(typeof s[key] === "number"){
      if(key === "deliveryTime")
        s[key] = Math.max(10, s[key]);
      else
        s[key] = Math.max(0, Math.min(100, s[key]));
    }
  });

  return s;
}


// ---------------- AI PREDICTION ENGINE ----------------

export function predictProjectOutcome(state) {

  // weighted health calculation
  const executionHealth =
    state.clarity * 0.2 +
    state.speed * 0.2 +
    state.scalability * 0.2 +
    (100 - state.risk) * 0.15 +
    (100 - state.teamLoad) * 0.15 +
    (100 - state.complexity) * 0.1;

  const score = Math.max(0, Math.min(100, Math.round(executionHealth)));

  // probability of success (based on score + delivery time)
  const deliveryFactor = Math.max(0, 100 - state.deliveryTime);
  const successProbability = Math.round(
    (score * 0.7) + (deliveryFactor * 0.3)
  );

  // structural maturity
  let maturity = "Early Stage";

  if(state.workflow === "kanban" &&
     state.architecture === "client-server" &&
     state.tracking === "timeline" &&
     state.automation)
     maturity = "Production Ready";

  else if(state.workflow !== "chaotic")
     maturity = "Structured";

  // tier classification
  let direction = "At Risk";
  let summary = "Execution stability is low. High delivery uncertainty.";

  if(score >= 80){
    direction = "Elite Trajectory";
    summary = "System architecture and workflow are optimized. High execution reliability.";
  }
  else if(score >= 60){
    direction = "Positive Growth";
    summary = "Project is progressing well. Strategic refinements can unlock full potential.";
  }
  else if(score >= 40){
    direction = "Unstable but Recoverable";
    summary = "Structural improvements required to reduce delivery friction.";
  }

  return {
    score,
    successProbability,
    maturity,
    direction,
    summary,
    estimatedDelivery: state.deliveryTime
  };
}