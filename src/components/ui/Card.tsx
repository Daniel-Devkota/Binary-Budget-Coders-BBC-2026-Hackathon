import { cn } from '@/lib/utils'

export function Card({
  className,
  lift,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { lift?: boolean }) {
  return (
    <div
      className={cn('block-card', lift && 'block-card-lift', className)}
      {...props}
    />
  )
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pt-5 pb-3', className)} {...props} />
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-lg leading-tight', className)} {...props} />
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('px-5 pb-5', className)} {...props} />
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('px-5 py-3 border-t-2 border-line flex items-center gap-2', className)}
      {...props}
    />
  )
}
