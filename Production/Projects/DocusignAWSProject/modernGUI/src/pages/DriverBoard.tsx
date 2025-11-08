import dayjs from 'dayjs';
import { StatusBadge } from '../components/StatusBadge';
import { usePortalData } from '../hooks/usePortalData';

export function DriverBoard() {
  const { data, isLoading } = usePortalData();

  if (isLoading || !data) {
    return <div className="card">Loading driver assignments…</div>;
  }

  return (
    <section className="grid" style={{ gap: '16px' }}>
      {data.driverAssignments.map((assignment) => (
        <article key={assignment.driverName} className="card">
          <div className="flex-between">
            <div>
              <h2>{assignment.driverName}</h2>
              <p className="muted">Route for {dayjs(assignment.shiftDate).format('MMMM D, YYYY')}</p>
            </div>
            <span className="pill">{assignment.stops.length} stops</span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Client</th>
                <th>Address</th>
                <th>Container</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {assignment.stops.map((stop) => (
                <tr key={stop.id}>
                  <td>{stop.clientName}</td>
                  <td>{stop.serviceAddress}</td>
                  <td>{stop.containerDetails}</td>
                  <td>
                    <StatusBadge tone={badgeTone(stop.status)}>{stop.status}</StatusBadge>
                  </td>
                  <td>
                    {stop.navigationUrl ? (
                      <a className="pill" href={stop.navigationUrl} target="_blank" rel="noreferrer">
                        Navigate
                      </a>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </section>
  );
}

function badgeTone(status: string): 'pending' | 'progress' | 'done' | 'alert' {
  if (status === 'Completed') return 'done';
  if (status === 'Exception') return 'alert';
  if (status === 'Awaiting Documents' || status === 'Scheduling') return 'pending';
  return 'progress';
}

