import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { StatusBadge } from '../components/StatusBadge';
import { usePortalData } from '../hooks/usePortalData';
import { LeadForm } from '../components/LeadForm';
import { QuoteForm } from '../components/QuoteForm';
import { Modal } from '../components/Modal';
import { QuotePreview } from '../components/QuotePreview';
import { SalesLead, SalesQuote } from '../lib/mockData';
import { openQuoteWindow } from '../utils/quoteExport';

dayjs.extend(relativeTime);

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function SalesBoard() {
  const { data, isLoading } = usePortalData();
  const [leads, setLeads] = useState<SalesLead[]>([]);
  const [quotes, setQuotes] = useState<SalesQuote[]>([]);
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [activeQuote, setActiveQuote] = useState<SalesQuote | null>(null);

  useEffect(() => {
    if (!data) return;
    setLeads(data.salesLeads);
    setQuotes(data.salesQuotes);
  }, [data]);

  const metrics = useMemo(() => {
    const openLeads = leads.filter((lead) => lead.stage !== 'Closed Won' && lead.stage !== 'Closed Lost');
    const proposalsOut = quotes.filter((quote) => quote.status === 'Sent');
    const pipelineValue = openLeads.reduce((sum, lead) => sum + lead.potentialValue, 0);
    const acceptedRecurring = quotes
      .filter((quote) => quote.status === 'Accepted')
      .reduce((sum, quote) => sum + quote.totalMonthly, 0);

    return { openLeads, proposalsOut, pipelineValue, acceptedRecurring };
  }, [leads, quotes]);

  if (isLoading || !data) {
    return <div className="card">Loading sales pipeline…</div>;
  }

  const handleLeadSubmit = (lead: SalesLead) => {
    setLeads((prev) => [lead, ...prev]);
    setShowLeadModal(false);
  };

  const handleQuoteCreate = (quote: SalesQuote) => {
    setQuotes((prev) => [quote, ...prev]);
    setShowQuoteModal(false);
    setActiveQuote(quote);
  };

  const updateQuoteStatus = (quoteId: string, status: SalesQuote['status']) => {
    setQuotes((prev) => prev.map((quote) => (quote.id === quoteId ? { ...quote, status } : quote)));
  };

  return (
    <>
      <section className="grid metrics">
        <div className="card">
          <div className="key-stat">Active Leads</div>
          <div className="stat-value" style={{ color: '#0c3720' }}>{metrics.openLeads.length}</div>
          <p className="muted">Focus on next steps to keep momentum</p>
        </div>
        <div className="card">
          <div className="key-stat">Proposals Out</div>
          <div className="stat-value" style={{ color: '#0c3720' }}>{metrics.proposalsOut.length}</div>
          <p className="muted">Follow up within 24 hours of sending quotes</p>
        </div>
        <div className="card">
          <div className="key-stat">Pipeline (Monthly)</div>
          <div className="stat-value" style={{ color: '#0c3720' }}>{currency.format(metrics.pipelineValue)}</div>
          <p className="muted">Potential recurring revenue from open leads</p>
        </div>
        <div className="card">
          <div className="key-stat">Accepted Monthly Recurring</div>
          <div className="stat-value" style={{ color: '#0c3720' }}>{currency.format(metrics.acceptedRecurring)}</div>
          <p className="muted">All active recurring revenue from closed-won quotes</p>
        </div>
      </section>

      <section className="card">
        <div className="flex-between">
          <h2>Lead Pipeline</h2>
          <button type="button" className="pill" onClick={() => setShowLeadModal(true)}>
            Add Lead
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Company</th>
              <th>Contact</th>
              <th>Stage</th>
              <th>Potential Monthly</th>
              <th>Next Step</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id}>
                <td>
                  <div>{lead.businessName}</div>
                  <div className="muted">
                    {lead.source} · {lead.id}
                  </div>
                </td>
                <td>
                  <div>{lead.primaryContact}</div>
                  <div className="muted">
                    {lead.email}
                    {lead.phone ? ` · ${lead.phone}` : ''}
                  </div>
                </td>
                <td>
                  <StatusBadge tone={leadTone(lead.stage)}>{lead.stage}</StatusBadge>
                </td>
                <td>{currency.format(lead.potentialValue)}</td>
                <td>{lead.nextStep}</td>
                <td>{dayjs(lead.updatedAt).fromNow()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <div className="flex-between">
          <h2>Quotes</h2>
          <button type="button" className="pill" onClick={() => setShowQuoteModal(true)} disabled={leads.length === 0}>
            Create Quote
          </button>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Quote</th>
              <th>Prepared By</th>
              <th>Status</th>
              <th>Monthly Total</th>
              <th>Valid Until</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {quotes.map((quote) => (
              <tr key={quote.id}>
                <td>
                  <div>{quote.businessName}</div>
                  <div className="muted">{quote.summary}</div>
                </td>
                <td>{quote.preparedBy}</td>
                <td>
                  <select
                    value={quote.status}
                    onChange={(e) => updateQuoteStatus(quote.id, e.target.value as SalesQuote['status'])}
                    style={{ padding: '6px 10px', borderRadius: '8px', border: '1px solid #cbd5d1', fontWeight: 600 }}
                  >
                    <option value="Draft">Draft</option>
                    <option value="Sent">Sent</option>
                    <option value="Accepted">Accepted</option>
                    <option value="Rejected">Rejected</option>
                  </select>
                </td>
                <td>{currency.format(quote.totalMonthly)}</td>
                <td>{dayjs(quote.validUntil).format('MMM D, YYYY')}</td>
                <td>
                  <div className="flex" style={{ gap: '8px' }}>
                    <button type="button" className="pill" onClick={() => setActiveQuote(quote)}>
                      View
                    </button>
                    <button type="button" className="pill" onClick={() => openQuoteWindow(quote)}>
                      Download
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Modal title="Add Lead" isOpen={showLeadModal} onClose={() => setShowLeadModal(false)} width="640px">
        <LeadForm onSubmit={handleLeadSubmit} onCancel={() => setShowLeadModal(false)} />
      </Modal>

      <Modal title="Create Quote" isOpen={showQuoteModal} onClose={() => setShowQuoteModal(false)} width="860px">
        <QuoteForm leads={leads} onCreate={handleQuoteCreate} onCancel={() => setShowQuoteModal(false)} />
      </Modal>

      <Modal title="Quote Preview" isOpen={!!activeQuote} onClose={() => setActiveQuote(null)} width="900px">
        {activeQuote ? <QuotePreview quote={activeQuote} /> : null}
      </Modal>
    </>
  );
}

function leadTone(stage: string): 'pending' | 'progress' | 'done' | 'alert' {
  if (stage === 'Closed Won') return 'done';
  if (stage === 'Closed Lost') return 'alert';
  if (stage === 'New' || stage === 'Discovery Complete') return 'pending';
  return 'progress';
}
