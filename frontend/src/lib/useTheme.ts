"use client";
import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // Read saved preference or system preference
    const saved = localStorage.getItem("prologweb_theme") as Theme | null;
    const initial: Theme =
      saved ?? (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
    apply(initial);
    setTheme(initial);
  }, []);

  function apply(t: Theme) {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("prologweb_theme", t);
  }

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    apply(next);
    setTheme(next);
  }

  return { theme, toggle };
}
