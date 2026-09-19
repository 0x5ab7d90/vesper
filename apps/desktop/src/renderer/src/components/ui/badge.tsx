import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@renderer/lib/cn'

const badgeVariants = cva('inline-flex items-center justify-center font-medium leading-none', {
  variants: {
    variant: {
      chip: 'bg-overlay-soft text-text rounded-[5px]',
      tag: 'bg-transparent text-text-secondary',
      meta: 'bg-overlay-soft text-text rounded-[5px] uppercase tracking-[0.06em]'
    },
    size: {
      sm: 'h-[14px] px-1.5 text-[11px]',
      md: 'px-2 py-[3px] text-[13px]'
    }
  },
  defaultVariants: {
    variant: 'chip',
    size: 'md'
  }
})

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeVariants> & { ref?: React.Ref<HTMLSpanElement> }

export function Badge({ className, variant, size, ref, ...props }: BadgeProps): React.JSX.Element {
  return <span ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />
}
