// index.js - Lambda for DocuSign Connect + Apps Script /send-service-slip
'use strict';

const AWS = require('aws-sdk');
const xml2js = require('xml2js');
const { google } = require('googleapis');
const docusign = require('docusign-esign');
const crypto = require('crypto');

const s3 = new AWS.S3();
const ddb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();
const secrets = new AWS.SecretsManager();
const lambdaClient = new AWS.Lambda();
const parser = new xml2js.Parser({ explicitArray: false, trim: true });

/* ===================== ENV ===================== */
const BUCKET = process.env.S3_BUCKET;
const TABLE = process.env.DDB_TABLE;
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SECRET_ARN = process.env.GOOGLE_SECRET_ARN;
const SNS_ARN = process.env.SNS_ARN;
const EXPECTED_API_KEY = process.env.API_KEY || '';
const SHEET_NAME = process.env.SHEET_NAME || 'ServiceSlips';

// DocuSign config
const DS_IK = (process.env.DOCUSIGN_INTEGRATION_KEY || '').trim();
const DS_USER_ID = (process.env.DOCUSIGN_USER_ID || '').trim();
const DS_ACCOUNT_ID = (process.env.DOCUSIGN_ACCOUNT_ID || '').trim();
const DS_OAUTH_BASE = ((process.env.DOCUSIGN_OAUTH_BASE_URL || 'account.docusign.com').replace(/^https?:\/\//,'')).trim();
const DS_REST_BASE = (process.env.DOCUSIGN_BASE_PATH || 'https://www.docusign.net/restapi').trim();
const DS_PRIVATE_KEY_SECRET_ARN =
  (process.env.DOCUSIGN_PRIVATE_KEY_SECRET_ARN || process.env.DOCUSIGN_JWT_SECRET_ARN || '').trim();
const DS_TEMPLATE_ID = (process.env.DOCUSIGN_TEMPLATE_ID || '').trim();

// Roles (must match Service Slip template)
const DS_SIGNER_ROLE_ENV   = (process.env.DOCUSIGN_SIGNER_ROLE   || 'SS Delivery Team').trim();
const DS_CC_ROLE_ENV       = (process.env.DOCUSIGN_CC_ROLE       || '').trim();
const DS_APPROVER_ROLE_ENV = (process.env.DOCUSIGN_APPROVER_ROLE || 'Staff Approver').trim();

// Signer (driver) + CC defaults
const DEFAULT_SIGNER_EMAIL = (process.env.SERVICE_SLIP_TO_EMAIL || '').trim();
const DEFAULT_SIGNER_NAME  = (process.env.SERVICE_SLIP_TO_NAME_SS_Delivery_Team || 'SS Delivery Team').trim();
const DELIVERY_CC_EMAIL = (process.env.DELIVERY_CC_EMAIL || '').trim();
const DELIVERY_CC_NAME  = (process.env.DELIVERY_CC_NAME  || 'Dispatch Team').trim();

// Staff approver defaults (optional)
const DEFAULT_APPROVER_EMAIL = (process.env.STAFF_APPROVER_EMAIL || '').trim();
const DEFAULT_APPROVER_NAME  = (process.env.STAFF_APPROVER_NAME  || 'Staff Approver').trim();

// Welcome email hook
const SS_SUBJECT_PREFIX = (process.env.SERVICE_SLIP_SUBJECT_PREFIX || 'Service Slip: ').trim();
const WELCOME_LAMBDA_ARN = (process.env.WELCOME_LAMBDA_ARN || '').trim();
const WELCOME_CC = (process.env.WELCOME_CC || '').trim(); // comma-separated

// Limit Connect processing to these *contract* templates (CSV, case-insensitive). Leave empty to accept all.
const CONTRACT_ALLOWED_TEMPLATE_IDS = (
  process.env.CONTRACT_ALLOWED_TEMPLATE_IDS ||
  '1eda2cbe-0073-4340-9bfe-d3aac29591b7'
).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

/* ===================== UTIL ===================== */
const safeEq  = (a,b) => (a||'').toLowerCase() === (b||'').toLowerCase();
const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;
const onStr = v => ['x','on','yes','true','1'].includes(String(v||'').toLowerCase());

async function getConnectSecret() {
  if (process.env.CONNECT_HMAC_SECRET) return process.env.CONNECT_HMAC_SECRET;
  if (process.env.CONNECT_HMAC_SECRET_ARN) {
    const sec = await secrets.getSecretValue({ SecretId: process.env.CONNECT_HMAC_SECRET_ARN }).promise();
    const s = sec.SecretString || Buffer.from(sec.SecretBinary || '', 'base64').toString('utf8');
    try { return JSON.parse(s).docusign_connect_hmac || s; } catch { return s; }
  }
  return null;
}

function verifyDocusignHmac(rawBody, headerValue, secret) {
  if (!headerValue || !secret) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
                         .update(rawBody, 'utf8')
                         .digest('base64');
  const got = headerValue.replace(/"/g, '');
  try { return crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected)); }
  catch { return false; }
}

/* ---------- Google Sheets ---------- */
async function getGoogleJwtClient() {
  if (!GOOGLE_SECRET_ARN) throw new Error('GOOGLE_SECRET_ARN not set');
  const sec = await secrets.getSecretValue({ SecretId: GOOGLE_SECRET_ARN }).promise();
  const secretString = sec.SecretString || (sec.SecretBinary && sec.SecretBinary.toString());
  if (!secretString) throw new Error('Google secret returned empty SecretString');
  const serviceAccount = JSON.parse(secretString);
  const jwtClient = new google.auth.JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  await jwtClient.authorize();
  return jwtClient;
}

function colNumberToLetter(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

async function appendRowByHeaders(valuesByHeader, targetSheetName = SHEET_NAME) {
  if (!SHEET_ID) throw new Error('SHEET_ID not configured');
  const jwt = await getGoogleJwtClient();
  const sheets = google.sheets({ version: 'v4', auth: jwt });

  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${targetSheetName}!1:1`
  });
  const sheetHeaders = (headerResp.data && headerResp.data.values && headerResp.data.values[0]) || [];
  const headerCount = Math.max(sheetHeaders.length, Object.keys(valuesByHeader || {}).length, 10);

  const colAResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID, range: `${targetSheetName}!A:A`
  });
  const colAValues = (colAResp.data && colAResp.data.values) ? colAResp.data.values : [];
  const colAText = [];
  for (let i = 0; i < colAValues.length; i++) {
    const row = colAValues[i];
    colAText.push((row && row.length && typeof row[0] !== 'undefined') ? String(row[0]) : '');
  }
  let firstEmptyRow = null;
  for (let i = 1; i < colAText.length; i++) {
    if (colAText[i] === '' || colAText[i] === null) { firstEmptyRow = i + 1; break; }
  }
  const nextRowIndex = firstEmptyRow ? firstEmptyRow : (colAText.length === 0 ? 2 : colAText.length + 1);

  const row = new Array(headerCount).fill('');
  sheetHeaders.forEach((h, i) => {
    if (!h) return;
    const key = String(h).trim();
    if (Object.prototype.hasOwnProperty.call(valuesByHeader, key)) {
      const val = valuesByHeader[key];
      row[i] = (val === null || typeof val === 'undefined') ? '' :
               (val instanceof Date ? val.toISOString() : String(val));
    }
  });

  const endColIndex = Math.max(sheetHeaders.length, headerCount);
  const lastColLetter = colNumberToLetter(endColIndex);
  const range = `${targetSheetName}!A${nextRowIndex}:${lastColLetter}${nextRowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID, range, valueInputOption: 'RAW', requestBody: { values: [row] }
  });

  console.log(`Wrote ${targetSheetName} row`, nextRowIndex);
  return { rowIndex: nextRowIndex };
}

/* ======= Sheet helper for archiving a completed slip ======= */
async function archiveCompletedRowByContract(contractEnvId, extraUpdates = {}) {
  if (!contractEnvId) return false;
  const jwt = await getGoogleJwtClient();
  const sheets = google.sheets({ version: 'v4', auth: jwt });

  // get sheet metadata
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
  const svcSheet = (meta.data.sheets || []).find(s => s.properties.title === SHEET_NAME);
  if (!svcSheet) { console.warn('ServiceSlips sheet not found'); return false; }
  const svcId = svcSheet.properties.sheetId;

  // headers in ServiceSlips
  const headersResp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!1:1` });
  const headers = (headersResp.data.values && headersResp.data.values[0]) || [];
  const hdrMap = {}; headers.forEach((h,i) => { if (h) hdrMap[String(h).trim()] = i; });

  const ceCol = hdrMap['ContractEnvelopeId'];
  if (typeof ceCol === 'undefined') { console.warn('ContractEnvelopeId column not found'); return false; }
  const ceLetter = colNumberToLetter(ceCol + 1);

  // scan ContractEnvelopeId column to find the row
  const colResp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!${ceLetter}:${ceLetter}` });
  const col = (colResp.data.values || []).map(r => (r && r[0]) ? String(r[0]) : '');
  let rowIndex = -1;
  for (let i = 1; i < col.length; i++) { if (col[i] === contractEnvId) { rowIndex = i + 1; break; } }
  if (rowIndex === -1) { console.log('No matching row in sheet for CEID', contractEnvId); return false; }

  // fetch that row's values
  const rowResp = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `${SHEET_NAME}!${rowIndex}:${rowIndex}` });
  let values = (rowResp.data.values && rowResp.data.values[0]) || [];

  // apply status + s3 fields before archiving
  const apply = (name, val) => { if (typeof hdrMap[name] !== 'undefined') { values[hdrMap[name]] = val; } };
  apply('Status', 'Service Slip Completed');
  apply('UpdatedAt', new Date().toISOString());
  if (extraUpdates.DocS3Key) apply('DocS3Key', extraUpdates.DocS3Key);
  if (extraUpdates.SlipLink) apply('SlipLink', extraUpdates.SlipLink);

  // ensure Completed sheet exists + header
  const compSheet = (meta.data.sheets || []).find(s => s.properties.title === 'Completed');
  if (!compSheet) {
    // create and add headers
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SHEET_ID,
      requestBody: {
        requests: [{ addSheet: { properties: { title: 'Completed' } } }]
      }
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: `Completed!1:1`,
      valueInputOption: 'RAW',
      requestBody: { values: [headers] }
    });
  } else {
    // if header empty, seed it
    const h = await sheets.spreadsheets.values.get({ spreadsheetId: SHEET_ID, range: `Completed!1:1` });
    const got = (h.data.values && h.data.values[0]) || [];
    if (got.length === 0) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SHEET_ID,
        range: `Completed!1:1`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] }
      });
    }
  }

  // append row to Completed
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `Completed!A:A`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [values] }
  });

  // delete from ServiceSlips
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [{
        deleteDimension: {
          range: { sheetId: svcId, dimension: 'ROWS', startIndex: rowIndex - 1, endIndex: rowIndex }
        }
      }]
    }
  });

  console.log('Archived row', rowIndex, 'to Completed for CEID', contractEnvId);
  return true;
}

/* ---------- S3 ---------- */
async function savePdfToS3(envelopeId, pdfBase64) {
  if (!BUCKET) throw new Error('S3_BUCKET not configured');
  const buffer = Buffer.from(pdfBase64, 'base64');
  const key = `contracts/${envelopeId}-${Date.now()}.pdf`;
  await s3.putObject({ Bucket: BUCKET, Key: key, Body: buffer, ContentType: 'application/pdf' }).promise();
  const signedUrl = s3.getSignedUrl
    ? s3.getSignedUrl('getObject', { Bucket: BUCKET, Key: key, Expires: 60 * 60 * 24 * 7 })
    : `s3://${BUCKET}/${key}`;
  return { key, signedUrl };
}

/* ---------- API-key gate ---------- */
function checkApiKey(headers) {
  const incomingKey = (headers && (headers['x-api-key'] || headers['X-API-Key'] || headers['X-API-KEY'])) || '';
  if (!incomingKey) return false;
  if (!EXPECTED_API_KEY) { console.warn('No EXPECTED_API_KEY set in Lambda env; rejecting by default'); return false; }
  return incomingKey === EXPECTED_API_KEY;
}

/* ===================== DocuSign helpers ===================== */
async function getDsPrivateKeyPem() {
  if (!DS_PRIVATE_KEY_SECRET_ARN) throw new Error('DOCUSIGN_PRIVATE_KEY_SECRET_ARN not set');
  const sec = await secrets.getSecretValue({ SecretId: DS_PRIVATE_KEY_SECRET_ARN }).promise();
  const secretString = sec.SecretString || (sec.SecretBinary && sec.SecretBinary.toString());
  if (!secretString) throw new Error('DocuSign private key secret empty');
  let possible = secretString;
  try { const obj = JSON.parse(secretString); possible = obj.private_key || obj.privateKey || obj.privateKeyPem || secretString; } catch {}
  return possible;
}

async function getDsApiClient() {
  if (!DS_IK || !DS_USER_ID || !DS_ACCOUNT_ID || !DS_TEMPLATE_ID) {
    throw new Error('Missing DOCUSIGN_* env vars (INTEGRATION_KEY, USER_ID, ACCOUNT_ID, TEMPLATE_ID).');
  }
  const dsClient = new docusign.ApiClient();
  dsClient.setBasePath(DS_REST_BASE);
  dsClient.setOAuthBasePath(DS_OAUTH_BASE);

  const privateKeyPem = await getDsPrivateKeyPem();
  const results = await dsClient.requestJWTUserToken(
    DS_IK, DS_USER_ID, ['signature', 'impersonation'], Buffer.from(privateKeyPem), 3600
  );
  const accessToken = results.body.access_token;
  dsClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);

  try {
    const ui = await dsClient.getUserInfo(accessToken);
    const acct = ui?.accounts?.find(a => a.accountId === DS_ACCOUNT_ID) || ui?.accounts?.[0];
    if (acct?.baseUri) {
      const resolved = acct.baseUri.endsWith('/restapi') ? acct.baseUri : `${acct.baseUri}/restapi`;
      dsClient.setBasePath(resolved);
      console.log('DocuSign resolved base path from userInfo:', resolved);
    } else {
      console.warn('userInfo returned no accounts/baseUri; using DOCUSIGN_BASE_PATH as-is.');
    }
  } catch (e) {
    console.warn('getUserInfo failed; using DOCUSIGN_BASE_PATH as-is.', e?.message || e);
  }
  return dsClient;
}

/* Build Tabs for Service Slip from payload (one container instance) */
function buildTabsFromPayload(payload) {
  const textTabs = [];

  // core identity/address fields
  if (payload.ARNumber)        textTabs.push({ tabLabel: 'ARCode', value: String(payload.ARNumber) });
  if (payload.ClientName)      textTabs.push({ tabLabel: 'ClientName', value: String(payload.ClientName) });
  if (payload.ClientEmail)     textTabs.push({ tabLabel: 'ClientEmail', value: String(payload.ClientEmail) });
  if (payload.BusinessName)    textTabs.push({ tabLabel: 'BusinessName', value: String(payload.BusinessName) });
  if (payload['Business Name']) textTabs.push({ tabLabel: 'Business Name', value: String(payload['Business Name']) });
  if (payload.ServiceAddress)  textTabs.push({ tabLabel: 'ServiceAddress', value: String(payload.ServiceAddress) });
  if (payload.BillingAddress)  textTabs.push({ tabLabel: 'BillingAddress', value: String(payload.BillingAddress) });
  if (payload.BillingAddress2) textTabs.push({ tabLabel: 'BillingAddress2', value: String(payload.BillingAddress2) });

  // container identifiers
  const cid = payload.ContainerNumber || payload.ContainerID || payload.ContainerId;
  if (cid) {
    ['ContainerNumber','Container ID #','Container ID','ContainerID'].forEach(lbl =>
      textTabs.push({ tabLabel: lbl, value: String(cid) })
    );
  }

  // echo main line fields too
  if (payload.Quantity)      textTabs.push({ tabLabel: 'Quantity', value: String(payload.Quantity) });
  if (payload.ContainerSize) textTabs.push({ tabLabel: 'ContainerSize', value: String(payload.ContainerSize) });
  if (payload.Frequency)     textTabs.push({ tabLabel: 'Frequency', value: String(payload.Frequency) });
  if (payload.ServiceDays)   textTabs.push({ tabLabel: 'ServiceDays', value: String(payload.ServiceDays) });

  if (payload.Notes)         textTabs.push({ tabLabel: 'Notes', value: String(payload.Notes) });
  if (payload.Notes2)        textTabs.push({ tabLabel: 'Notes2', value: String(payload.Notes2) });

  // date
  const today = new Date();
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const mmddyyyy = `${pad2(today.getMonth() + 1)}/${pad2(today.getDate())}/${today.getFullYear()}`;
  const dateTabs = [{ tabLabel: 'Date', value: mmddyyyy }];

  const checkboxTabs = [{ tabLabel: 'Start', selected: 'true' }];

  // Size normalization
  const sizeIn = (payload.ContainerSize || '').toString().trim().toLowerCase();
  const normSize = sizeIn.replace(/\s|-/g,'').replace(/yard|yds|yrd/g,'yd');
  ['2yd','4yd','6yd','8yd','10yd'].forEach(lbl => {
    if (normSize === lbl.toLowerCase()) checkboxTabs.push({ tabLabel: lbl, selected: 'true' });
  });

  // Frequency
  const freqStr = (payload.Frequency || '').toString().trim();
  const freqN = parseInt(freqStr, 10);
  if (!Number.isNaN(freqN) && freqN >= 1 && freqN <= 6) {
    checkboxTabs.push({ tabLabel: `Freq${freqN}`, selected: 'true' });
  }

  // Days
  let days = [];
  if (Array.isArray(payload.ServiceDays)) days = payload.ServiceDays;
  else if (typeof payload.ServiceDays === 'string') days = payload.ServiceDays.split(/[,\s]+/).filter(Boolean);
  const mark = (needle, label) => {
    const has = days.map(d => d.toLowerCase()).includes(needle.toLowerCase());
    if (has) checkboxTabs.push({ tabLabel: label, selected: 'true' });
  };
  mark('mon', 'SerD-M');
  mark('tue', 'SerD-T'); mark('tues','SerD-T');
  mark('wed', 'SerD-W');
  mark('thu', 'SerD-Thr'); mark('thur','SerD-Thr'); mark('thurs','SerD-Thr');
  mark('fri', 'SerD-F');
  mark('sat', 'SerD-S');

  return docusign.Tabs.constructFromObject({ textTabs, dateTabs, checkboxTabs });
}

async function getTemplateRoleNames(dsClient) {
  const templatesApi = new docusign.TemplatesApi(dsClient);
  const rec = await templatesApi.listRecipients(DS_ACCOUNT_ID, DS_TEMPLATE_ID);
  const signerRoles = (rec.signers || []).map(s => (s.roleName || '').trim()).filter(nonEmpty);
  const ccRoles     = (rec.carbonCopies || []).map(c => (c.roleName || '').trim()).filter(nonEmpty);
  console.log('Template signer roles:', signerRoles);
  console.log('Template CC roles:', ccRoles);
  return { signerRoles, ccRoles };
}

async function createEnvelopeWithTemplateRoles(envelopesApi, templateRoles, envelopeOpts = {}) {
  const envDef = new docusign.EnvelopeDefinition();
  envDef.templateId = DS_TEMPLATE_ID;
  envDef.templateRoles = templateRoles;
  if (envelopeOpts.emailSubject) envDef.emailSubject = envelopeOpts.emailSubject;
  if (envelopeOpts.customFields && Array.isArray(envelopeOpts.customFields) && envelopeOpts.customFields.length > 0) {
    envDef.customFields = docusign.CustomFields.constructFromObject({
      textCustomFields: envelopeOpts.customFields
    });
  }
  envDef.status = 'sent';
  const result = await envelopesApi.createEnvelope(DS_ACCOUNT_ID, { envelopeDefinition: envDef });
  return result.envelopeId;
}

/* ---------- Core sender: one Service Slip ---------- */
async function sendServiceSlipWithTemplate(payload) {
  if (!DS_TEMPLATE_ID) throw new Error('DOCUSIGN_TEMPLATE_ID not configured');

  const signerEmail = (payload.DriverEmail || payload.DeliveryEmail || DEFAULT_SIGNER_EMAIL || '').trim();
  const signerName  = (payload.AssignedTo  || payload.DeliveryName  || DEFAULT_SIGNER_NAME  || '').trim();
  if (!signerEmail) throw new Error('Driver email not provided (DriverEmail) and SERVICE_SLIP_TO_EMAIL not set');

  const dsClient = await getDsApiClient();
  const envelopesApi = new docusign.EnvelopesApi(dsClient);

  let signerRoleName = DS_SIGNER_ROLE_ENV;
  let ccRoleName     = DELIVERY_CC_EMAIL ? (DS_CC_ROLE_ENV || null) : null;
  const approverRoleName = DS_APPROVER_ROLE_ENV;

  try {
    const { signerRoles, ccRoles } = await getTemplateRoleNames(dsClient);
    signerRoleName = signerRoles.find(r => safeEq(r, DS_SIGNER_ROLE_ENV)) || signerRoles[0] || signerRoleName;
    if (ccRoles.length > 0) {
      ccRoleName = ccRoles.find(r => safeEq(r, DS_CC_ROLE_ENV)) || (ccRoles.length === 1 ? ccRoles[0] : ccRoleName);
    }
    console.log('DocuSign templateRoles ->', { signerRoleName, ccRoleName });
  } catch (e) {
    const http = e?.response;
    console.warn('listRecipients failed; falling back to env role names', {
      status: http?.status, data: http?.data, trace: http?.headers?.['x-docusign-tracetoken']
    });
  }

  const approverEmail = (payload.StaffApproverEmail || DEFAULT_APPROVER_EMAIL || '').trim();
  const approverName  = (payload.StaffApproverName  || DEFAULT_APPROVER_NAME  || '').trim();
  if (!approverEmail) {
    throw new Error('Missing StaffApproverEmail (template role "Staff Approver" is required). Provide it in payload or set STAFF_APPROVER_EMAIL env var.');
  }

  const tabs = buildTabsFromPayload(payload);  // apply same prefill to BOTH roles

  const templateRoles = [];
  templateRoles.push(
    docusign.TemplateRole.constructFromObject({
      roleName: approverRoleName, name: approverName, email: approverEmail, routingOrder: 1, tabs
    })
  );
  templateRoles.push(
    docusign.TemplateRole.constructFromObject({
      roleName: signerRoleName, name: signerName || 'SS Delivery Team',
      email: signerEmail, tabs, routingOrder: 2
    })
  );
  if (ccRoleName) {
    if (!DELIVERY_CC_EMAIL) { throw new Error('Template expects a CC role but DELIVERY_CC_EMAIL is empty.'); }
    templateRoles.push(
      docusign.TemplateRole.constructFromObject({
        roleName: ccRoleName, name: DELIVERY_CC_NAME || 'Dispatch Team', email: DELIVERY_CC_EMAIL
      })
    );
  }

  try {
    const emailSubject = `${SS_SUBJECT_PREFIX}${payload.ClientName || payload.BusinessName || ''}`.trim();
    const customFields = [
      { name: 'EnvelopeType', value: 'ServiceSlip', show: 'true' },
      { name: 'ClientEmail',  value: (payload.ClientEmail || '') },
      { name: 'ClientName',   value: (payload.ClientName  || payload.BusinessName || '') },
      { name: 'BusinessName', value: (payload.BusinessName || payload['Business Name'] || '') }, // NEW
      { name: 'ContractEnvelopeId', value: (payload.ContractEnvelopeId || '') }
    ];
    const envelopeId = await createEnvelopeWithTemplateRoles(envelopesApi, templateRoles, { emailSubject, customFields });
    return { envelopeId };
  } catch (dsErr) {
    const code    = dsErr?.response?.data?.errorCode;
    const message = dsErr?.response?.data?.message || dsErr?.message || String(dsErr);
    const trace   = dsErr?.response?.headers?.['x-docusign-tracetoken'];
    console.error('DocuSign send failed:', { code, message, trace, data: dsErr?.response?.data });
    throw dsErr;
  }
}

/* ---------- Multi-line / Multi-quantity expansion ---------- */
function normalizeQty(v, def = 1) {
  const n = parseInt((v ?? '').toString(), 10);
  return Number.isFinite(n) && n > 0 ? n : def;
}
function normStr(v) { return (v ?? '').toString().trim(); }

// Build array of per-slip payloads (clone base payload and override size/freq/days for each instance)
function expandServiceSlipRequests(base) {
  const lines = [
    {
      qty: normalizeQty(base.Quantity, 1),
      size: normStr(base.ContainerSize),
      freq: normStr(base.Frequency),
      days: normStr(base.ServiceDays),
      id:   normStr(base.ContainerID || base.ContainerNumber)
    },
    {
      qty: normalizeQty(base.Quantity2, 0),
      size: normStr(base.ContainerSize2),
      freq: normStr(base.Frequency2),
      days: normStr(base.ServiceDays2),
      id:   normStr(base.ContainerID2)
    },
    {
      qty: normalizeQty(base.Quantity3, 0),
      size: normStr(base.ContainerSize3),
      freq: normStr(base.Frequency3),
      days: normStr(base.ServiceDays3),
      id:   normStr(base.ContainerID3)
    }
  ];

  const slips = [];
  lines.forEach((ln, idx) => {
    const lineHasData = ln.size || ln.freq || ln.days || ln.id;
    if (!lineHasData && idx > 0) return;
    const qty = ln.qty || (idx === 0 ? 1 : 0);
    if (qty <= 0) return;
    for (let i = 0; i < qty; i++) {
      const p = { ...base };
      p.ContainerSize = ln.size || base.ContainerSize;
      p.Frequency     = ln.freq || base.Frequency;
      p.ServiceDays   = ln.days || base.ServiceDays;
      if (ln.id) p.ContainerNumber = ln.id;
      slips.push(p);
    }
  });
  return slips;
}

/* ---- Helpers to extract info from Connect ---- */
function extractServiceSlipSummaryFromTabs(tabMap) {
  const sizeLabels = ['2yd','4yd','6yd','8yd','10yd'];
  const containerSize = sizeLabels.find(lbl => onStr(tabMap[lbl])) || '';

  let frequency = '';
  for (let i = 1; i <= 6; i++) if (onStr(tabMap[`Freq${i}`])) { frequency = i; break; }

  const days = [];
  if (onStr(tabMap['SerD-M']))   days.push('Mon');
  if (onStr(tabMap['SerD-T']))   days.push('Tue');
  if (onStr(tabMap['SerD-W']))   days.push('Wed');
  if (onStr(tabMap['SerD-Thr'])) days.push('Thu');
  if (onStr(tabMap['SerD-F']))   days.push('Fri');
  if (onStr(tabMap['SerD-S']))   days.push('Sat');

  const containerId =
    tabMap.ContainerID || tabMap['Container ID #'] || tabMap['Container ID'] || tabMap['ContainerID'] || '';

  return {
    containerSize,
    frequency: frequency === '' ? '' : Number(frequency),
    serviceDays: days.join(' '),
    containerId
  };
}

/* ===================== Handler ===================== */
exports.handler = async (event) => {
  console.log('Event received', {
    routeKey: event.routeKey || (event.httpMethod && (event.httpMethod + ' ' + (event.rawPath || event.path))),
    path: event.rawPath || event.path
  });

  try {
    const headers = event.headers || {};
    const rawBody = event.isBase64Encoded
      ? Buffer.from((event.body || ''), 'base64').toString('utf8')
      : (event.body || '');

    const routeKey = event.routeKey || `${event.httpMethod || 'POST'} ${event.rawPath || event.path || ''}`;
    const isSendSlip =
      (routeKey && routeKey.includes('/send-service-slip')) ||
      (event.rawPath && event.rawPath.endsWith('/send-service-slip'));

    // 1) API key for /send-service-slip
    if (isSendSlip && !checkApiKey(headers)) {
      console.warn('Unauthorized: invalid or missing API key for send-service-slip');
      return { statusCode: 401, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
    }

    // 2) HMAC for Connect webhooks
    if (!isSendSlip) {
      const sigHeader = headers['x-docusign-signature-1'] || headers['X-DocuSign-Signature-1'];
      const secret = await getConnectSecret();
      if (secret && !verifyDocusignHmac(rawBody, sigHeader, secret)) {
        console.warn('Invalid DocuSign HMAC', { hasHeader: !!sigHeader });
        return { statusCode: 401, body: 'Invalid signature' };
      }
    }

    const contentType = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    console.log('routeKey', routeKey, 'contentType', contentType);

    /* ----------------- Route: send-service-slip ----------------- */
    if (isSendSlip) {
      let payload;
      try { payload = typeof rawBody === 'string' && rawBody.length ? JSON.parse(rawBody) : {}; }
      catch (e) { console.error('Invalid JSON payload', e); return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Invalid JSON body' }) }; }

      // 1) write row
      const valuesByHeader = Object.assign({}, payload);
      if (!valuesByHeader.CreatedAt) valuesByHeader.CreatedAt = new Date().toISOString();
      if (!valuesByHeader.Status)     valuesByHeader.Status     = 'Service Slip Initiated';
      if (!valuesByHeader.ServiceRep) valuesByHeader.ServiceRep = 'Pending Assignment';

      let appended;
      try { appended = await appendRowByHeaders(valuesByHeader, SHEET_NAME); }
      catch (err) {
        console.error('Failed to append from send-service-slip', err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: 'Failed to write sheet', detail: err.message }) };
      }

      // 2) Expand into N slips and send
      try {
        const slips = expandServiceSlipRequests(payload);
        if (slips.length === 0) throw new Error('No slip line-items found (check Quantity/ContainerSize/Frequency/ServiceDays fields).');

        const envelopeIds = [];
        for (const one of slips) {
          const res = await sendServiceSlipWithTemplate(one);
          envelopeIds.push(res.envelopeId);
        }

        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            rowIndex: appended?.rowIndex,
            newStatus: 'Service Slip Initiated',
            serviceSlipEnvelopeId: envelopeIds[0] || null,
            serviceSlipEnvelopeIds: envelopeIds,
            createdCount: envelopeIds.length
          })
        };
      } catch (dsErr) {
        const message = dsErr?.response?.data?.message || dsErr?.message || String(dsErr);
        console.error('DocuSign send failed:', message);
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            rowIndex: appended?.rowIndex,
            newStatus: 'Service Slip Initiated',
            serviceSlipEnvelopeId: null,
            warning: 'Sheet updated but DocuSign send failed',
            errorDetail: message
          })
        };
      }
    }

    /* ----------------- Route: DocuSign Connect webhook ----------------- */
    let parsed = null;
    try {
      if (contentType.indexOf('xml') !== -1 || (rawBody && rawBody.trim().startsWith('<'))) {
        parsed = await parser.parseStringPromise(rawBody);
      } else {
        parsed = rawBody && rawBody.trim().length ? JSON.parse(rawBody) : {};
      }
    } catch (parseErr) {
      console.warn('XML parse failed, trying JSON fallback:', parseErr.message);
      try { parsed = rawBody && rawBody.trim().length ? JSON.parse(rawBody) : {}; }
      catch (jErr) { console.error('Both XML and JSON parse failed', jErr); return { statusCode: 400, body: 'Invalid payload format' }; }
    }

    const envInfo = (parsed && parsed.DocuSignEnvelopeInformation) ? parsed.DocuSignEnvelopeInformation : parsed;

    // --- Extract essentials (before allow-list so we know if this is a Service Slip) ---
    let envelopeId = null, signerName = null, pdfBase64 = null, statusText = null;
    let isServiceSlip = false, clientEmailCF = '', clientNameCF = '', businessNameCF = '', contractEnvIdCF = '';

    try {
      if (envInfo?.EnvelopeStatus?.EnvelopeID) envelopeId = envInfo.EnvelopeStatus.EnvelopeID;
      else if (envInfo?.EnvelopeID) envelopeId = envInfo.EnvelopeID;
      else if (envInfo?.envelopeId) envelopeId = envInfo.envelopeId;
      else if (envInfo?.envelopeSummary?.envelopeId) envelopeId = envInfo.envelopeSummary.envelopeId;

      if (envInfo?.EnvelopeStatus?.UserName) signerName = envInfo.EnvelopeStatus.UserName;

      if (envInfo?.EnvelopeStatus?.Status) statusText = envInfo.EnvelopeStatus.Status;
      else if (envInfo?.status) statusText = envInfo.status;

      if (envInfo?.DocumentPDFs?.DocumentPDF) {
        const doc = envInfo.DocumentPDFs.DocumentPDF;
        pdfBase64 = Array.isArray(doc) ? doc[0].PDFBytes : doc.PDFBytes;
      }

      const cfArrays = [];
      if (envInfo?.EnvelopeStatus?.CustomFields?.CustomField) cfArrays.push(envInfo.EnvelopeStatus.CustomFields.CustomField);
      if (envInfo?.CustomFields?.CustomField) cfArrays.push(envInfo.CustomFields.CustomField);
      if (envInfo?.customFields?.textCustomFields) cfArrays.push(envInfo.customFields.textCustomFields);
      if (envInfo?.envelopeSummary?.customFields?.textCustomFields) cfArrays.push(envInfo.envelopeSummary.customFields.textCustomFields);
      const flatCF = []
        .concat(...cfArrays.map(x => Array.isArray(x) ? x : [x]))
        .filter(Boolean)
        .map(x => ({ name: (x.Name || x.name || '').toString(), value: (x.Value || x.value || '').toString() }));
      const cfMap = {}; flatCF.forEach(({name, value}) => { if (name) cfMap[name] = value; });
      isServiceSlip   = (cfMap.EnvelopeType || '').toLowerCase() === 'serviceslip';
      clientEmailCF   = cfMap.ClientEmail || cfMap['Client Email'] || '';
      clientNameCF    = cfMap.ClientName  || cfMap['Client Name']  || '';
      businessNameCF  = cfMap.BusinessName || cfMap['Business Name'] || '';
      contractEnvIdCF = cfMap.ContractEnvelopeId || '';
    } catch (err) { console.error('Failed to extract envelope info', err); }

    // Optional allow-list: only gate *contracts* (not Service Slips)
    if (!isServiceSlip && CONTRACT_ALLOWED_TEMPLATE_IDS.length) {
      const foundTemplateIds = new Set();
      (function walk(o) {
        if (!o || typeof o !== 'object') return;
        for (const [k,v] of Object.entries(o)) {
          if (typeof v === 'string' && /templateid/i.test(k)) {
            if (v.match(/[0-9a-fA-F-]{20,}/)) foundTemplateIds.add(v.toLowerCase());
          }
          if (v && typeof v === 'object') walk(v);
        }
      })(envInfo);

      if (foundTemplateIds.size) {
        const anyMatch = [...foundTemplateIds].some(id => CONTRACT_ALLOWED_TEMPLATE_IDS.includes(id));
        if (!anyMatch) {
          console.log('Connect: ignoring envelope (template not allow-listed for contract)', { foundTemplateIds: [...foundTemplateIds] });
          return { statusCode: 200, body: 'Ignored (template not allow-listed)' };
        }
      } else {
        console.log('Connect: no templateId found in payload (cannot verify allow-list for contract); continuing.');
      }
    }

    envelopeId = envelopeId || `env-${Date.now()}`;
    const now = new Date().toISOString();

    // Collect tab values to a map: tabLabel -> tabValue
    function pickTabs(info) {
      const out = {};
      try {
        const rs = info?.EnvelopeStatus?.RecipientStatuses?.RecipientStatus;
        const arr = Array.isArray(rs) ? rs : (rs ? [rs] : []);
        arr.forEach(r => {
          const tabs = r?.TabStatuses?.TabStatus;
          const tArr = Array.isArray(tabs) ? tabs : (tabs ? [tabs] : []);
          tArr.forEach(t => {
            const k = (t.TabLabel || '').toString().trim();
            const v = (t.TabValue || '').toString();
            if (k) out[k] = v;
          });
        });
      } catch {}
      return out;
    }
    const tabMap = pickTabs(envInfo);

    // Save first PDF if present
    let s3Key = null, s3Url = null;
    try {
      if (pdfBase64) {
        const s3res = await savePdfToS3(envelopeId, pdfBase64);
        s3Key = s3res.key; s3Url = s3res.signedUrl;
        console.log('Saved PDF to S3 key', s3Key);
      } else {
        console.log('No PDF found in payload');
      }
    } catch (err) { console.error('S3 putObject failed', err); }

    const completed = (statusText || '').toLowerCase() === 'completed';

    // ---- RECORD (contracts only; Service Slip webhooks are used for Welcome Email trigger) ----
    try {
      const item = {
        ContractEnvelopeId: envelopeId,
        Status: isServiceSlip ? (completed ? 'ServiceSlip Completed' : 'ServiceSlip Update') : 'Contract Signed',
        CreatedAt: now,
        DocS3Key: s3Key || null,
        SignerName: signerName || clientNameCF || null
      };
      await ddb.put({ TableName: TABLE, Item: item }).promise();
      console.log('Wrote item to DynamoDB:', item);
    } catch (err) { console.error('DynamoDB put failed', err); }

    // Append to Google Sheet for **contract** only
    if (!isServiceSlip) {
      try {
        const dayStr = (prefix = '') => {
          const val = [];
          const v = k => (tabMap[k] || '').toLowerCase();
          const P = prefix ? (s) => `SerD${prefix}-${s}` : (s) => `SerD-${s}`;
          if (onStr(v(P('M'))))   val.push('Mon');
          if (onStr(v(P('T'))))   val.push('Tue');
          if (onStr(v(P('W'))))   val.push('Wed');
          if (onStr(v(P('Thr')))) val.push('Thu');
          if (onStr(v(P('F'))))   val.push('Fri');
          if (onStr(v(P('S'))))   val.push('Sat');
          return val.join(' ');
        };

        const valuesByHeader = {
          ContractEnvelopeId: envelopeId,
          ClientName: tabMap.ClientName || tabMap['Client Name'] || clientNameCF || signerName || '',
          ClientEmail: tabMap.ClientEmail || tabMap['Client Email'] || clientEmailCF || '',
          BusinessName: tabMap.BusinessName || tabMap['Business Name'] || businessNameCF || '',
          ServiceAddress: tabMap.ServiceAddress || '',
          BillingAddress: tabMap.BillingAddress || '',
          BillingAddress2: tabMap.BillingAddress2 || '',
          ServiceRep: 'Pending Assignment',
          Status: 'Pending Slip',
          Quantity: tabMap.Quantity || '',
          ContainerSize: tabMap.ContainerSize || '',
          Frequency: tabMap.Frequency || '',
          ServiceDays: dayStr(''),
          Quantity2: tabMap.Quantity2 || '',
          ContainerSize2: tabMap.ContainerSize2 || '',
          Frequency2: tabMap.Frequency2 || '',
          ServiceDays2: dayStr('2'),
          Quantity3: tabMap.Quantity3 || '',
          ContainerSize3: tabMap.ContainerSize3 || '',
          Frequency3: tabMap.Frequency3 || '',
          ServiceDays3: dayStr('3'),
          ARNumber: tabMap.ARCode || '',
          AssignedTo: '',
          DriverEmail: '',
          ClaimedAt: '',
          CompletedAt: '',
          DocS3Key: s3Key || '',
          CreatedAt: now,
          SlipLink: s3Url || ''
        };

        const res = await appendRowByHeaders(valuesByHeader, SHEET_NAME);
        console.log('Appended row to Google Sheet for envelope', envelopeId, 'row', res.rowIndex);
      } catch (gsErr) { console.error('Failed to append to Google Sheet:', gsErr); }
    }

    // SNS for contracts only
    try {
      if (!isServiceSlip && SNS_ARN) {
        const msg = `New contract signed: ${envelopeId} (${signerName || clientNameCF || 'unknown'})`;
        await sns.publish({ TopicArn: SNS_ARN, Message: msg, Subject: 'New Contract Signed' }).promise();
        console.log('Published SNS message');
      }
    } catch (snsErr) { console.error('SNS publish failed', snsErr); }

    // Trigger Welcome Email AND archive sheet row when Service Slip completes
    if (isServiceSlip && completed) {
      // archive the row in the Google Sheet (by ContractEnvelopeId CF)
      try {
        const ok = await archiveCompletedRowByContract(
          contractEnvIdCF,
          { DocS3Key: s3Key || null, SlipLink: s3Url || null }
        );
        if (!ok) console.log('Archive row: nothing to do (row not found).');
      } catch (e) {
        console.error('Archive row failed:', e?.message || e);
      }

      // Welcome email
      if (WELCOME_LAMBDA_ARN) {
        try {
          const itemSummary = extractServiceSlipSummaryFromTabs(tabMap);

          // Pull contract PDF S3 key if we have the contract envelope id
          let contractDoc = null;
          if (contractEnvIdCF) {
            try {
              const getRes = await ddb.get({
                TableName: TABLE,
                Key: { ContractEnvelopeId: contractEnvIdCF }
              }).promise();
              const k = getRes?.Item?.DocS3Key;
              if (k) {
                contractDoc = {
                  type: 'contract',
                  s3Bucket: BUCKET,
                  s3Key: k,
                  filename: 'Service Agreement.pdf'
                };
              }
            } catch (e) {
              console.warn('DDB get for contract failed:', e?.message || e);
            }
          }

          const documents = [];
          if (contractDoc) documents.push(contractDoc);
          if (s3Key) {
            documents.push({
              type: 'serviceSlip',
              s3Bucket: BUCKET,
              s3Key,
              filename: 'Service Slip.pdf'
            });
          }

          const payload = {
            event: 'service-slip-completed',
            envelopeId,
            clientEmail: clientEmailCF || '',
            clientName: clientNameCF || signerName || '',
            businessName: businessNameCF || tabMap.BusinessName || tabMap['Business Name'] || '',
            items: [ itemSummary ],
            documents,
            ccList: WELCOME_CC ? WELCOME_CC.split(',').map(s => s.trim()).filter(Boolean) : []
          };

          await lambdaClient.invoke({
            FunctionName: WELCOME_LAMBDA_ARN,
            InvocationType: 'Event',
            Payload: JSON.stringify(payload)
          }).promise();

          console.log('Invoked Welcome Email Lambda for Service Slip', envelopeId);
        } catch (invErr) { console.error('Welcome Email Lambda invoke failed', invErr); }
      }
    }

    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('Error processing request:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
