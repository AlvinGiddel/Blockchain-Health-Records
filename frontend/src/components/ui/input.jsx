import * as React from 'react'
import { cn } from '@/lib/utils'

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-lg border border-[#E2E8F0] dark:border-[#1E3A5F] bg-white dark:bg-[#0B192C] px-3 py-2 text-sm text-[#0F172A] dark:text-[#F8FAFC] placeholder:text-[#94A3B8] dark:placeholder:text-[#64748B] transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F766E] dark:focus-visible:ring-[#14B8A6] focus-visible:border-transparent disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-[#07182D] disabled:opacity-60',
        className
      )}
      ref={ref}
      {...props}
    />
  )
})
Input.displayName = 'Input'

export { Input }
