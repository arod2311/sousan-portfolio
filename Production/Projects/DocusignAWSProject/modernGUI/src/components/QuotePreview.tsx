import { SalesQuote } from '../lib/mockData';

interface QuotePreviewProps {
  quote: SalesQuote;
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function QuotePreview({ quote }: QuotePreviewProps) {
  const recurringTotal = quote.lineItems
    .filter((item) => item.cadence === 'Monthly' || item.cadence === 'Per Haul')
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  const oneTimeTotal = quote.lineItems
    .filter((item) => item.cadence === 'One-Time')
    .reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

  return (
    <div className="quote-preview">
      <div className="quote-header">
        <div>
          <img src="/logos/logo_black_letters.png" alt="Southern Sanitation" />
          <div style={{ marginTop: '8px', color: '#555555' }}>
            1202 Houston St. Ste. 200 · Laredo, TX 78040 · (956) 723-3333
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#7a6a00' }}>
            Quote #{quote.id}
          </div>
          <div style={{ fontSize: '2rem', fontWeight: 700, color: '#0c3720' }}>Service Proposal</div>
          <div style={{ color: '#555555' }}>
            Prepared by {quote.preparedBy} · Valid until {formatDate(quote.validUntil)}
          </div>
        </div>
      </div>

      <div className="quote-summary">
        <div>
          <strong>Prepared For</strong>
          <div>{quote.businessName}</div>
        </div>
        <div>
          <strong>Service</strong>
          <div>{quote.summary}</div>
        </div>
        <div>
          <strong>Monthly Estimate</strong>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>${recurringTotal.toFixed(2)}</div>
        </div>
      </div>

      <table className="quote-lineitems">
        <thead>
          <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Cadence</th>
            <th>Unit Price</th>
            <th>Line Total</th>
          </tr>
        </thead>
        <tbody>
          {quote.lineItems.map((item, idx) => (
            <tr key={`${item.description}-${idx}`}>
              <td>{item.description}</td>
              <td>{item.quantity}</td>
              <td>{item.cadence}</td>
              <td>${item.unitPrice.toFixed(2)}</td>
              <td>${(item.quantity * item.unitPrice).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="quote-totals">
        <div style={{ textAlign: 'right' }}>
          <div>Recurring Monthly: ${recurringTotal.toFixed(2)}</div>
          {oneTimeTotal > 0 ? <div>One-Time Charges: ${oneTimeTotal.toFixed(2)}</div> : null}
        </div>
      </div>

      <div className="quote-terms">
        <h3>Key Terms</h3>
        <ul>
          {quote.terms.map((term) => (
            <li key={term}>{term}</li>
          ))}
        </ul>
        {quote.notes ? <p style={{ marginTop: '12px' }}>{quote.notes}</p> : null}
      </div>
    </div>
  );
}
