import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-surface">
      <div className="relative hidden overflow-hidden bg-[#111827] p-12 lg:flex lg:w-[46%] lg:flex-col lg:items-center lg:justify-center">
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }}
        />
        <div className="absolute -left-48 -top-48 h-96 w-96 rounded-full bg-primary-500/10 blur-3xl" />

        <div className="relative max-w-sm text-center">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-lg">
            <span className="text-xl font-black text-[#111827]">LP</span>
          </div>
          <h1 className="mb-4 text-3xl font-bold text-white">LoanPro</h1>
          <p className="leading-relaxed text-[#cbd5e1]">
            Gold and silver loan management that works on every device.
            No installation, database setup or access token.
          </p>

          <div className="mt-10 space-y-3 text-left">
            {[
              'Start the 60-day trial immediately',
              'Open the same live records on every device',
              'Keep loan, deposit and cash history transaction-safe',
            ].map((label, index) => (
              <div key={label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/20 text-xs font-bold text-primary-300">
                  {index + 1}
                </span>
                <p className="text-sm font-medium text-[#e5e7eb]">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
        <div className="mb-8 lg:hidden">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 dark:bg-white">
              <span className="text-sm font-bold text-white dark:text-slate-950">LP</span>
            </div>
            <span className="text-lg font-bold text-slate-900">LoanPro</span>
          </Link>
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
