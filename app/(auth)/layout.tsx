import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex">
      {/* Left decorative panel — hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-primary-950 flex-col items-center justify-center p-12 relative overflow-hidden">
        {/* Grid bg */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '28px 28px' }} />
        <div className="absolute top-0 left-0 w-96 h-96 bg-primary-500/15 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />

        <div className="relative text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-gold-500 flex items-center justify-center mx-auto mb-6 shadow-lg">
            <span className="text-primary-950 font-black text-2xl">LP</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-4">LoanPro</h1>
          <p className="text-primary-300 leading-relaxed">
            Gold & silver loan management that works on every device.
            No installation. No access tokens. Just log in and go.
          </p>

          <div className="mt-10 grid grid-cols-2 gap-4 text-left">
            {[
              { label: 'Active Loans', value: '142', color: 'text-white' },
              { label: 'Outstanding', value: '₹18.4L', color: 'text-gold-400' },
              { label: "Today's Deposits", value: '₹42,500', color: 'text-emerald-400' },
              { label: 'Cash in Hand', value: '₹2.1L', color: 'text-primary-300' },
            ].map((s) => (
              <div key={s.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-[10px] text-primary-400 uppercase tracking-wide">{s.label}</p>
                <p className={`text-xl font-bold tabular-nums mt-1 ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-10">
        <div className="lg:hidden mb-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-700 flex items-center justify-center">
              <span className="text-white font-bold text-sm">LP</span>
            </div>
            <span className="font-bold text-slate-900 text-lg">LoanPro</span>
          </Link>
        </div>
        <div className="w-full max-w-sm">
          {children}
        </div>
      </div>
    </div>
  )
}
