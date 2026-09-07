import { Toaster as Sonner, toast } from 'sonner'
import { useTheme } from '../../context/ThemeContext'

const Toaster = ({ ...props }) => {
  const { theme = 'light' } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white dark:group-[.toaster]:bg-[#112239] group-[.toaster]:text-[#0F172A] dark:group-[.toaster]:text-[#F8FAFC] group-[.toaster]:border-[#E2E8F0] dark:group-[.toaster]:border-[#1E3A5F] group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:font-sans',
          description: 'group-[.toast]:text-[#475569] dark:group-[.toast]:text-[#94A3B8]',
          actionButton:
            'group-[.toast]:bg-[#0F766E] group-[.toast]:text-white font-medium',
          cancelButton:
            'group-[.toast]:bg-slate-100 dark:group-[.toast]:bg-[#1B314F] group-[.toast]:text-slate-700 dark:group-[.toast]:text-slate-200',
          success: 'group-[.toast]:border-[#A3E3CD] dark:group-[.toast]:border-[#065F46] group-[.toast]:text-[#1D9E75] dark:group-[.toast]:text-[#34D399]',
          error: 'group-[.toast]:border-red-200 dark:group-[.toast]:border-red-900 group-[.toast]:text-red-700 dark:group-[.toast]:text-red-300',
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
