import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { StatusBadge } from '../components/StatusBadge';
import { usePortalData } from '../hooks/usePortalData';

dayjs.extend(relativeTime);

export function Operations() {
  const { data, isLoading } = usePortalData();

  if (isLoading || !data) {
    return <div className="card">Loading operations board…</div>;
  }

  const { slips } = data;
  const priorityQueue = slips
    .filter((slip) => slip.status !== 'Completed')
    .sort((a, b) => dayjs(a.scheduledDelivery).valueOf() - dayjs(b.scheduledDelivery).valueOf());

  return (
    <section className="card">
      <div className="flex-between">
        <h2>Dispatcher Priority Board</h2>
        <button type="button" className="pill">
          Export to Google Sheet
        </button>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Delivery Window</th>
            <th>Client</th>
            <th>Driver</th>
            <th>Status</th>
            <th>Next Action</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {priorityQueue.map((slip) => (
            <tr key={slip.id}>
              <td>
                <div>{dayjs(slip.scheduledDelivery).format('MMM D · h:mm A')}</div>
                <div className="muted">{dayjs(slip.scheduledDelivery).fromNow()}</div>
              </td>
              <td>
                <div>{slip.clientName}</div>
                <div className="muted">{slip.serviceAddress}</div>
              </td>
              <td>{slip.driverName}</td>
              <td>
                <StatusBadge tone={badgeTone(slip.status)}>{slip.status}</StatusBadge>
              </td>
              <td>{nextActionFor(slip)}</td>
              <td>
                <div className="flex" style={{ gap: '8px' }}>
                  <a className="pill" href={slip.slipLink ?? '#'} target="_blank" rel="noreferrer">
                    View Slip
                  </a>
                  {slip.navigationUrl ? (
                    <a className="pill" href={slip.navigationUrl} target="_blank" rel="noreferrer">
                      Navigate
                    </a>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function badgeTone(status: string): 'pending' | 'progress' | 'done' | 'alert' {
  if (status === 'Completed') return 'done';
  if (status === 'Exception') return 'alert';
  if (status === 'Awaiting Documents' || status === 'Scheduling') return 'pending';
  return 'progress';
}

function nextActionFor(slip: { status: string; driverName: string; pendingSigner?: string }) {
  if (slip.status === 'Awaiting Documents') {
    return 'Upload job site documents';
  }
  if (slip.status === 'Scheduling') {
    return slip.pendingSigner ? `Follow up with ${slip.pendingSigner}` : 'Assign dispatcher window';
  }
  if (slip.status === 'Dispatched' && slip.driverName === 'Unassigned') {
    return 'Assign driver';
  }
  if (slip.status === 'Driver Out') {
    return 'Monitor progress · ready to capture POD';
  }
  if (slip.status === 'Exception') {
    return 'Review exception log and reschedule';
  }
  return 'Track completion';
}

