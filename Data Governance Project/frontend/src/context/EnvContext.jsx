import { createContext, useContext, useState } from "react";

const EnvContext = createContext(null);

export function EnvProvider({ children }) {
  const [activeEnv, setActiveEnv] = useState(null); // full datasource object

  return (
    <EnvContext.Provider value={{ activeEnv, setActiveEnv }}>
      {children}
    </EnvContext.Provider>
  );
}

export function useEnv() {
  return useContext(EnvContext);
}
