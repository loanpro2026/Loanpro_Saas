export default function DashboardLoading() {
  return (
    <div className="space-y-3.5" aria-label="Loading dashboard">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="skeleton h-7 w-52" />
        <div className="flex gap-2">
          <div className="skeleton h-10 w-64 max-w-[65vw]" />
          <div className="skeleton h-10 w-28" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card min-h-[116px] p-4">
            <div className="skeleton h-3 w-24" />
            <div className="mt-4 skeleton h-7 w-28" />
            <div className="mt-2 skeleton h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="card overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
          <div className="skeleton h-4 w-40" />
          <div className="skeleton h-7 w-32" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className={`${index === 0 ? 'col-span-2 sm:col-span-1' : ''} min-h-[92px] border-l border-surface-border p-4`}>
              <div className="skeleton h-3 w-28" />
              <div className="mt-3 skeleton h-6 w-24" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <div className="card min-h-[310px] lg:col-span-2">
          <div className="skeleton h-4 w-56" />
          <div className="mt-5 skeleton h-60 w-full" />
        </div>
        <div className="card min-h-[310px]">
          <div className="skeleton h-4 w-24" />
          <div className="mt-5 skeleton h-2.5 w-full" />
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="skeleton h-20" />
            <div className="skeleton h-20" />
          </div>
        </div>
      </div>
    </div>
  )
}
