import { useEffect, useMemo, useState } from 'react';
import { SalesLead, SalesQuote, QuoteLineItem } from '../lib/mockData';
import {
  frontLoadCityRates,
  frontLoadOutsideCityRates,
  frontLoadFees,
  FrontLoadSize,
  PickupsPerWeek,
  rollOffRates,
  RollOffSize,
  roundCurrency
} from '../data/pricing';
import { frontLoadTerms, rollOffTerms } from '../data/terms';

interface QuoteFormProps {
  leads: SalesLead[];
  onCreate: (quote: SalesQuote) => void;
  onCancel: () => void;
}

type ServiceType = 'Front Load' | 'Roll Off';

const pickupOptions: PickupsPerWeek[] = [1, 2, 3, 4, 5, 6];
const frontLoadSizes: FrontLoadSize[] = ['2', '4', '6', '8', '10'];
const rollOffSizes: RollOffSize[] = ['10', '15', '20', '30', '40'];

function sumRecurring(lineItems: QuoteLineItem[]): number {
  return lineItems
    .filter((item) => item.cadence === 'Monthly' || item.cadence === 'Per Haul')
    .reduce((total, item) => total + item.quantity * item.unitPrice, 0);
}

export function QuoteForm({ leads, onCreate, onCancel }: QuoteFormProps) {
  const [leadId, setLeadId] = useState<string>(leads[0]?.id ?? '');
  const [preparedBy, setPreparedBy] = useState('Taylor Wright');
  const [validUntil, setValidUntil] = useState(() => {
    const future = new Date();
    future.setDate(future.getDate() + 14);
    return future.toISOString().split('T')[0];
  });
  const [serviceType, setServiceType] = useState<ServiceType>('Front Load');
  const [notes, setNotes] = useState('Rates exclude applicable taxes (8.25%). Fuel surcharge applied to hauling activity.');

  // Front load specific state
  const [frontLoadSize, setFrontLoadSize] = useState<FrontLoadSize>('4');
  const [frontLoadPickups, setFrontLoadPickups] = useState<PickupsPerWeek>(2);
  const [frontLoadCount, setFrontLoadCount] = useState(1);
  const [frontLoadLocation, setFrontLoadLocation] = useState<'city' | 'outside-city'>('city');
  const [applyPromo, setApplyPromo] = useState(false);
  const [includeDeliveryFL, setIncludeDeliveryFL] = useState(true);

  // Roll-off specific state
  const [rollOffSize, setRollOffSize] = useState<RollOffSize>('20');
  const [haulsPerMonth, setHaulsPerMonth] = useState(4);
  const [tonsPerHaul, setTonsPerHaul] = useState(3);
  const [materialType, setMaterialType] = useState<keyof typeof rollOffRates.materialRates>('Construction Debris');
  const [disposalScenario, setDisposalScenario] = useState<keyof typeof rollOffRates.disposalScenarios>('Standard');
  const [includeDeliveryRO, setIncludeDeliveryRO] = useState(true);
  const [includeRental, setIncludeRental] = useState(false);

  useEffect(() => {
    if (leads.length === 0) {
      setLeadId('');
      return;
    }
    if (!leadId || !leads.some((lead) => lead.id === leadId)) {
      setLeadId(leads[0].id);
    }
  }, [leads, leadId]);

  const computedQuote = useMemo<SalesQuote | null>(() => {
    const lead = leads.find((item) => item.id === leadId);
    if (!lead) return null;

    if (serviceType === 'Front Load') {
      const rateTable = frontLoadLocation === 'city' ? frontLoadCityRates : frontLoadOutsideCityRates;
      const fees = frontLoadLocation === 'city' ? frontLoadFees.city : frontLoadFees.outsideCity;
      const serviceRate = rateTable[frontLoadSize].service[frontLoadPickups];
      const landfillRate = rateTable[frontLoadSize].landfill[frontLoadPickups];
      if (!serviceRate || !landfillRate) return null;

      const promoMultiplier = applyPromo ? 1 - fees.promoDiscountRate : 1;
      const netService = roundCurrency(serviceRate * promoMultiplier);
      const landfill = roundCurrency(landfillRate);
      const baseMonthly = roundCurrency((netService + landfill) * frontLoadCount);
      const fuelSurcharge = roundCurrency(baseMonthly * fees.fuelSurchargeRate);

      const lineItems: QuoteLineItem[] = [
        {
          description: `${frontLoadSize}yd Front Load Service · ${frontLoadPickups} pickups/week (${frontLoadCount} container${frontLoadCount > 1 ? 's' : ''})`,
          quantity: frontLoadCount,
          unitPrice: netService,
          cadence: 'Monthly'
        },
        {
          description: 'Landfill & environmental recovery fees',
          quantity: frontLoadCount,
          unitPrice: landfill,
          cadence: 'Monthly'
        },
        {
          description: `Fuel surcharge (${fees.fuelSurchargeRate * 100}% of service & landfill)`,
          quantity: 1,
          unitPrice: fuelSurcharge,
          cadence: 'Monthly'
        }
      ];

      if (includeDeliveryFL) {
        lineItems.push({
          description: 'Container delivery & placement',
          quantity: frontLoadCount,
          unitPrice: fees.delivery,
          cadence: 'One-Time'
        });
      }

      const totalMonthly = roundCurrency(sumRecurring(lineItems));
      const summary = `${frontLoadCount} × ${frontLoadSize}yd containers · ${frontLoadPickups} pickups/week · ${frontLoadLocation === 'city' ? 'City' : 'Outside City'} rates`;

      return {
        id: `QUOTE-${Date.now()}`,
        leadId: lead.id,
        businessName: lead.businessName,
        preparedBy,
        validUntil: new Date(validUntil).toISOString(),
        totalMonthly,
        status: 'Draft',
        summary,
        serviceType: 'Front Load',
        lineItems,
        notes,
        terms: frontLoadTerms
      };
    }

    // Roll-off
    const haulRate = rollOffRates.hauling[rollOffSize];
    const disposalRate =
      rollOffRates.materialRates[materialType] ?? rollOffRates.disposalScenarios[disposalScenario] ?? rollOffRates.disposalPerTon;
    const scenarioRate = rollOffRates.disposalScenarios[disposalScenario];
    const disposalPerTon = scenarioRate ?? disposalRate;

    const haulWithFuel = roundCurrency(haulRate * (1 + rollOffRates.fuelSurchargeRate));
    const disposalPerHaul = roundCurrency(disposalPerTon * tonsPerHaul);
    const adminPerHaul = roundCurrency(rollOffRates.adminFeePerTon * tonsPerHaul);

    const lineItems: QuoteLineItem[] = [
      {
        description: `${rollOffSize}yd Roll-Off Haul (${haulsPerMonth}×/month with fuel surcharge)`,
        quantity: haulsPerMonth,
        unitPrice: haulWithFuel,
        cadence: 'Per Haul'
      },
      {
        description: `Estimated Disposal (${tonsPerHaul} tons per haul · ${disposalScenario})`,
        quantity: haulsPerMonth,
        unitPrice: disposalPerHaul,
        cadence: 'Per Haul'
      },
      {
        description: 'Administrative recovery fee ($1 per ton)',
        quantity: haulsPerMonth,
        unitPrice: adminPerHaul,
        cadence: 'Per Haul'
      }
    ];

    if (includeDeliveryRO) {
      lineItems.push({
        description: 'Container delivery & placement',
        quantity: 1,
        unitPrice: rollOffRates.delivery[rollOffSize],
        cadence: 'One-Time'
      });
    }

    if (includeRental) {
      lineItems.push({
        description: 'Standby rental (no activity > 30 days)',
        quantity: 1,
        unitPrice: rollOffRates.monthlyRentalIdle,
        cadence: 'Monthly'
      });
    }

    const totalMonthly = roundCurrency(sumRecurring(lineItems));
    const summary = `${rollOffSize}yd roll-off · ${haulsPerMonth} haul${haulsPerMonth !== 1 ? 's' : ''}/month · ${tonsPerHaul} tons est./haul`;

    const rollNotes =
      notes ||
      'Actual landfill invoices may fluctuate based on certified scale tickets. Fuel surcharge of 10% applies to each haul.';

    return {
      id: `QUOTE-${Date.now()}`,
      leadId: lead.id,
      businessName: lead.businessName,
      preparedBy,
      validUntil: new Date(validUntil).toISOString(),
      totalMonthly,
      status: 'Draft',
      summary,
      serviceType: 'Roll Off',
      lineItems,
      notes: rollNotes,
      terms: rollOffTerms
    };
  }, [
    applyPromo,
    frontLoadCount,
    frontLoadLocation,
    frontLoadPickups,
    frontLoadSize,
    haulsPerMonth,
    includeDeliveryFL,
    includeDeliveryRO,
    includeRental,
    leadId,
    leads,
    materialType,
    notes,
    preparedBy,
    rollOffSize,
    serviceType,
    tonsPerHaul,
    validUntil,
    disposalScenario
  ]);

  const handleCreate = () => {
    if (!computedQuote) return;
    onCreate({ ...computedQuote, status: 'Draft' });
  };

  if (leads.length === 0) {
    return (
      <div className="card">
        Add at least one lead to generate a quote. Once a lead exists, you can configure service, pricing, and terms here.
      </div>
    );
  }

  return (
    <>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="quote-lead">Select lead</label>
          <select id="quote-lead" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
            {leads.map((lead) => (
              <option key={lead.id} value={lead.id}>
                {lead.businessName} · {lead.primaryContact}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="quote-prepared">Prepared by</label>
          <input id="quote-prepared" value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="quote-valid">Valid until</label>
          <input id="quote-valid" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
        </div>
        <div className="form-field">
          <label htmlFor="quote-service-type">Service type</label>
          <select
            id="quote-service-type"
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServiceType)}
          >
            <option value="Front Load">Front Load (Scheduled)</option>
            <option value="Roll Off">Roll Off (On Demand)</option>
          </select>
        </div>
      </div>

      {serviceType === 'Front Load' ? (
        <>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="fl-size">Container size (yd³)</label>
              <select id="fl-size" value={frontLoadSize} onChange={(e) => setFrontLoadSize(e.target.value as FrontLoadSize)}>
                {frontLoadSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} yd³
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="fl-count">Container count</label>
              <input
                id="fl-count"
                type="number"
                min={1}
                value={frontLoadCount}
                onChange={(e) => setFrontLoadCount(Number(e.target.value) || 1)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="fl-pickups">Pickups per week</label>
              <select
                id="fl-pickups"
                value={frontLoadPickups}
                onChange={(e) => setFrontLoadPickups(Number(e.target.value) as PickupsPerWeek)}
              >
                {pickupOptions.map((pickups) => (
                  <option key={pickups} value={pickups}>
                    {pickups}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="fl-location">Location</label>
              <select
                id="fl-location"
                value={frontLoadLocation}
                onChange={(e) => setFrontLoadLocation(e.target.value as 'city' | 'outside-city')}
              >
                <option value="city">City service area</option>
                <option value="outside-city">Outside city limits</option>
              </select>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Promotions</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, opacity: frontLoadLocation !== 'city' ? 0.6 : 1 }}>
                <input
                  type="checkbox"
                  checked={applyPromo}
                  disabled={frontLoadLocation !== 'city'}
                  onChange={(e) => setApplyPromo(e.target.checked)}
                />
                Apply seasonal 25% discount (city routes only)
              </label>
            </div>
            <div className="form-field">
              <label>Delivery</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                <input type="checkbox" checked={includeDeliveryFL} onChange={(e) => setIncludeDeliveryFL(e.target.checked)} />
                Include container delivery fee
              </label>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="ro-size">Container size (yd³)</label>
              <select id="ro-size" value={rollOffSize} onChange={(e) => setRollOffSize(e.target.value as RollOffSize)}>
                {rollOffSizes.map((size) => (
                  <option key={size} value={size}>
                    {size} yd³
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="ro-hauls">Hauls per month</label>
              <input
                id="ro-hauls"
                type="number"
                min={1}
                value={haulsPerMonth}
                onChange={(e) => setHaulsPerMonth(Number(e.target.value) || 1)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="ro-tons">Estimated tons per haul</label>
              <input
                id="ro-tons"
                type="number"
                min={0.5}
                step={0.5}
                value={tonsPerHaul}
                onChange={(e) => setTonsPerHaul(Number(e.target.value) || 1)}
              />
            </div>
            <div className="form-field">
              <label htmlFor="ro-material">Material</label>
              <select
                id="ro-material"
                value={materialType}
                onChange={(e) => setMaterialType(e.target.value as keyof typeof rollOffRates.materialRates)}
              >
                {Object.keys(rollOffRates.materialRates).map((material) => (
                  <option key={material} value={material}>
                    {material}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="ro-scenario">Landfill scenario</label>
              <select
                id="ro-scenario"
                value={disposalScenario}
                onChange={(e) => setDisposalScenario(e.target.value as keyof typeof rollOffRates.disposalScenarios)}
              >
                {Object.keys(rollOffRates.disposalScenarios).map((scenario) => (
                  <option key={scenario} value={scenario}>
                    {scenario}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="form-grid">
            <div className="form-field">
              <label>Delivery</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                <input type="checkbox" checked={includeDeliveryRO} onChange={(e) => setIncludeDeliveryRO(e.target.checked)} />
                Include delivery fee
              </label>
            </div>
            <div className="form-field">
              <label>Standby rental</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                <input type="checkbox" checked={includeRental} onChange={(e) => setIncludeRental(e.target.checked)} />
                Add monthly rental if inactive over 30 days
              </label>
            </div>
          </div>
        </>
      )}

      <div className="form-field">
        <label htmlFor="quote-notes">Client notes</label>
        <textarea id="quote-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      {computedQuote ? (
        <div className="quote-preview">
          <div className="quote-summary">
            <div>
              <strong>Monthly Estimate</strong>
              <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>${computedQuote.totalMonthly.toFixed(2)}</div>
            </div>
            <div>
              <strong>Service</strong>
              <div>{computedQuote.summary}</div>
            </div>
            <div>
              <strong>Prepared For</strong>
              <div>{computedQuote.businessName}</div>
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
              {computedQuote.lineItems.map((item, idx) => (
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
          <div className="quote-totals">Estimated Monthly Recurring: ${computedQuote.totalMonthly.toFixed(2)}</div>
          <div className="quote-terms">
            <h3>Key Terms</h3>
            <ul>
              {computedQuote.terms.map((term) => (
                <li key={term}>{term}</li>
              ))}
            </ul>
            {computedQuote.notes ? <p style={{ marginTop: '12px' }}>{computedQuote.notes}</p> : null}
          </div>
        </div>
      ) : (
        <div className="card">Select options to preview pricing.</div>
      )}

      <div className="form-actions">
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button-primary" onClick={handleCreate} disabled={!computedQuote}>
          Create Quote
        </button>
      </div>
    </>
  );
}
