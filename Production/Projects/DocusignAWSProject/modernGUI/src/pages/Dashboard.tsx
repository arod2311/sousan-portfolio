import { useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { StatusBadge } from '../components/StatusBadge';
import { usePortalData } from '../hooks/usePortalData';
import type { SlipRecord, SlipStage, MetricSummary } from '../lib/mockData';

dayjs.extend(relativeTime);

type SlipFilter = SlipStage;

const defaultMetrics: MetricSummary = {
  pendingContracts: 0,
  todaysDeliveries: 0,
  actionsRequired: 0,
  slipsAwaitingDriver: 0
};

const defaultSheetColumns = [
  'ContractEnvelopeId',
  'ClientName',
  'Status',
  'ServiceAddress',
  'ServiceDays',
  'ContainerSize',
  'ContainerID',
  'DeliveryDriverName',
  'DeliveryDriverEmail',
  'UpdatedAt',
  'SlipLink'
];

function humanizeHeader(key: string): string {
  return key
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(\w)/g, (match) => match.toUpperCase())
    .trim();
}

function renderSheetCell(slip: SlipRecord, key: string) {
  const rawValue = slip.raw?.[key] ?? '';
  if (key === 'Status') {
    const label = rawValue || slip.status;
    return <StatusBadge tone={badgeTone(slip.status)}>{label}</StatusBadge>;
  }
  if (key === 'UpdatedAt') {
    const iso = rawValue || slip.updatedAt;
    return (
      <div>
        {dayjs(iso).format('MMM D, h:mm A')}
        <div className="muted">{dayjs(iso).fromNow()}</div>
      </div>
    );
  }
  if (key === 'SlipLink') {
    if (!rawValue) return '—';
    const hasSpace = rawValue.length > 20;
    return (
      <a
        href={rawValue}
        target="_blank"
        rel="noreferrer"
        className={hasSpace ? 'pill-link long-label' : 'pill-link'}
      >
        {hasSpace ? (
          <>
            <span>View</span>
            <span>Slip</span>
          </>
        ) : (
          'View Slip'
        )}
      </a>
    );
  }
  if (!rawValue) return '—';
  if (rawValue.includes('\n')) {
    return rawValue.split('\n').map((line) => <div key={line}>{line}</div>);
  }
  return rawValue;
}

export function Dashboard() {
  const { data, isLoading } = usePortalData();
  const [statusFilter, setStatusFilter] = useState<'All' | SlipFilter>('All');
  const [searchTerm, setSearchTerm] = useState('');

  const slips = data?.slips ?? [];
  const metrics = data?.metrics ?? defaultMetrics;
  const contracts = data?.contracts ?? [];
  const sheetColumns = (data?.sheetColumns ?? defaultSheetColumns).filter(Boolean);

  const activeSlips = slips.filter((slip) => slip.status !== 'Completed');
  const completedSlips = slips.filter((slip) => slip.status === 'Completed');

  const statusOptions = ['All', ...Array.from(new Set(activeSlips.map((slip) => slip.status)))];
  const search = searchTerm.trim().toLowerCase();

  const matchesSearch = (slip: SlipRecord) => {
    if (!search) return true;
    if (slip.id.toLowerCase().includes(search)) return true;
    if (slip.status.toLowerCase().includes(search) || slip.statusRaw.toLowerCase().includes(search)) return true;
    const rawValues = Object.values(slip.raw || {});
    return rawValues.some((value) => value.toLowerCase().includes(search));
  };

  const filteredActive = activeSlips.filter((slip) => {
    const matchesStatus = statusFilter === 'All' || slip.status === statusFilter;
    if (!matchesStatus) return false;
    return matchesSearch(slip);
  });

  const filteredCompleted = completedSlips.filter(matchesSearch);

  const showLoading = (!data || slips.length === 0) && isLoading;

  if (showLoading) {
    return <div className="card">Loading portal snapshot…</div>;
  }

  return (
    <>
      <section className="header-card">
        <div className="flex-between">
          <div>
            <div className="key-stat">Today&apos;s Operations Pulse</div>
            <div className="stat-value">{metrics.todaysDeliveries} deliveries</div>
            <p className="muted">
              {metrics.actionsRequired} slips need action · {metrics.pendingContracts} contracts still in signature
            </p>
          </div>
          <div className="pill">Snapshot dashboard</div>
        </div>
      </section>

      <section className="grid metrics">
        <div className="card">
          <div className="key-stat">Slips awaiting dispatch</div>
          <div className="stat-value">{metrics.slipsAwaitingDriver}</div>
          <p className="muted">Assign drivers to keep the queue moving</p>
        </div>
        <div className="card">
          <div className="key-stat">Driver Out</div>
          <div className="stat-value">
            {slips.filter((slip) => slip.status === 'Driver Out').length}
          </div>
          <p className="muted">Monitor ETA and escalate exceptions quickly</p>
        </div>
        <div className="card">
          <div className="key-stat">Signatures Pending</div>
          <div className="stat-value">
            {contracts.filter((contract) => contract.pendingSigner).length}
          </div>
          <p className="muted">Send reminders to keep agreements on track</p>
        </div>
      </section>

      <section className="card">
        <div className="flex-between">
          <h2>Live Slip Tracker</h2>
          <div className="filter-bar">
            <label>
              <span>Status</span>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as SlipFilter | 'All')}>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Search</span>
              <input
                type="text"
                placeholder="Client, address, driver…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </label>
          </div>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {sheetColumns.map((column) => (
                  <th key={column}>{humanizeHeader(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredActive.map((slip) => (
                <tr key={slip.id}>
                  {sheetColumns.map((column) => (
                    <td key={`${slip.id}-${column}`}>{renderSheetCell(slip, column)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="flex-between">
          <h2>Completed Slips</h2>
          <span className="muted">{filteredCompleted.length} completed</span>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                {sheetColumns.map((column) => (
                  <th key={column}>{humanizeHeader(column)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCompleted.map((slip) => (
                <tr key={slip.id}>
                  {sheetColumns.map((column) => (
                    <td key={`${slip.id}-${column}`}>{renderSheetCell(slip, column)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function badgeTone(status: string): 'pending' | 'progress' | 'done' | 'alert' {
  if (status === 'Completed') return 'done';
  if (status === 'Exception') return 'alert';
  if (status === 'Awaiting Documents' || status === 'Scheduling') return 'pending';
  return 'progress';
}
