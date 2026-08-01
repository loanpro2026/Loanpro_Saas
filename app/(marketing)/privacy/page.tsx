import { LegalPage, Section, Bullets } from '@/components/marketing/LegalPage'

export const metadata = {
  title: 'Privacy policy — LoanPro',
  description: 'What LoanPro stores, why, and what we never do with it.',
}

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="31 July 2026">
      <p>
        You are handing us your loan book and photographs of your customers.
        This page explains exactly what we hold and what we do with it, in
        plain terms.
      </p>

      <Section title="What we store">
        <p>Two different things, for two different reasons.</p>
        <p><strong>Your account:</strong> your name, email address, shop name,
        and payment records from our payment provider. We use these to give you
        access, to bill you, and to contact you about your account.</p>
        <p><strong>Your business records:</strong> the loans, deposits, cash
        entries and customer photographs you enter. These are your records. We
        store them so the service works and so you can get them back.</p>
      </Section>

      <Section title="Customer photographs">
        <p>
          These are identity documents belonging to people who are not our
          customers, so they get particular care:
        </p>
        <Bullets items={[
          'Stored in private storage that is not publicly reachable.',
          'Every request to view one is checked against your login first.',
          'The links used to display them expire within minutes and cannot be shared.',
          'They are never used for training, analysis, facial recognition or anything else.',
        ]} />
      </Section>

      <Section title="Who can see your records">
        <p>
          Your shop&rsquo;s data is separated from every other shop&rsquo;s at
          the database level, not by application code that could contain a
          mistake. A query that tried to read another shop&rsquo;s loans would
          be rejected by the database itself.
        </p>
        <p>
          Our staff do not browse your records. An engineer may access data
          only when you have asked us for help with a specific problem, or where
          we are legally required to.
        </p>
        <p>
          We do not sell your data. We do not share it with advertisers. We do
          not use it to build anything.
        </p>
      </Section>

      <Section title="Who else is involved">
        <p>
          Running the service means using a few other companies. Each holds
          only what it needs:
        </p>
        <Bullets items={[
          'Supabase — stores your records and manages logins.',
          'Cloudflare R2 — stores customer photographs.',
          'Vercel — runs the website and serves pages.',
          'Razorpay — processes payments. We never see your full card details.',
        ]} />
      </Section>

      <Section title="Getting your data out">
        <p>
          There is a button in Settings that downloads everything — every loan,
          deposit, cash entry and photograph — in plain readable formats. You do
          not need our permission and you do not need to ask. Use it whenever
          you like.
        </p>
      </Section>

      <Section title="Deleting your data">
        <p>
          Ask us and we will delete your account and everything in it. We will
          confirm when it is done. Please take an export first, because we
          cannot undo it.
        </p>
        <p>
          Backups are kept for a short period after deletion for recovery
          purposes, and then they go too. Records we are legally required to
          keep, such as payment receipts for tax purposes, are retained as long
          as the law requires.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Traffic is encrypted in transit and data is encrypted at rest. Access
          to production systems is limited and logged. No system is perfectly
          secure, and we will not pretend otherwise — but if something goes
          wrong that affects your records, we will tell you promptly rather than
          quietly.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If we change this policy in a way that meaningfully affects you, we
          will tell you by email rather than quietly editing the page.
        </p>
      </Section>
    </LegalPage>
  )
}
