/**
 * In-app help, replacing the desktop's Documentation screen.
 *
 * Written for the person at the counter, not for a developer. The test for
 * each entry is whether it answers a question someone would otherwise phone
 * about — the things that differ from the desktop app get the most space,
 * because that is where a migrated shop will be confused.
 */

export interface HelpArticle {
  q: string
  a: string
}

export interface HelpGroup {
  title: string
  description: string
  articles: HelpArticle[]
}

export const HELP_ARTICLES: HelpGroup[] = [
  {
    title: 'Day-to-day',
    description: 'The things you do at the counter',
    articles: [
      {
        q: 'How do I find a customer\'s loan?',
        a: 'Use the search box at the top, or press Ctrl+K (Cmd+K on a Mac). Type the loan number from the ticket, the customer\'s name, their father\'s name, or the village — whichever you have.\n\nThe loan number always wins, so if you type 4471 you get loan 4471 rather than every loan of ₹4,471.',
      },
      {
        q: 'How do I record a part-payment?',
        a: 'Open the loan and use Add under Deposits. The bar underneath shows how much of the principal the customer has paid off.\n\nDeposits are money the customer has handed over against an open loan. They are held and offset when the loan is finally settled.',
      },
      {
        q: 'How do I close a loan when the customer collects?',
        a: 'Open the loan, use the menu in the top right, and choose Close loan.\n\nThe dialog shows exactly what the customer pays: principal, plus interest, less anything already deposited. The interest is worked out from your shop\'s rate and how long they have held it — but you can change it. Settlements get negotiated and rounded, and the app should not fight that.\n\nNothing is committed until you press Close loan.',
      },
      {
        q: 'I closed the wrong loan. Can I undo it?',
        a: 'Yes. Open the loan and choose Reopen from the menu. The deposits come back and the cash book is corrected automatically.\n\nOnly the shop owner can do this, because it rewrites cash history.\n\nThe desktop app has no way to undo a closing — this is one of the few places the web version does more.',
      },
      {
        q: 'I made a typo on a loan that is already settled.',
        a: 'Open it and choose Edit. You can correct the name, the item, the weight, and if necessary the amount, the interest charged and the closing date.\n\nChanging money or dates on a settled loan adjusts your cash book and past reports. Use it to fix a mistake, not to change what a customer actually paid.',
      },
    ],
  },
  {
    title: 'Money and reports',
    description: 'The cash book and the daily figures',
    articles: [
      {
        q: 'How is interest calculated?',
        a: 'From one rate for the whole shop, set in Settings. It is a yearly rate — the default is 36% per year, which is roughly 3% a month.\n\nThe amount is worked out over the exact number of days the customer held the loan. You can choose simple or compound interest, and how often it compounds.\n\nThe figure suggested at closing is always editable.',
      },
      {
        q: 'Where does the cash-in-hand figure come from?',
        a: 'It is calculated, not typed. Each day starts from the previous day\'s closing balance, then adds cash you put in, deposits taken and loans settled, and subtracts cash taken out, new loans issued and deposits offset at closing.\n\nThat means it always adds up. If it disagrees with the drawer, the difference is a missing entry rather than an arithmetic error.',
      },
      {
        q: 'What is the End of day screen for?',
        a: 'Reconciling. The daily report shows totals; this shows the individual entries behind them — which loans were settled today and which customers part-paid.\n\nMark checked clears the list for that day. It does not touch your loans or deposits, and the reports for that date do not change.',
      },
      {
        q: 'Can I print or export reports?',
        a: 'Every report has Print and CSV. Print produces a proper PDF with your shop name and the period on it, which opens in a new tab ready for Ctrl+P.\n\nCSV opens in Excel. It is set up so rupee signs and Indian names come through correctly, which they usually do not with a plain export.',
      },
    ],
  },
  {
    title: 'Photos and identity',
    description: 'Recording who took the loan',
    articles: [
      {
        q: 'How do I take a customer photo?',
        a: 'On the loan screen use Capture. You can use the camera on this device, or send a request to a paired phone if you have set one up in Settings.\n\nPhotos are resized before uploading so they do not eat your data.',
      },
      {
        q: 'Can I make photos compulsory?',
        a: 'Yes, in Settings → Customer identity. You can require one before a loan is saved, before it is closed, or both.\n\nThe closing requirement is enforced properly — you cannot hand jewellery back to someone with no photo on file. That is the whole point of it.',
      },
      {
        q: 'Who can see the photos?',
        a: 'Only people signed in to your shop. They are stored privately and the links used to display them expire within minutes, so one cannot be copied and shared.',
      },
      {
        q: 'What happened to the fingerprint scanner?',
        a: 'It needs the device plugged into a Windows machine, and a browser cannot reach that hardware. So fingerprint capture and 1:N search stay in the desktop app.\n\nThe desktop app is not going away. If fingerprint matching is central to how you work, keep using it — or use both.',
      },
    ],
  },
  {
    title: 'When things go wrong',
    description: 'Internet, devices and getting your data',
    articles: [
      {
        q: 'The internet is down. What still works?',
        a: 'You can look up any active loan and record a deposit or a cash entry. Those are saved on the device and sent automatically when the connection returns — the banner at the top tells you how many are waiting.\n\nClosing a loan needs a connection, because it settles money against your live cash balance.\n\nDo not clear your browser data while entries are waiting.',
      },
      {
        q: 'I entered something offline. Is it safe?',
        a: 'Yes. Each entry carries a unique code, so even if it gets sent twice it is only recorded once. You will never end up with a customer\'s deposit counted double.\n\nIf something cannot be saved — for example a deposit against a loan that someone else closed in the meantime — you are told, rather than it disappearing quietly.',
      },
      {
        q: 'How do I get a copy of my own records?',
        a: 'Settings → Your data → Download everything. You get a file containing every loan, deposit, cash entry and photo in plain formats that any spreadsheet can open.\n\nYou do not need to ask us and you do not need LoanPro to read it. Take one whenever you like.',
      },
      {
        q: 'Can I stop people seeing the screen when I step away?',
        a: 'Settings → Screen lock. Set a PIN and a timeout, or lock it manually.\n\nIt covers the screen on this device — it is meant for a counter machine customers can see, not as a replacement for your password.',
      },
    ],
  },
]
