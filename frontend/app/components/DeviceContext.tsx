"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

type DeviceContextType = {
  selectedDeviceId: string;
  setSelectedDeviceId: (id: string) => void;
};

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string>("FAN-001");

  useEffect(() => {
    // Load saved device ID on mount
    const saved = localStorage.getItem("selectedDeviceId");
    if (saved) {
      setSelectedDeviceIdState(saved);
    }
  }, []);

  const setSelectedDeviceId = (id: string) => {
    setSelectedDeviceIdState(id);
    localStorage.setItem("selectedDeviceId", id);
  };

  return (
    <DeviceContext.Provider value={{ selectedDeviceId, setSelectedDeviceId }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  const context = useContext(DeviceContext);
  if (!context) {
    throw new Error("useDevice must be used within a DeviceProvider");
  }
  return context;
}
