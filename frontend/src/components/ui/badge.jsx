import * as React from 'react'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-[#0B2545] text-white',
        verified:
          'border-[#A3E3CD] bg-[#E8F7F2] text-[#1D9E75] font-semibold shadow-none',
        active:
          'border-[#A3E3CD] bg-[#E8F7F2] text-[#1D9E75] font-semibold shadow-none',
        teal:
          'border-transparent bg-[#0F766E] text-white',
        secondary:
          'border-slate-200 bg-slate-100 text-slate-800',
        destructive:
          'border-red-200 bg-red-50 text-red-700',
        warning:
          'border-amber-200 bg-amber-50 text-amber-800',
        outline:
          'border-[#E2E8F0] text-slate-700 bg-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
