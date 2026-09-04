import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[#0F766E] text-white hover:bg-[#0D655E] shadow-sm active:translate-y-px',
        navy:
          'bg-[#0B2545] text-white hover:bg-[#07182D] shadow-sm active:translate-y-px',
        destructive:
          'bg-red-600 text-white hover:bg-red-700 shadow-sm active:translate-y-px',
        outline:
          'border border-[#E2E8F0] bg-white text-slate-800 hover:bg-slate-50 hover:text-slate-900 shadow-sm',
        secondary:
          'bg-slate-100 text-slate-900 hover:bg-slate-200 shadow-sm',
        ghost:
          'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
        link:
          'text-[#0F766E] underline-offset-4 hover:underline font-semibold',
        verified:
          'bg-[#1D9E75] text-white hover:bg-[#178562] shadow-sm',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-8 text-base',
        icon: 'h-10 w-10 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = 'Button'

export { Button, buttonVariants }
