import { cn } from '@renderer/lib/cn'

type SkeletonProps = React.HTMLAttributes<HTMLDivElement> & { ref?: React.Ref<HTMLDivElement> }

export function Skeleton({ className, ref, ...props }: SkeletonProps): React.JSX.Element {
  return (
    <div
      ref={ref}
      aria-hidden
      className={cn('skeleton rounded-md bg-surface-2', className)}
      {...props}
    />
  )
}
