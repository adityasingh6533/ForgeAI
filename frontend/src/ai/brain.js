import React, { createContext, useContext, useEffect } from "react";

/*
GLOBAL AI BRAIN EVENT BUS
Board → emits
Visualization → listens
*/

const BrainContext = createContext(null);

const listeners = new Set();

// old system compatible emit
export function emitBrainEvent(event) {
  listeners.forEach((l) => l(event));
}

// new hook listener
export function useBrain(callback) {
  useEffect(() => {
    if (!callback) return;
    listeners.add(callback);
    return () => listeners.delete(callback);
  }, [callback]);
}

// dispatch (React way)
export function BrainProvider({ children }) {
  const dispatchAction = (event) => {
    emitBrainEvent(event);
  };

  return (
    <BrainContext.Provider value={{ dispatchAction }}>
      {children}
    </BrainContext.Provider>
  );
}

// components will use this
export function useBrainDispatch() {
  return useContext(BrainContext);
}
