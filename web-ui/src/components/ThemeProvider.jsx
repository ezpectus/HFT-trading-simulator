import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

const ThemeContext = createContext(null);

export const THEMES = {
  DARK: 'dark',
  LIGHT: 'light',
  AUTO: 'auto',
};

const DARK_CSS = `
  :root {
    --bg-primary: #0f0f23;
    --bg-secondary: #1a1a2e;
    --bg-tertiary: #1e1e3a;
    --bg-card: #1a1a2e;
    --text-primary: #ffffff;
    --text-secondary: #a0a0b8;
    --text-muted: #666680;
    --border-color: #2a2a4a;
    --accent: #2196F3;
    --accent-hover: #1976D2;
    --success: #00C853;
    --danger: #FF1744;
    --warning: #FFB300;
    --info: #2196F3;
    --shadow: rgba(0,0,0,0.3);
  }
`;

const LIGHT_CSS = `
  :root {
    --bg-primary: #f5f5f7;
    --bg-secondary: #ffffff;
    --bg-tertiary: #e8e8ed;
    --bg-card: #ffffff;
    --text-primary: #1a1a2e;
    --text-secondary: #555566;
    --text-muted: #888899;
    --border-color: #d0d0db;
    --accent: #2196F3;
    --accent-hover: #1976D2;
    --success: #00C853;
    --danger: #FF1744;
    --warning: #FFB300;
    --info: #2196F3;
    --shadow: rgba(0,0,0,0.08);
  }
`;

export function ThemeProvider({ children, defaultTheme = 'auto' }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem('hft-theme') || defaultTheme;
  });
  const [systemDark, setSystemDark] = useState(
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => setSystemDark(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const effectiveTheme = theme === 'auto' ? (systemDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const styleId = 'hft-theme-vars';
    let style = document.getElementById(styleId);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = effectiveTheme === 'dark' ? DARK_CSS : LIGHT_CSS;
    document.body.classList.toggle('dark-theme', effectiveTheme === 'dark');
    document.body.classList.toggle('light-theme', effectiveTheme === 'light');
  }, [effectiveTheme]);

  const setTheme = useCallback((newTheme) => {
    setThemeState(newTheme);
    localStorage.setItem('hft-theme', newTheme);
  }, []);

  const value = {
    theme,
    effectiveTheme,
    setTheme,
    isDark: effectiveTheme === 'dark',
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const options = [
    { value: 'light', icon: Sun, label: 'Light' },
    { value: 'auto', icon: Monitor, label: 'Auto' },
    { value: 'dark', icon: Moon, label: 'Dark' },
  ];

  return (
    <div className="theme-toggle">
      {options.map(({ value, icon: Icon, label }) => (
        <button
          key={value}
          className={`theme-btn ${theme === value ? 'active' : ''}`}
          onClick={() => setTheme(value)}
          title={label}
        >
          <Icon size={16} />
        </button>
      ))}
    </div>
  );
}
