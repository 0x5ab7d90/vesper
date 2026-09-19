import { Button as BaseButton } from '@base-ui/react/button'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/cn'

const iconButtonVariants = cva(
  'inline-flex shrink-0 items-center justify-center rounded-full outline-none select-none transition-[opacity,scale] duration-(--press-dur) ease-(--press-ease) active:scale-[0.94] active:opacity-70 disabled:opacity-40 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        ink: 'bg-surface-ink text-text-tertiary',
        soft: 'bg-overlay-soft text-text',
        ghost: 'bg-transparent text-text-tertiary',
        glass: 'bg-overlay-hard text-text backdrop-blur'
      },
      size: {
        sm: 'size-7',
        md: 'size-8',
        lg: 'size-10'
      }
    },
    defaultVariants: {
      variant: 'ghost',
      size: 'md'
    }
  }
)

type IconButtonProps = React.ComponentPropsWithoutRef<typeof BaseButton> &
  VariantProps<typeof iconButtonVariants> & { ref?: React.Ref<HTMLButtonElement> }

export function IconButton({
  className,
  variant,
  size,
  ref,
  ...props
}: IconButtonProps): React.JSX.Element {
  return (
    <BaseButton
      ref={ref}
      className={cn(iconButtonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
