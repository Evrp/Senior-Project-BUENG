import { createContext, useContext, useEffect, useState } from "react";

// สร้าง context
const ThemeContext = createContext();

// สร้าง provider
export const ThemeProvider = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem("darkMode") === "true";
  });

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (isDarkMode) {
      html.classList.add("dark");
      html.classList.add("dark-mode");
      body.classList.add("dark-mode");
    } else {
      html.classList.remove("dark");
      html.classList.remove("dark-mode");
      body.classList.remove("dark-mode");
    }
    localStorage.setItem("darkMode", isDarkMode);
  }, [isDarkMode]);

  return (
    <ThemeContext.Provider value={{ isDarkMode, setIsDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
};

// hook เรียกใช้ theme ได้ง่าย ๆ
// eslint-disable-next-line react-refresh/only-export-components
export const useTheme = () => useContext(ThemeContext);
