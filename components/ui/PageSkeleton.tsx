import { cn } from '@/lib/utils'

function Block({ className }: { className: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

export function PageSkeleton({ rows = 7 }: { rows?: number }) {
  return (
    <div className="space-y-5" role="status" aria-busy="true" aria-label="Loading page">
      <span className="sr-only">Loading your records…</span>
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <Block className="h-6 w-44" />
          <Block className="h-3.5 w-64 max-w-[65vw]" />
        </div>
        <Block className="h-9 w-32" />
      </div>
      <div className="card p-4 flex gap-3">
        <Block className="h-9 flex-1" />
        <Block className="h-9 w-40 hidden sm:block" />
        <Block className="h-9 w-40 hidden md:block" />
      </div>
      <div className="table-container bg-white">
        <Block className="h-11 w-full rounded-none" />
        <div className="divide-y divide-surface-border px-4">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-3 py-3.5">
              <Block className="col-span-1 h-3" />
              <Block className="col-span-4 h-4" />
              <Block className="col-span-2 h-5" />
              <Block className="col-span-2 h-4" />
              <Block className="col-span-3 h-4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

