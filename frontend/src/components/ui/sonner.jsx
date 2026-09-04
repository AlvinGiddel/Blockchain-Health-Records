import { Toaster as Sonner, toast } from 'sonner'

const Toaster = ({ ...props }) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-white group-[.toaster]:text-[#0F172A] group-[.toaster]:border-[#E2E8F0] group-[.toaster]:shadow-lg group-[.toaster]:rounded-xl group-[.toaster]:font-sans',
          description: 'group-[.toast]:text-[#475569]',
          actionButton:
            'group-[.toast]:bg-[#0F766E] group-[.toast]:text-white font-medium',
          cancelButton:
            'group-[.toast]:bg-slate-100 group-[.toast]:text-slate-700',
          success: 'group-[.toast]:border-[#A3E3CD] group-[.toast]:text-[#1D9E75]',
          error: 'group-[.toast]:border-red-200 group-[.toast]:text-red-700',
        },
      }}
      {...props}
    />
  )
}

export { Toaster, toast }
