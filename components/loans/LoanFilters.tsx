'use client'
import { useRouter, usePathname } from 'next/navigation'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTransition, useState } from 'react'

interface Props {
  currentStatus:   string
  currentCategory?: string
  query?:          string
}

export function LoanFilters({ currentStatus, currentCategory, query }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState(query ?? '')

  const push = (params: Record<string, string | undefined>) => {
    const sp = new URLSearchParams()
    const merged = { status: currentStatus, category: currentCategory, q: search, ...params }
    Object.entries(merged).forEach(([k, v]) => { if (v) sp.set(k, v) })
    startTransition(() => router.push(`${pathname}?${sp.toString()}`))
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    push({ q: search || undefined })
  }

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Search */}
      <form onSubmit={handleSearch} className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="input pl-9 h-9 text-sm"
        />
      </form>

      {/* Status tabs */}
      <div className="flex rounded-xl border border-surface-border overflow-hidden bg-white">
        {[
          { value: 'active', label: 'Active' },
          { value: 'closed', label: 'Closed' },
          { value: 'all',    label: 'All'    },
        ].map(s => (
          <button
            key={s.value}
            onClick={() => push({ status: s.value, q: search || undefined })}
            className={cn(
              'px-4 py-1.5 text-sm font-medium transition-colors',
              currentStatus === s.value
                ? 'bg-primary-700 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <div className="flex rounded-xl border border-surface-border overflow-hidden bg-white">
        {[
          { value: '',       label: 'All'    },
          { value: 'Gold',   label: '🥇 Gold'   },
          { value: 'Silver', label: '🥈 Silver' },
        ].map(c => (
          <button
            key={c.value}
            onClick={() => push({ category: c.value || undefined, q: search || undefined })}
            className={cn(
              'px-3 py-1.5 text-sm font-medium transition-colors',
              currentCategory === c.value || (!currentCategory && c.value === '')
                ? 'bg-primary-700 text-white'
                : 'text-slate-600 hover:bg-slate-50'
            )}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
