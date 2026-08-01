import { LegalPage, Section, Bullets } from '@/components/marketing/LegalPage'

export const metadata = {
  title: 'Refund & cancellation policy — LoanPro',
  description: 'How cancellations and refunds work.',
}

export default function RefundsPage() {
  return (
    <LegalPage title="Refund &amp; cancellation policy" updated="31 July 2026">
      <p>
        Short version: there is a free trial so you can decide before paying,
        you can cancel whenever you like, and if the service genuinely did not
        work for you we would rather refund you than argue.
      </p>

      <Section title="The free trial">
        <p>
          Fourteen days, everything included, no card required. Nothing is
          charged unless you choose a paid plan afterwards. If you do nothing at
          the end of the trial, you are not billed — your records stay
          available to open and export.
        </p>
      </Section>

      <Section title="Cancelling">
        <p>
          Cancel any time from Settings, or by asking us. There is no notice
          period and no cancellation fee.
        </p>
        <p>
          You keep access until the end of the period you have already paid
          for. After that you can still open, search and export everything you
          have recorded, and keep recording repayments on existing loans — only
          creating new loans stops.
        </p>
      </Section>

      <Section title="Refunds">
        <Bullets items={[
          'Within 7 days of your first payment: full refund, no questions asked.',
          'A fault on our side that stopped you working and that we could not fix: refund for the affected period.',
          'Billed by mistake, or charged twice: refunded in full as soon as we spot it or you tell us.',
        ]} />
        <p>
          Beyond that, we do not usually refund part-months, because the trial
          exists precisely so you can decide before committing. If your
          situation is unusual, write to us and explain — we would rather sort
          it out than have you feel cheated.
        </p>
      </Section>

      <Section title="How to request one">
        <p>
          Contact us through the support page with your registered email address
          and what happened. We will reply within two working days.
        </p>
        <p>
          Approved refunds go back to the original payment method through
          Razorpay, usually within 5&ndash;7 working days depending on your
          bank. We do not control that timing.
        </p>
      </Section>

      <Section title="Before you cancel">
        <p>
          Take an export. Settings &rarr; Your data &rarr; Download everything.
          You get every loan, deposit, cash entry and photograph in plain
          readable files. It takes a moment and it means you are never dependent
          on us to see your own records.
        </p>
      </Section>
    </LegalPage>
  )
}
