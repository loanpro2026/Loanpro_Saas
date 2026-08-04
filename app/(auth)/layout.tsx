/**
 * The shell for sign in, registration and password recovery.
 *
 * One centred card on the app background, as the design has it — no marketing
 * panel. Everyone who reaches these pages has already decided to use LoanPro;
 * the split-screen pitch that used to live here only pushed the password field
 * off-centre and made the page slower to read on a shop's laptop.
 *
 * The brand row is part of the shell rather than each page, so the card header
 * cannot drift between "Sign in" and "Create an account".
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface p-6">
      <div className="w-full max-w-[400px] rounded-2xl border border-surface-border bg-surface-card p-8 shadow-card sm:p-9">
        <div className="mb-7 flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-white">
            LP
          </div>
          <div className="min-w-0">
            <p className="text-17 font-bold text-ink">LoanPro</p>
            <p className="truncate text-12 text-ink-muted">Gold and silver loan management</p>
          </div>
        </div>

        {children}
      </div>
    </div>
  )
}
