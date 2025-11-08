import dayjs from 'dayjs';
import serviceSheetData from '../data/serviceSlips.sample.json';

export type SlipStage =
  | 'Awaiting Documents'
  | 'Scheduling'
  | 'Dispatched'
  | 'Driver Out'
  | 'Completed'
  | 'Exception';

export interface SlipRecord {
  id: string;
  contractId: string;
  clientName: string;
  status: SlipStage;
  statusRaw: string;
  docuSignStatus: string;
  pendingSigner?: string;
  scheduledDelivery: string;
  serviceAddress: string;
  containerDetails: string;
  containerId: string;
  driverName: string;
  dispatcher?: string;
  slipLink?: string;
  navigationUrl?: string;
  updatedAt: string;
  raw: Record<string, string>;
}

export interface ContractRecord {
  id: string;
  envelopeId: string;
  clientName: string;
  salesRep: string;
  stage: 'Draft' | 'In Signature' | 'Completed';
  docuSignStatus: string;
  pendingSigner?: string;
  lastActivity: string;
  slipCount: number;
  completedSlips: number;
  googleSheetRow?: number;
}

export interface DriverAssignment {
  driverName: string;
  shiftDate: string;
  stops: Array<Pick<SlipRecord, 'id' | 'clientName' | 'serviceAddress' | 'containerDetails' | 'navigationUrl' | 'status'>>;
}

export interface MetricSummary {
  pendingContracts: number;
  todaysDeliveries: number;
  actionsRequired: number;
  slipsAwaitingDriver: number;
}

export type LeadStage =
  | 'New'
  | 'Discovery Complete'
  | 'Proposal Sent'
  | 'Negotiation'
  | 'Closed Won'
  | 'Closed Lost';

export interface SalesLead {
  id: string;
  businessName: string;
  primaryContact: string;
  email: string;
  phone?: string;
  stage: LeadStage;
  source: string;
  potentialValue: number;
  nextStep: string;
  updatedAt: string;
}

export type QuoteStatus = 'Draft' | 'Sent' | 'Accepted' | 'Rejected';

export interface QuoteLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  cadence: 'Monthly' | 'One-Time' | 'Per Haul';
}

export interface SalesQuote {
  id: string;
  leadId: string;
  businessName: string;
  preparedBy: string;
  validUntil: string;
  totalMonthly: number;
  status: QuoteStatus;
  summary: string;
  serviceType: 'Front Load' | 'Roll Off';
  lineItems: QuoteLineItem[];
  notes?: string;
  terms: string[];
  documentUrl?: string;
}

export interface PortalSnapshot {
  metrics: MetricSummary;
  slips: SlipRecord[];
  contracts: ContractRecord[];
  driverAssignments: DriverAssignment[];
  salesLeads: SalesLead[];
  salesQuotes: SalesQuote[];
  sheetColumns: string[];
}

interface ServiceSheetDataFile {
  pending?: Array<Record<string, string>>;
  completed?: Array<Record<string, string>>;
  fetchedAt?: string | null;
}

const sheetData = (serviceSheetData as ServiceSheetDataFile) ?? {};

function cleanText(value?: string): string {
  if (!value) return '';
  return String(value).trim();
}

function parseIsoDate(value?: string, fallback = dayjs()): string {
  if (!value) return fallback.toISOString();
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.toISOString() : fallback.toISOString();
}

function toMapsLink(address?: string): string | undefined {
  const cleaned = cleanText(address);
  if (!cleaned) return undefined;
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(cleaned)}`;
}

function mapSlipStage(rawStatus?: string): SlipStage {
  const status = cleanText(rawStatus).toLowerCase();
  if (!status) return 'Awaiting Documents';
  if (status.includes('completed')) return 'Completed';
  if (status.includes('driver')) return 'Driver Out';
  if (status.includes('assigned') || status.includes('dispatched') || status.includes('sent')) return 'Dispatched';
  if (status.includes('ready') || status.includes('pending') || status.includes('await')) return 'Scheduling';
  if (status.includes('exception') || status.includes('issue')) return 'Exception';
  return 'Awaiting Documents';
}

function buildContainerDetails(row: Record<string, string>): string {
  const size = cleanText(row.ContainerSize || row['Container Size']);
  const freq = cleanText(row.Frequency || row['Frequency/Week']);
  const days = cleanText(row.ServiceDays || row['Service Days']);
  const parts = [size && `${size}`];
  if (freq) parts.push(freq);
  if (days) parts.push(days);
  return parts.filter(Boolean).join(' · ') || 'Pending assignment';
}

function toSlipRecord(row: Record<string, string>, index: number, override?: SlipStage): SlipRecord | null {
  const fallbackId = `SLIP-${index + 1}`;
  const rawContract = cleanText(
    row.ContractEnvelopeId || row['ContractEnvelopeID'] || row.ContractId || row['Contract Id']
  );
  const clientName = cleanText(row.ClientName || row['Client Name'] || row.BusinessName);
  const serviceAddress = cleanText(row.ServiceAddress || row['Service Address']);

  // Ignore header rows or blank lines that leak through the range
  if (!rawContract && !clientName && !serviceAddress) {
    return null;
  }

  const contractId = rawContract || `CONTRACT-${index + 1}`;
  const slipId =
    cleanText(row.ServiceSlipEnvelopeId || row.ServiceSlipEnvelopeID || row.SlipLink) || `${contractId}-${index + 1}`;
  const statusRaw = cleanText(row.Status);
  const status = override ?? mapSlipStage(statusRaw);
  const scheduledBase = row.ScheduledDate || row['Scheduled Date'] || row.TargetDate || row.CreatedAt;
  const updatedBase = row.UpdatedAt || row['Updated At'] || row.LastUpdated || row.ModifiedAt || scheduledBase;
  const rawRecord: Record<string, string> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!key) return;
    rawRecord[key] = cleanText(value);
  });

  return {
    id: slipId || fallbackId,
    contractId,
    clientName: clientName || 'Unknown Client',
    status,
    statusRaw,
    docuSignStatus: cleanText(row.DocuSignStatus || row.EnvelopeStatus) || 'Unknown',
    pendingSigner: cleanText(row.PendingSigner || row['Pending Signer']) || undefined,
    scheduledDelivery: parseIsoDate(scheduledBase),
    serviceAddress,
    containerDetails: buildContainerDetails(row),
    containerId: cleanText(row.ContainerID || row['Container ID'] || row.ContainerNumber) || 'Pending',
    driverName: cleanText(row.DeliveryDriverName || row['Delivery Driver Name'] || row.Driver) || 'Unassigned',
    dispatcher: cleanText(row.StaffApproverName || row['Approver Name']) || undefined,
    slipLink: cleanText(row.SlipLink || row['Slip Link']) || undefined,
    navigationUrl: toMapsLink(serviceAddress),
    updatedAt: parseIsoDate(updatedBase),
    raw: rawRecord
  };
}

const sheetPending = Array.isArray(sheetData.pending) ? sheetData.pending : [];
const sheetCompleted = Array.isArray(sheetData.completed) ? sheetData.completed : [];
const sheetDerivedSlips: SlipRecord[] = [
  ...sheetPending.map((row, idx) => toSlipRecord(row, idx)).filter((record): record is SlipRecord => Boolean(record)),
  ...sheetCompleted
    .map((row, idx) => toSlipRecord(row, sheetPending.length + idx, 'Completed'))
    .filter((record): record is SlipRecord => Boolean(record))
];

const sheetColumnsFromData: string[] = (() => {
  const source = sheetPending[0] || sheetCompleted[0];
  if (!source) return [];
  return Object.keys(source).filter((key) => Boolean(key && key.trim()));
})();

function deriveContractsFromSlips(slips: SlipRecord[]): ContractRecord[] {
  const grouped = new Map<string, SlipRecord[]>();
  slips.forEach((slip) => {
    if (!grouped.has(slip.contractId)) grouped.set(slip.contractId, []);
    grouped.get(slip.contractId)!.push(slip);
  });

  return Array.from(grouped.entries()).map(([contractId, contractSlips]) => {
    const completedCount = contractSlips.filter((slip) => slip.status === 'Completed').length;
    const mostRecent = contractSlips.reduce((latest, slip) =>
      dayjs(slip.updatedAt).isAfter(dayjs(latest.updatedAt)) ? slip : latest
    );
    const stage: ContractRecord['stage'] = completedCount === contractSlips.length ? 'Completed' : 'In Signature';

    return {
      id: contractId,
      envelopeId: contractId,
      clientName: mostRecent.clientName,
      salesRep: 'Unassigned',
      stage,
      docuSignStatus: mostRecent.docuSignStatus,
      pendingSigner: mostRecent.pendingSigner,
      lastActivity: mostRecent.updatedAt,
      slipCount: contractSlips.length,
      completedSlips: completedCount,
      googleSheetRow: undefined
    };
  });
}

const baseToday = dayjs();

export async function fetchPortalSnapshot(): Promise<PortalSnapshot> {
  // Simulated network latency for development
  await new Promise((resolve) => setTimeout(resolve, 250));

  const fallbackSlips: SlipRecord[] = [
    {
      id: 'SLIP-24001',
      contractId: 'CON-20240901',
      clientName: 'Sunset Apartments',
      status: 'Dispatched',
      statusRaw: 'Dispatched',
      docuSignStatus: 'Completed',
      scheduledDelivery: baseToday.add(2, 'hour').toISOString(),
      serviceAddress: '123 Palm Ave, Jacksonville, FL 32099',
      containerDetails: '30yd Roll-Off · Weekly · M/W/F',
      containerId: 'RO-30-07-AR4452',
      driverName: 'Carlos Vega',
      dispatcher: 'Mara James',
      slipLink: '#',
      navigationUrl: 'https://www.google.com/maps/dir/?api=1&destination=123+Palm+Ave+Jacksonville+FL+32099',
      updatedAt: baseToday.subtract(12, 'minute').toISOString(),
      raw: {
        ContractEnvelopeId: 'CON-20240901',
        ClientName: 'Sunset Apartments',
        Status: 'Dispatched',
        ServiceAddress: '123 Palm Ave, Jacksonville, FL 32099',
        ContainerSize: '30yd',
        ServiceDays: 'M/W/F',
        ContainerID: 'RO-30-07-AR4452',
        DeliveryDriverName: 'Carlos Vega',
        DeliveryDriverEmail: '',
        UpdatedAt: baseToday.subtract(12, 'minute').toISOString(),
        SlipLink: '#'
      }
    },
    {
      id: 'SLIP-24002',
      contractId: 'CON-20240902',
      clientName: 'Bayfront Seafood Market',
      status: 'Driver Out',
      statusRaw: 'Driver Out',
      docuSignStatus: 'Completed',
      scheduledDelivery: baseToday.add(45, 'minute').toISOString(),
      serviceAddress: '17 Ocean View Dr, Jacksonville, FL 32204',
      containerDetails: '6yd Front Load · 3x Week',
      containerId: 'FL-06-14-AR5571',
      driverName: 'Carlos Vega',
      dispatcher: 'Mara James',
      slipLink: '#',
      navigationUrl: 'https://www.google.com/maps/dir/?api=1&destination=17+Ocean+View+Dr+Jacksonville+FL+32204',
      updatedAt: baseToday.subtract(5, 'minute').toISOString(),
      raw: {
        ContractEnvelopeId: 'CON-20240902',
        ClientName: 'Bayfront Seafood Market',
        Status: 'Driver Out',
        ServiceAddress: '17 Ocean View Dr, Jacksonville, FL 32204',
        ContainerSize: '6yd',
        ServiceDays: '3x Week',
        ContainerID: 'FL-06-14-AR5571',
        DeliveryDriverName: 'Carlos Vega',
        DeliveryDriverEmail: '',
        UpdatedAt: baseToday.subtract(5, 'minute').toISOString(),
        SlipLink: '#'
      }
    },
    {
      id: 'SLIP-24003',
      contractId: 'CON-20240903',
      clientName: 'Harbor Tech Campus',
      status: 'Scheduling',
      statusRaw: 'Scheduling',
      docuSignStatus: 'Pending Staff Approver',
      pendingSigner: 'Operations Manager',
      scheduledDelivery: baseToday.add(1, 'day').hour(10).toISOString(),
      serviceAddress: '800 Innovation Way, Jacksonville, FL 32205',
      containerDetails: '40yd Roll-Off · On Call',
      containerId: 'RO-40-03-AR6120',
      driverName: 'Unassigned',
      dispatcher: 'Mara James',
      slipLink: '#',
      updatedAt: baseToday.subtract(2, 'hour').toISOString(),
      raw: {
        ContractEnvelopeId: 'CON-20240903',
        ClientName: 'Harbor Tech Campus',
        Status: 'Scheduling',
        ServiceAddress: '800 Innovation Way, Jacksonville, FL 32205',
        ContainerSize: '40yd',
        ServiceDays: 'On Call',
        ContainerID: 'RO-40-03-AR6120',
        DeliveryDriverName: 'Unassigned',
        DeliveryDriverEmail: '',
        UpdatedAt: baseToday.subtract(2, 'hour').toISOString(),
        SlipLink: '#'
      }
    },
    {
      id: 'SLIP-24004',
      contractId: 'CON-20240904',
      clientName: 'Southside Medical Plaza',
      status: 'Completed',
      statusRaw: 'Completed',
      docuSignStatus: 'Completed',
      scheduledDelivery: baseToday.subtract(3, 'hour').toISOString(),
      serviceAddress: '250 Medical Center Blvd, Jacksonville, FL 32216',
      containerDetails: '8yd Front Load · 2x Week',
      containerId: 'FL-08-19-AR6455',
      driverName: 'Jamie Chen',
      dispatcher: 'Avery Stone',
      slipLink: '#',
      updatedAt: baseToday.subtract(45, 'minute').toISOString(),
      raw: {
        ContractEnvelopeId: 'CON-20240904',
        ClientName: 'Southside Medical Plaza',
        Status: 'Completed',
        ServiceAddress: '250 Medical Center Blvd, Jacksonville, FL 32216',
        ContainerSize: '8yd',
        ServiceDays: '2x Week',
        ContainerID: 'FL-08-19-AR6455',
        DeliveryDriverName: 'Jamie Chen',
        DeliveryDriverEmail: '',
        UpdatedAt: baseToday.subtract(45, 'minute').toISOString(),
        SlipLink: '#'
      }
    }
  ];

  const slips: SlipRecord[] = sheetDerivedSlips.length > 0 ? sheetDerivedSlips : fallbackSlips;
  const sheetColumns: string[] = sheetDerivedSlips.length > 0
    ? (sheetColumnsFromData.length ? sheetColumnsFromData : Object.keys(sheetDerivedSlips[0]?.raw ?? {}))
    : Object.keys(fallbackSlips[0].raw);

  const fallbackContracts: ContractRecord[] = [
    {
      id: 'CON-20240901',
      envelopeId: '70b0f1ce-9a5d-4bb0-b78f-93c8bb9a12fe',
      clientName: 'Sunset Apartments',
      salesRep: 'Michelle Carter',
      stage: 'Completed',
      docuSignStatus: 'Completed',
      lastActivity: baseToday.subtract(1, 'day').toISOString(),
      pendingSigner: undefined,
      slipCount: 2,
      completedSlips: 1,
      googleSheetRow: 27
    },
    {
      id: 'CON-20240902',
      envelopeId: '2f6d214a-96fb-4f09-a901-715f471ac399',
      clientName: 'Bayfront Seafood Market',
      salesRep: 'Taylor Wright',
      stage: 'Completed',
      docuSignStatus: 'Completed',
      lastActivity: baseToday.subtract(3, 'hour').toISOString(),
      slipCount: 1,
      completedSlips: 0,
      pendingSigner: undefined,
      googleSheetRow: 32
    },
    {
      id: 'CON-20240903',
      envelopeId: '838d0ed4-4f33-46a4-8431-75ebfa3b862f',
      clientName: 'Harbor Tech Campus',
      salesRep: 'Michelle Carter',
      stage: 'In Signature',
      docuSignStatus: 'Pending Staff Approver',
      pendingSigner: 'ops@southernsanitation.com',
      lastActivity: baseToday.subtract(30, 'minute').toISOString(),
      slipCount: 3,
      completedSlips: 0,
      googleSheetRow: 41
    }
  ];

  const contracts: ContractRecord[] = sheetDerivedSlips.length > 0 ? deriveContractsFromSlips(slips) : fallbackContracts;

  const fallbackDriverAssignments: DriverAssignment[] = [
    {
      driverName: 'Carlos Vega',
      shiftDate: baseToday.format('YYYY-MM-DD'),
      stops: fallbackSlips
        .filter((s) => s.driverName === 'Carlos Vega')
        .map((s) => ({
          id: s.id,
          clientName: s.clientName,
          serviceAddress: s.serviceAddress,
          containerDetails: s.containerDetails,
          navigationUrl: s.navigationUrl,
          status: s.status
        }))
    },
    {
      driverName: 'Jamie Chen',
      shiftDate: baseToday.format('YYYY-MM-DD'),
      stops: fallbackSlips
        .filter((s) => s.driverName === 'Jamie Chen')
        .map((s) => ({
          id: s.id,
          clientName: s.clientName,
          serviceAddress: s.serviceAddress,
          containerDetails: s.containerDetails,
          navigationUrl: s.navigationUrl,
          status: s.status
        }))
    }
  ];

  const driverStops = new Map<string, DriverAssignment['stops']>();
  slips.forEach((slip) => {
    const driver = cleanText(slip.driverName);
    if (!driver || driver.toLowerCase() === 'unassigned') return;
    if (!driverStops.has(driver)) driverStops.set(driver, []);
    driverStops.get(driver)!.push({
      id: slip.id,
      clientName: slip.clientName,
      serviceAddress: slip.serviceAddress,
      containerDetails: slip.containerDetails,
      navigationUrl: slip.navigationUrl,
      status: slip.status
    });
  });

  const driverAssignments: DriverAssignment[] = driverStops.size > 0
    ? Array.from(driverStops.entries()).map(([driverName, stops]) => ({
        driverName,
        shiftDate: dayjs().format('YYYY-MM-DD'),
        stops
      }))
    : fallbackDriverAssignments;

  const salesLeads: SalesLead[] = [
    {
      id: 'LEAD-1024',
      businessName: 'Riverfront Marina',
      primaryContact: 'Alex Jordan',
      email: 'ajordan@riverfrontmarina.com',
      phone: '(904) 555-2411',
      stage: 'Proposal Sent',
      source: 'Referral',
      potentialValue: 1250,
      nextStep: 'Review proposal feedback; schedule onsite visit',
      updatedAt: baseToday.subtract(2, 'hour').toISOString()
    },
    {
      id: 'LEAD-1031',
      businessName: 'Oak Ridge HOA',
      primaryContact: 'Jamie Patel',
      email: 'jamie@oakridgehoa.org',
      phone: '(904) 555-4410',
      stage: 'Discovery Complete',
      source: 'Cold Outreach',
      potentialValue: 890,
      nextStep: 'Prepare quote for 4x weekly front-load service',
      updatedAt: baseToday.subtract(1, 'day').toISOString()
    },
    {
      id: 'LEAD-1035',
      businessName: 'Beacon Logistics',
      primaryContact: 'Sierra Ramos',
      email: 'sramos@beaconlogistics.com',
      stage: 'Negotiation',
      source: 'Inbound Website',
      potentialValue: 1650,
      nextStep: 'Finalize pricing with sales director',
      updatedAt: baseToday.subtract(30, 'minute').toISOString()
    }
  ];

  const quoteDrafts: SalesQuote[] = [
    {
      id: 'QUOTE-2409-04',
      leadId: 'LEAD-1024',
      businessName: 'Riverfront Marina',
      preparedBy: 'Taylor Wright',
      validUntil: baseToday.add(7, 'day').toISOString(),
      totalMonthly: 1250,
      status: 'Sent',
      summary: 'Weekly 20yd roll-off for marina clean-out + recycling add-on',
      serviceType: 'Roll Off',
      lineItems: [
        { description: '20yd Roll-Off Container · Weekly Haul', quantity: 4, unitPrice: 235, cadence: 'Per Haul' },
        { description: 'Delivery (one-time)', quantity: 1, unitPrice: 100, cadence: 'One-Time' },
       { description: 'Estimated Disposal (3 tons per haul)', quantity: 12, unitPrice: 51.5, cadence: 'Per Haul' }
      ],
      notes: 'Fuel surcharge of 10% applied to each haul. Disposal invoiced at actual tonnage.',
      terms: [
        'Customer responsible for ensuring clear access to container at time of service.',
        'No hazardous, liquid, or prohibited waste streams may be placed in the container.',
        'Invoices due NET 20; finance fee of 1.5% per month on past due balances.',
        'Customer indemnifies Southern Sanitation for any unauthorized waste disposal.'
      ],
      documentUrl: '#'
    },
    {
      id: 'QUOTE-2409-07',
      leadId: 'LEAD-1031',
      businessName: 'Oak Ridge HOA',
      preparedBy: 'Michelle Carter',
      validUntil: baseToday.add(5, 'day').toISOString(),
      totalMonthly: 890,
      status: 'Draft',
      summary: 'Four 8yd front-load containers · 4x weekly service',
      serviceType: 'Front Load',
      lineItems: [
        { description: '8yd Front Load Service · 4 pickups/week', quantity: 1, unitPrice: 500.48, cadence: 'Monthly' },
        { description: 'Landfill & environmental recovery fees', quantity: 1, unitPrice: 157.65, cadence: 'Monthly' }
      ],
      notes: 'Quoted rates exclude fuel surcharge (10%) and applicable taxes (8.25%).',
      terms: [
        'Initial term 24 months; auto-renews annually unless cancelled 60-120 days prior.',
        'Southern Sanitation retains ownership of equipment and must have unobstructed access.',
        'Excluded waste streams include hazardous, biomedical, or flammable materials.',
        'Customer responsible for damages beyond normal wear and tear.'
      ]
    },
    {
      id: 'QUOTE-2409-11',
      leadId: 'LEAD-1035',
      businessName: 'Beacon Logistics',
      preparedBy: 'Taylor Wright',
      validUntil: baseToday.add(3, 'day').toISOString(),
      totalMonthly: 1650,
      status: 'Accepted',
      summary: '30yd compactor rental with daily pick-up',
      serviceType: 'Roll Off',
      lineItems: [
        { description: '30yd Roll-Off Compactor Haul · Daily', quantity: 20, unitPrice: 265, cadence: 'Per Haul' },
        { description: 'Delivery & Install', quantity: 1, unitPrice: 100, cadence: 'One-Time' },
        { description: 'Monthly Rental (compactor standby)', quantity: 1, unitPrice: 260, cadence: 'Monthly' }
      ],
      notes: 'Disposal billed separately per actual landfill ticket (est. 51.5 per ton).',
      terms: [
        'Customer provides adequate pad/space to support truck and compactor weight.',
        'Finance fee of 1.5% per month applies to past due balances.',
        'Customer responsible for any municipal franchise or tipping fees outside published rates.'
      ],
      documentUrl: '#'
    }
  ];

  const metrics: MetricSummary = {
    pendingContracts: contracts.filter((c) => c.stage !== 'Completed').length,
    todaysDeliveries: slips.filter((s) => dayjs(s.scheduledDelivery).isSame(baseToday, 'day')).length,
    actionsRequired: slips.filter((s) => s.status === 'Scheduling' || s.status === 'Awaiting Documents').length,
    slipsAwaitingDriver: slips.filter((s) => s.driverName === 'Unassigned').length
  };

  return { metrics, slips, contracts, driverAssignments, salesLeads, salesQuotes: quoteDrafts, sheetColumns };
}
