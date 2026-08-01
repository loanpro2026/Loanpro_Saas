/**
 * PDF report generation.
 *
 * Shops print these for their accountant and for their own records, so the
 * output has to look like a document rather than a screenshot of a web page:
 * shop name at the top, the period it covers, page numbers, and a generated-on
 * stamp so an old printout is identifiable months later.
 *
 * jsPDF is imported dynamically. It is ~350KB and only a fraction of sessions
 * ever export a PDF; bundling it into the main chunk would slow every page load
 * for a shop on a 3G connection to save a click for a few of them.
 */

export interface PdfColumn {
  key: string
  label: string
  /** Right-align and use tabular figures. Money and counts should line up. */
  numeric?: boolean
  width?: number
}

export interface PdfOptions {
  title: string
  shopName: string
  /** e.g. "31 July 2026" or "1 Jul – 31 Jul 2026" */
  period?: string
  columns: PdfColumn[]
  rows: Record<string, unknown>[]
  /** Rendered as a summary block above the table. */
  summary?: Array<{ label: string; value: string }>
  /** Printed at the bottom — e.g. the fingerprint caveat. */
  footnote?: string
  orientation?: 'portrait' | 'landscape'
}

const MARGIN = 14
const LINE = 5.5

export async function generateReportPdf(opts: PdfOptions): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({
    orientation: opts.orientation ?? 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  let y = MARGIN

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text(opts.shopName || 'LoanPro', MARGIN, y)

  y += LINE + 1
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(opts.title, MARGIN, y)

  if (opts.period) {
    y += LINE
    doc.setFontSize(9)
    doc.setTextColor(110)
    doc.text(opts.period, MARGIN, y)
    doc.setTextColor(0)
  }

  // Generated-on, right aligned. Explicitly IST — a printout with a UTC
  // timestamp would confuse anyone comparing it against the day's till.
  const stamp = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  doc.setFontSize(8)
  doc.setTextColor(140)
  doc.text(`Generated ${stamp} IST`, pageWidth - MARGIN, MARGIN, { align: 'right' })
  doc.setTextColor(0)

  y += LINE + 2

  // ── Summary block ─────────────────────────────────────────────────────────
  if (opts.summary?.length) {
    doc.setDrawColor(225)
    doc.setFillColor(248, 250, 252)
    const boxHeight = LINE * Math.ceil(opts.summary.length / 3) + 6
    doc.roundedRect(MARGIN, y, pageWidth - MARGIN * 2, boxHeight, 2, 2, 'FD')

    const colWidth = (pageWidth - MARGIN * 2) / 3
    opts.summary.forEach((s, i) => {
      const col = i % 3
      const row = Math.floor(i / 3)
      const x = MARGIN + 4 + col * colWidth
      const ty = y + 5 + row * LINE

      doc.setFontSize(7.5)
      doc.setTextColor(110)
      doc.text(s.label, x, ty)

      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0)
      doc.text(s.value, x, ty + 4)
      doc.setFont('helvetica', 'normal')
    })

    y += boxHeight + 5
  }

  // ── Table ─────────────────────────────────────────────────────────────────
  if (opts.rows.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [opts.columns.map(c => c.label)],
      body: opts.rows.map(r => opts.columns.map(c => formatCell(r[c.key]))),
      margin: { left: MARGIN, right: MARGIN },
      styles: {
        fontSize: 8.5,
        cellPadding: 2,
        lineColor: [230, 230, 230],
        lineWidth: 0.1,
      },
      headStyles: {
        fillColor: [241, 245, 249],
        textColor: [30, 41, 59],
        fontStyle: 'bold',
        fontSize: 8,
      },
      // Zebra striping: these tables run to hundreds of rows and a shop owner
      // reads across them with a finger.
      alternateRowStyles: { fillColor: [252, 252, 253] },
      columnStyles: Object.fromEntries(
        opts.columns.map((c, i) => [
          i,
          { halign: c.numeric ? 'right' : 'left', cellWidth: c.width ?? 'auto' },
        ])
      ),
    })
  } else {
    doc.setFontSize(10)
    doc.setTextColor(130)
    doc.text('Nothing to report for this period.', MARGIN, y + 4)
    doc.setTextColor(0)
  }

  // ── Footer on every page ──────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    const h = doc.internal.pageSize.getHeight()

    doc.setFontSize(7.5)
    doc.setTextColor(150)

    if (opts.footnote && p === pageCount) {
      doc.text(opts.footnote, MARGIN, h - 10, { maxWidth: pageWidth - MARGIN * 2 })
    }
    doc.text(`Page ${p} of ${pageCount}`, pageWidth - MARGIN, h - 6, { align: 'right' })
    doc.text('LoanPro', MARGIN, h - 6)
    doc.setTextColor(0)
  }

  return doc.output('blob')
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return v.toLocaleString('en-IN')
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  return String(v)
}

export function downloadPdf(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Open in a new tab instead of downloading.
 *
 * On a shop counter machine this is usually what people want — they hit
 * Ctrl+P from the viewer rather than digging the file out of Downloads.
 */
export function printPdf(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const w = window.open(url, '_blank')
  if (!w) {
    // Popup blocked — fall back to a download so the action is not simply lost.
    downloadPdf('loanpro-report.pdf', blob)
    return
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
