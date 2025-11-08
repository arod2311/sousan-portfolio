import { useState } from 'react';
import { LeadStage, SalesLead } from '../lib/mockData';

interface LeadFormProps {
  onSubmit: (lead: SalesLead) => void;
  onCancel: () => void;
  defaultStage?: LeadStage;
}

const stageOptions: LeadStage[] = ['New', 'Discovery Complete', 'Proposal Sent', 'Negotiation', 'Closed Won', 'Closed Lost'];

export function LeadForm({ onSubmit, onCancel, defaultStage = 'New' }: LeadFormProps) {
  const [businessName, setBusinessName] = useState('');
  const [primaryContact, setPrimaryContact] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('Referral');
  const [stage, setStage] = useState<LeadStage>(defaultStage);
  const [potentialValue, setPotentialValue] = useState<number>(0);
  const [nextStep, setNextStep] = useState('Schedule discovery call');

  const canSubmit = businessName.trim().length > 0 && primaryContact.trim().length > 0 && email.trim().length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const now = new Date().toISOString();
    const lead: SalesLead = {
      id: `LEAD-${Date.now()}`,
      businessName: businessName.trim(),
      primaryContact: primaryContact.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      stage,
      source,
      potentialValue,
      nextStep: nextStep.trim(),
      updatedAt: now
    };
    onSubmit(lead);
  };

  return (
    <>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="lead-business">Business name</label>
          <input id="lead-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Client or prospect company" />
        </div>
        <div className="form-field">
          <label htmlFor="lead-contact">Primary contact</label>
          <input id="lead-contact" value={primaryContact} onChange={(e) => setPrimaryContact(e.target.value)} placeholder="Name of decision maker" />
        </div>
        <div className="form-field">
          <label htmlFor="lead-email">Email</label>
          <input id="lead-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </div>
        <div className="form-field">
          <label htmlFor="lead-phone">Phone</label>
          <input id="lead-phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
        </div>
        <div className="form-field">
          <label htmlFor="lead-source">Source</label>
          <select id="lead-source" value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="Referral">Referral</option>
            <option value="Inbound Website">Inbound Website</option>
            <option value="Cold Outreach">Cold Outreach</option>
            <option value="Trade Show">Trade Show</option>
            <option value="Partner">Partner</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="lead-stage">Stage</label>
          <select id="lead-stage" value={stage} onChange={(e) => setStage(e.target.value as LeadStage)}>
            {stageOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="form-field">
          <label htmlFor="lead-value">Potential monthly value ($)</label>
          <input
            id="lead-value"
            type="number"
            min={0}
            step={10}
            value={potentialValue}
            onChange={(e) => setPotentialValue(Number(e.target.value))}
          />
        </div>
      </div>
      <div className="form-field">
        <label htmlFor="lead-next-step">Next step</label>
        <textarea id="lead-next-step" value={nextStep} onChange={(e) => setNextStep(e.target.value)} />
      </div>
      <div className="form-actions">
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="button-primary" onClick={handleSubmit} disabled={!canSubmit}>
          Save Lead
        </button>
      </div>
    </>
  );
}

