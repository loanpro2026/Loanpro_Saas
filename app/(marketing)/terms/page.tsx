import { LegalPage, Section, Bullets } from '@/components/marketing/LegalPage'

export const metadata = {
  title: 'Terms of service — LoanPro',
  description: 'The agreement between you and LoanPro.',
}

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="31 July 2026">
      <p>
        These terms cover your use of LoanPro. Using the service means you
        accept them.
      </p>

      <Section title="What LoanPro is">
        <p>
          Software for recording and managing gold and silver loans. It is a
          record-keeping tool. It is not a lender, not a broker, and not a
          provider of financial, legal or accounting advice.
        </p>
        <p>
          You are responsible for operating your business lawfully, including
          any licensing, KYC, record-keeping and tax obligations that apply to
          pawnbroking where you trade. LoanPro helps you keep records; it does
          not make you compliant.
        </p>
      </Section>

      <Section title="Your account">
        <Bullets items={[
          'You must give accurate details when signing up.',
          'You are responsible for keeping your password safe and for what happens under your account.',
          'You are responsible for anyone you invite as staff.',
          'One subscription covers one shop. If you run several, each needs its own.',
        ]} />
      </Section>

      <Section title="Your data belongs to you">
        <p>
          The records you enter are yours. We claim no ownership over them. We
          store and process them only to provide the service to you.
        </p>
        <p>
          You can export everything at any time from Settings, and you can ask
          us to delete it.
        </p>
      </Section>

      <Section title="What you agree not to do">
        <Bullets items={[
          'Use the service for anything unlawful.',
          'Store records for a business that is not yours, or resell access.',
          'Attempt to access another shop’s data, or to circumvent limits or security.',
          'Upload photographs of people without their knowledge, where the law requires it.',
        ]} />
      </Section>

      <Section title="Payment">
        <p>
          Plans are billed in advance. Prices are in Indian rupees and include
          applicable taxes unless stated otherwise. We may change prices, but we
          will give you at least 30 days&rsquo; notice by email before a change
          affects you.
        </p>
        <p>
          If a payment fails, we will tell you and give you time to fix it
          before anything changes.
        </p>
      </Section>

      <Section title="What happens if you stop paying">
        <p>
          You keep access to everything you have already recorded. You can open
          it, search it, run reports, export it, and carry on recording
          repayments against existing loans. Only creating new loans requires an
          active plan.
        </p>
        <p>
          We will not delete your records because of a lapsed subscription. If
          an account stays inactive for a very long time we will contact you
          first and give you a clear opportunity to export.
        </p>
      </Section>

      <Section title="Availability">
        <p>
          We work to keep the service running, but we do not promise it will
          never be unavailable. Maintenance, outages at our providers, and
          faults happen.
        </p>
        <p>
          The app is designed to keep working without a connection for the
          things that matter most at a counter — looking up a customer and
          recording a deposit. But it is a web service, and it depends on your
          internet.
        </p>
      </Section>

      <Section title="Limits of our responsibility">
        <p>
          The service is provided as it is. To the extent the law allows, we are
          not liable for lost profits, lost business, or indirect losses. Where
          we are liable, our total liability is limited to what you have paid us
          in the previous twelve months.
        </p>
        <p>
          Nothing here limits liability that cannot lawfully be limited.
        </p>
        <p>
          Please keep your own exports. Take one periodically — the button is in
          Settings and it takes a moment.
        </p>
      </Section>

      <Section title="Ending the agreement">
        <p>
          You may stop using the service and cancel at any time. We may suspend
          or end an account that breaches these terms, and we will explain why
          unless we are legally prevented from doing so.
        </p>
      </Section>

      <Section title="Governing law">
        <p>
          These terms are governed by the laws of India, and the courts of
          Indore, Madhya Pradesh have jurisdiction.
        </p>
      </Section>
    </LegalPage>
  )
}
