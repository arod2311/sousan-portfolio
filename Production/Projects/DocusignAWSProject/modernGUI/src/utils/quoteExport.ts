import { SalesQuote } from '../lib/mockData';

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export function quoteToHtml(quote: SalesQuote): string {
  const recurringTotal = quote.lineItems
    .filter((item) => item.cadence === 'Monthly' || item.cadence === 'Per Haul')
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const oneTimeTotal = quote.lineItems
    .filter((item) => item.cadence === 'One-Time')
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const rows = quote.lineItems
    .map(
      (item) => `
      <tr>
        <td>${item.description}</td>
        <td>${item.quantity}</td>
        <td>${item.cadence}</td>
        <td>${formatCurrency(item.unitPrice)}</td>
        <td>${formatCurrency(item.quantity * item.unitPrice)}</td>
      </tr>`
    )
    .join('');

  const terms = quote.terms.map((term) => `<li>${term}</li>`).join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${quote.businessName} · Southern Sanitation Quote</title>
    <style>
      body { font-family: 'Inter', system-ui, sans-serif; margin: 40px; color: #0c3720; }
      .header { display: flex; justify-content: space-between; align-items: center; }
      .header img { width: 140px; }
      .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 24px; }
      .summary div { background: #f4f4f4; padding: 16px 18px; border-radius: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 24px; }
      th, td { border: 1px solid #dcdcdc; padding: 12px; text-align: left; }
      th { background: #0c3720; color: #ffea00; text-transform: uppercase; font-size: 0.8rem; letter-spacing: 0.08em; }
      .totals { text-align: right; margin-top: 16px; font-weight: bold; }
      .terms { margin-top: 24px; background: #f4f4f4; padding: 20px; border-radius: 12px; line-height: 1.6; }
      ul { margin: 0; padding-left: 20px; }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <img src="${window.location.origin}/logos/logo_black_letters.png" alt="Southern Sanitation" />
        <div>1202 Houston St. Ste. 200 · Laredo, TX 78040 · (956) 723-3333</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.9rem; letter-spacing:0.1em;">QUOTE ${quote.id}</div>
        <h1 style="margin:6px 0 0;">Service Proposal</h1>
        <div>${quote.preparedBy} · Valid until ${new Date(quote.validUntil).toLocaleDateString()}</div>
      </div>
    </div>
    <div class="summary">
      <div>
        <strong>Prepared For</strong>
        <div>${quote.businessName}</div>
      </div>
      <div>
        <strong>Service</strong>
        <div>${quote.summary}</div>
      </div>
      <div>
        <strong>Monthly Estimate</strong>
        <div style="font-size:1.4rem;">${formatCurrency(recurringTotal)}</div>
      </div>
    </div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th>Quantity</th>
          <th>Cadence</th>
          <th>Unit Price</th>
          <th>Line Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div>Recurring Monthly: ${formatCurrency(recurringTotal)}</div>
      ${oneTimeTotal > 0 ? `<div>One-Time Charges: ${formatCurrency(oneTimeTotal)}</div>` : ''}
    </div>
    <div class="terms">
      <h2>Key Terms</h2>
      <ul>${terms}</ul>
      ${quote.notes ? `<p style="margin-top:12px;">${quote.notes}</p>` : ''}
    </div>
  </body>
</html>`;
}

export function openQuoteWindow(quote: SalesQuote) {
  const html = quoteToHtml(quote);
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
}
