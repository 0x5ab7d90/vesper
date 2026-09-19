import { Button as BaseButton } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[14px] font-medium select-none outline-none transition-[opacity,scale] duration-(--press-dur) ease-(--press-ease) focus-visible:ring-2 focus-visible:ring-accent/70 active:scale-[0.97] active:opacity-80 disabled:opacity-40 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-black',
        secondary: 'bg-white/10 text-white',
        ghost: 'bg-transparent text-white',
        outline: 'bg-transparent text-white ring-1 ring-inset ring-white/15'
      },
      size: {
        sm: 'h-7 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-11 px-6 text-base',
        icon: 'size-9 p-0'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
)

type ButtonProps = React.ComponentPropsWithoutRef<typeof BaseButton> &
  VariantProps<typeof buttonVariants> & { ref?: React.Ref<HTMLButtonElement> }

export function Button({
  className,
  variant,
  size,
  ref,
  ...props
}: ButtonProps): React.JSX.Element {
  return (
    <BaseButton ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
}
