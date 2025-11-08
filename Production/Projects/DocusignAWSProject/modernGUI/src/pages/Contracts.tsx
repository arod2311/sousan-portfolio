import dayjs from 'dayjs';
import { StatusBadge } from '../components/StatusBadge';
import { usePortalData } from '../hooks/usePortalData';

export function Contracts() {
  const { data, isLoading } = usePortalData();

  if (isLoading || !data) {
    return <div className="card">Loading contract pipeline…</div>;
  }

  return (
    <section className="card">
      <div className="flex-between">
        <h2>Contract Pipeline</h2>
        <div className="muted">DocuSign + Google Sheet snapshot</div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Contract</th>
            <th>Sales Rep</th>
            <th>Status</th>
            <th>Slips</th>
            <th>Last Activity</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data.contracts.map((contract) => (
            <tr key={contract.id}>
              <td>
                <div>{contract.clientName}</div>
                <div className="muted">Envelope #{contract.envelopeId}</div>
              </td>
              <td>{contract.salesRep}</td>
              <td>
                <StatusBadge tone={badgeTone(contract.stage)}>{contract.docuSignStatus}</StatusBadge>
                {contract.pendingSigner ? <div className="muted">Waiting on {contract.pendingSigner}</div> : null}
              </td>
              <td>
                {contract.completedSlips}/{contract.slipCount}
              </td>
              <td>{dayjs(contract.lastActivity).fromNow()}</td>
              <td>
                <div className="flex" style={{ gap: '8px' }}>
                  <a className="pill" href={`#open-docusign-${contract.envelopeId}`}>
                    View in DocuSign
                  </a>
                  <a className="pill" href={`#sheet-row-${contract.googleSheetRow}`}>
                    Open Sheet Row
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function badgeTone(stage: string): 'pending' | 'progress' | 'done' | 'alert' {
  if (stage === 'Completed') return 'done';
  if (stage === 'In Signature') return 'progress';
  return 'pending';
}

