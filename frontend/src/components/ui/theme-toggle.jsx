import * as React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { cn } from '@/lib/utils';

export function ThemeToggle({ variant = 'pill', className, ...props }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={toggleTheme}
        className={cn(
          'inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#112239] text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-[#1B314F] shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0F766E]',
          className
        )}
        aria-label={isDark ? 'Switch to Standard Light Mode' : 'Switch to Low-Glare Dark Mode (Reduced Eyestrain Support)'}
        title={isDark ? 'Switch to Standard Light Mode' : 'Switch to Low-Glare Dark Mode (Reduced Eyestrain Support)'}
        {...props}
      >
        {isDark ? (
          <Sun className="w-4 h-4 text-amber-400 transition-transform duration-200 hover:rotate-45" />
        ) : (
          <Moon className="w-4 h-4 text-[#0F766E] transition-transform duration-200 hover:-rotate-12" />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#112239] text-[#0F172A] dark:text-[#F8FAFC] hover:bg-slate-100 dark:hover:bg-[#1B314F] text-xs font-semibold shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#0F766E]',
        className
      )}
      aria-label={isDark ? 'Switch to Standard Light Mode' : 'Switch to Low-Glare Dark Mode (Reduced Eyestrain Support)'}
      title={isDark ? 'Switch to Standard Light Mode' : 'Switch to Low-Glare Dark Mode (Reduced Eyestrain Support)'}
      {...props}
    >
      {isDark ? (
        <>
          <Sun className="w-4 h-4 text-amber-400" />
          <span className="font-medium">Light Mode</span>
        </>
      ) : (
        <>
          <Moon className="w-4 h-4 text-[#0F766E]" />
          <span className="font-medium">Dark Mode</span>
        </>
      )}
    </button>
  );
}
