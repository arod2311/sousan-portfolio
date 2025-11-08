// index.js - Lambda for DocuSign webhook + Apps Script send-service-slip endpoint
'use strict';

const AWS = require('aws-sdk');
const xml2js = require('xml2js');
const { google } = require('googleapis');
const docusign = require('docusign-esign');

const s3 = new AWS.S3();
const ddb = new AWS.DynamoDB.DocumentClient();
const sns = new AWS.SNS();
const secrets = new AWS.SecretsManager();

const parser = new xml2js.Parser({ explicitArray: false, trim: true });

// ----- Configuration from environment variables -----
const BUCKET = process.env.S3_BUCKET;
const TABLE = process.env.DDB_TABLE;
const SHEET_ID = process.env.SHEET_ID;
const GOOGLE_SECRET_ARN = process.env.GOOGLE_SECRET_ARN;
const SNS_ARN = process.env.SNS_ARN;
const EXPECTED_API_KEY = process.env.API_KEY || '';
const SHEET_NAME = process.env.SHEET_NAME || 'ServiceSlips';

// DocuSign config (existing variable names you shared)
const DS_IK = process.env.DOCUSIGN_INTEGRATION_KEY;     // Integration key (client id)
const DS_USER_ID = process.env.DOCUSIGN_USER_ID;        // API User GUID
const DS_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID;  // Account GUID
const DS_OAUTH_BASE = process.env.DOCUSIGN_OAUTH_BASE_URL || 'account-d.docusign.com'; // e.g. account-d.docusign.com or account.docusign.com
const DS_REST_BASE = process.env.DOCUSIGN_BASE_PATH || 'https://demo.docusign.net/restapi';
const DS_PRIVATE_KEY_SECRET_ARN =
  process.env.DOCUSIGN_PRIVATE_KEY_SECRET_ARN || process.env.DOCUSIGN_JWT_SECRET_ARN;
const DS_TEMPLATE_ID = process.env.DOCUSIGN_TEMPLATE_ID; // your Service Slip template

// Who receives/Signs the Service Slip (delivery team signer)
const DELIVERY_TO_EMAIL = process.env.SERVICE_SLIP_TO_EMAIL || process.env.DELIVERY_TO_EMAIL || '';
const DELIVERY_TO_NAME  = process.env.SERVICE_SLIP_TO_NAME  || process.env.DELIVERY_TO_NAME  || 'SS Delivery Team';

// ===== Google Sheets helpers =====
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
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * Append/update one row aligned to headers (no row insertion).
 * @param {object} valuesByHeader key = header text; value = cell value to write
 * @param {string} targetSheetName defaults to SHEET_NAME
 */
async function appendRowByHeaders(valuesByHeader, targetSheetName = SHEET_NAME) {
  if (!SHEET_ID) throw new Error('SHEET_ID not configured');
  const jwt = await getGoogleJwtClient();
  const sheets = google.sheets({ version: 'v4', auth: jwt });

  // 1) read header row
  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${targetSheetName}!1:1`
  });
  const headers = (headerResp.data && headerResp.data.values && headerResp.data.values[0]) || [];
  const headerCount = Math.max(headers.length, Object.keys(valuesByHeader || {}).length, 10);

  // 2) scan column A for first empty row
  const colAResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${targetSheetName}!A:A`
  });
  const colAValues = (colAResp.data && colAResp.data.values) ? colAResp.data.values : [];
  const colAText = [];
  for (let i = 0; i < colAValues.length; i++) {
    const row = colAValues[i];
    colAText.push((row && row.length && typeof row[0] !== 'undefined') ? String(row[0]) : '');
  }
  let firstEmptyRow = null;
  for (let i = 1; i < colAText.length; i++) {
    if (colAText[i] === '' || colAText[i] === null) {
      firstEmptyRow = i + 1;
      break;
    }
  }
  const nextRowIndex = firstEmptyRow ? firstEmptyRow : (colAText.length === 0 ? 2 : colAText.length + 1);

  // 3) build aligned row
  const row = new Array(headerCount).fill('');
  headers.forEach((h, i) => {
    if (!h) return;
    const key = String(h).trim();
    if (Object.prototype.hasOwnProperty.call(valuesByHeader, key)) {
      const val = valuesByHeader[key];
      row[i] = (val === null || typeof val === 'undefined') ? '' : (val instanceof Date ? val.toISOString() : String(val));
    }
  });

  // 4) write row
  const endColIndex = Math.max(headers.length, headerCount);
  const lastColLetter = colNumberToLetter(endColIndex);
  const range = `${targetSheetName}!A${nextRowIndex}:${lastColLetter}${nextRowIndex}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: range,
    valueInputOption: 'RAW',
    requestBody: { values: [row] }
  });

  console.log(`Wrote ${targetSheetName} row`, nextRowIndex);
  return { rowIndex: nextRowIndex };
}

// ===== S3 helper for contract PDFs (unchanged) =====
async function savePdfToS3(envelopeId, pdfBase64) {
  if (!BUCKET) throw new Error('S3_BUCKET not configured');
  const buffer = Buffer.from(pdfBase64, 'base64');
  const key = `contracts/${envelopeId}-${Date.now()}.pdf`;
  await s3.putObject({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: 'application/pdf'
  }).promise();
  const signedUrl = s3.getSignedUrl ? s3.getSignedUrl('getObject', { Bucket: BUCKET, Key: key, Expires: 60 * 60 * 24 * 7 }) : `s3://${BUCKET}/${key}`;
  return { key, signedUrl };
}

// ===== Simple API-key gate (unchanged) =====
function checkApiKey(headers) {
  const incomingKey = (headers && (headers['x-api-key'] || headers['X-API-Key'] || headers['X-API-KEY'])) || '';
  if (!incomingKey) return false;
  if (!EXPECTED_API_KEY) {
    console.warn('No EXPECTED_API_KEY set in Lambda env; rejecting by default');
    return false;
  }
  return incomingKey === EXPECTED_API_KEY;
}

// ===== DocuSign helpers (NEW) =====
async function getDsPrivateKeyPem() {
  if (!DS_PRIVATE_KEY_SECRET_ARN) throw new Error('DOCUSIGN_PRIVATE_KEY_SECRET_ARN not set');
  const sec = await secrets.getSecretValue({ SecretId: DS_PRIVATE_KEY_SECRET_ARN }).promise();
  const secretString = sec.SecretString || (sec.SecretBinary && sec.SecretBinary.toString());
  if (!secretString) throw new Error('DocuSign private key secret empty');
  const obj = JSON.parse(secretString);
  // support { "private_key":"REDACTED" } or { "privateKey": "..." }
  return obj.private_key || obj.privateKey || obj.privateKeyPem || secretString;
}

async function getDsApiClient() {
  if (!DS_IK || !DS_USER_ID || !DS_ACCOUNT_ID || !DS_TEMPLATE_ID) {
    throw new Error('Missing one of DOCUSIGN_* env vars (INTEGRATION_KEY, USER_ID, ACCOUNT_ID, TEMPLATE_ID).');
  }
  const dsClient = new docusign.ApiClient();
  dsClient.setBasePath(DS_REST_BASE);
  // SDK expects bare host for OAuth (no https://)
  const oauthHost = DS_OAUTH_BASE.replace(/^https?:\/\//, '');
  dsClient.setOAuthBasePath(oauthHost);

  const privateKeyPem = await getDsPrivateKeyPem();
  // Request JWT user token (1 hour)
  const results = await dsClient.requestJWTUserToken(
    DS_IK,
    DS_USER_ID,
    ['signature', 'impersonation'],
    Buffer.from(privateKeyPem),
    3600
  );
  const accessToken = results.body.access_token;
  dsClient.addDefaultHeader('Authorization', 'Bearer ' + accessToken);
  return dsClient;
}

/**
 * Build Tabs for your template from payload (using your data labels).
 * Note: If "ClientName" is a *Full Name standard field* in the template,
 * DocuSign will show the signer’s name, not this value. Use a Text field
 * if you need the customer’s name printed.
 */
function buildTabsFromPayload(payload) {
  const textTabs = [];

  // straight text fields
  if (payload.ARNumber)      textTabs.push({ tabLabel: 'ARCode', value: String(payload.ARNumber) });
  if (payload.ClientName)    textTabs.push({ tabLabel: 'ClientName', value: String(payload.ClientName) });
  if (payload.BusinessName)  textTabs.push({ tabLabel: 'BusinessName', value: String(payload.BusinessName) });
  if (payload.ServiceAddress)textTabs.push({ tabLabel: 'ServiceAddress', value: String(payload.ServiceAddress) });
  if (payload.BillingAddress)textTabs.push({ tabLabel: 'BillingAddress', value: String(payload.BillingAddress) });
  if (payload.BillingAddress2) textTabs.push({ tabLabel: 'BillingAddress2', value: String(payload.BillingAddress2) });
  if (payload.ContainerNumber) textTabs.push({ tabLabel: 'ContainerNumber', value: String(payload.ContainerNumber) });
  if (payload.Notes)         textTabs.push({ tabLabel: 'Comments', value: String(payload.Notes) });

  // Date fields
  const today = new Date();
  const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
  const mmddyyyy = `${pad2(today.getMonth() + 1)}/${pad2(today.getDate())}/${today.getFullYear()}`;
  const dateTabs = [{ tabLabel: 'Date', value: mmddyyyy }];

  // checkboxes: Start (always selected for new slips)
  const checkboxTabs = [{ tabLabel: 'Start', selected: 'true' }];

  // Container size checkboxes (2yd, 4yd, 6yd, 8yd, 10yd)
  const size = (payload.ContainerSize || '').toString().toLowerCase().trim();
  ['2yd','4yd','6yd','8yd','10yd'].forEach(lbl => {
    if (size === lbl.toLowerCase()) checkboxTabs.push({ tabLabel: lbl, selected: 'true' });
  });

  // Frequency/Weekly (Freq1..Freq6) - select one matching number
  const freqStr = (payload.Frequency || '').toString().trim();
  const freqN = parseInt(freqStr, 10);
  if (!Number.isNaN(freqN) && freqN >= 1 && freqN <= 6) {
    checkboxTabs.push({ tabLabel: `Freq${freqN}`, selected: 'true' });
  }

  // Service days (SerD-M, SerD-T, SerD-W, SerD-Thr, SerD-F, SerD-S)
  const addDay = (on, label) => { if (on) checkboxTabs.push({ tabLabel: label, selected: 'true' }); };
  // Accept multiple formats: payload.ServiceDays = "Mon,Wed,Fri" or array, or individual booleans
  let days = [];
  if (Array.isArray(payload.ServiceDays)) days = payload.ServiceDays;
  else if (typeof payload.ServiceDays === 'string') days = payload.ServiceDays.split(/[,\s]+/).filter(Boolean);
  const has = (needle) => days.map(d => d.toLowerCase()).includes(needle.toLowerCase());
  addDay(has('Mon') || payload.SerD_M,  'SerD-M');
  addDay(has('Tue') || has('Tues') || payload.SerD_T, 'SerD-T');
  addDay(has('Wed') || payload.SerD_W,  'SerD-W');
  addDay(has('Thu') || has('Thur') || has('Thurs') || payload.SerD_Thr, 'SerD-Thr');
  addDay(has('Fri') || payload.SerD_F,  'SerD-F');
  addDay(has('Sat') || payload.SerD_S,  'SerD-S');

  return docusign.Tabs.constructFromObject({
    textTabs,
    dateTabs,
    checkboxTabs
  });
}

async function sendServiceSlipWithTemplate(payload) {
  if (!DS_TEMPLATE_ID) throw new Error('DOCUSIGN_TEMPLATE_ID not configured');
  if (!DELIVERY_TO_EMAIL) throw new Error('SERVICE_SLIP_TO_EMAIL (or DELIVERY_TO_EMAIL) not set');

  const dsClient = await getDsApiClient();
  const envelopesApi = new docusign.EnvelopesApi(dsClient);

  const role = docusign.TemplateRole.constructFromObject({
    roleName: 'SS Delivery Team',                 // your template role
    name: payload.DeliveryName || DELIVERY_TO_NAME,
    email: payload.DeliveryEmail || DELIVERY_TO_EMAIL,
    tabs: buildTabsFromPayload(payload)
  });

  const envDef = new docusign.EnvelopeDefinition();
  envDef.templateId = DS_TEMPLATE_ID;
  envDef.templateRoles = [role];
  envDef.status = 'sent'; // immediately send

  const results = await envelopesApi.createEnvelope(DS_ACCOUNT_ID, {
    envelopeDefinition: envDef
  });

  return { envelopeId: results.envelopeId };
}

// ----- Main handler -----
exports.handler = async (event) => {
  console.log('Event received', { routeKey: event.routeKey || event.requestContext && event.requestContext.routeKey, path: event.rawPath || event.path });

  try {
    const headers = event.headers || {};
    if (!checkApiKey(headers)) {
      console.warn('Unauthorized: invalid or missing API key');
      return { statusCode: 401, body: JSON.stringify({ success: false, error: 'Unauthorized' }) };
    }

    // Normalize body text
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '');
    const contentType = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();
    const routeKey = event.routeKey || `${event.httpMethod || 'POST'} ${event.rawPath || event.path || ''}`;
    console.log('routeKey', routeKey, 'contentType', contentType);

    // ---- Route: send-service-slip (JSON payload from Apps Script) ----
    if ((routeKey && routeKey.includes('/send-service-slip')) || (event.rawPath && event.rawPath.endsWith('/send-service-slip'))) {
      let payload;
      try {
        payload = typeof rawBody === 'string' && rawBody.length ? JSON.parse(rawBody) : {};
      } catch (e) {
        console.error('Invalid JSON payload', e);
        return { statusCode: 400, body: JSON.stringify({ success: false, error: 'Invalid JSON body' }) };
      }

      // 1) write a row in ServiceSlips
      const valuesByHeader = Object.assign({}, payload);
      if (!valuesByHeader.CreatedAt) valuesByHeader.CreatedAt = new Date().toISOString();
      if (!valuesByHeader.Status)     valuesByHeader.Status     = 'Service Slip Initiated';
      if (!valuesByHeader.ServiceRep) valuesByHeader.ServiceRep = 'Pending Assignment';

      let appended;
      try {
        appended = await appendRowByHeaders(valuesByHeader, SHEET_NAME);
      } catch (err) {
        console.error('Failed to append from send-service-slip', err);
        return { statusCode: 500, body: JSON.stringify({ success: false, error: 'Failed to write sheet', detail: err.message }) };
      }

      // 2) send DocuSign Service Slip (NEW)
      let dsResult = {};
      try {
        dsResult = await sendServiceSlipWithTemplate(payload);
      } catch (dsErr) {
        console.error('DocuSign send failed:', dsErr);
        // We still return 200 so your sheet keeps the row, but flag the error.
        return {
          statusCode: 200,
          body: JSON.stringify({
            success: true,
            rowIndex: appended?.rowIndex,
            newStatus: 'Service Slip Initiated',
            serviceSlipEnvelopeId: null,
            warning: 'Sheet updated but DocuSign send failed',
            errorDetail: (dsErr && dsErr.message) || String(dsErr)
          })
        };
      }

      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          rowIndex: appended?.rowIndex,
          newStatus: 'Service Slip Initiated',
          serviceSlipEnvelopeId: dsResult.envelopeId
        })
      };
    }

    // ---- Route: DocuSign webhook (unchanged behavior) ----
    let parsed = null;
    try {
      if (contentType.indexOf('xml') !== -1 || (rawBody && rawBody.trim().startsWith('<'))) {
        parsed = await parser.parseStringPromise(rawBody);
      } else {
        parsed = rawBody && rawBody.trim().length ? JSON.parse(rawBody) : {};
      }
    } catch (parseErr) {
      console.warn('XML parse failed, trying JSON fallback:', parseErr.message);
      try {
        parsed = rawBody && rawBody.trim().length ? JSON.parse(rawBody) : {};
      } catch (jErr) {
        console.error('Both XML and JSON parse failed', jErr);
        return { statusCode: 400, body: 'Invalid payload format' };
      }
    }

    const envInfo = (parsed && parsed.DocuSignEnvelopeInformation) ? parsed.DocuSignEnvelopeInformation : parsed;
    let envelopeId = null;
    let signerName = null;
    let pdfBase64 = null;
    try {
      if (envInfo && envInfo.EnvelopeStatus && envInfo.EnvelopeStatus.EnvelopeID) envelopeId = envInfo.EnvelopeStatus.EnvelopeID;
      else envelopeId = `env-${Date.now()}`;
      if (envInfo && envInfo.EnvelopeStatus && envInfo.EnvelopeStatus.UserName) signerName = envInfo.EnvelopeStatus.UserName;
      if (envInfo.DocumentPDFs && envInfo.DocumentPDFs.DocumentPDF) {
        const doc = envInfo.DocumentPDFs.DocumentPDF;
        pdfBase64 = Array.isArray(doc) ? doc[0].PDFBytes : doc.PDFBytes;
      }
    } catch (err) {
      console.error('Failed to extract envelope info', err);
    }

    const now = new Date().toISOString();
    let s3Key = null;
    let s3Url = null;

    try {
      if (pdfBase64) {
        const s3res = await savePdfToS3(envelopeId, pdfBase64);
        s3Key = s3res.key;
        s3Url = s3res.signedUrl;
        console.log('Saved PDF to S3 key', s3Key);
      } else {
        console.log('No PDF found in payload');
      }
    } catch (err) {
      console.error('S3 putObject failed', err);
    }

    try {
      const item = {
        ContractEnvelopeId: envelopeId,
        Status: 'Contract Signed',
        CreatedAt: now,
        DocS3Key: s3Key || null,
        SignerName: signerName || null
      };
      await ddb.put({ TableName: TABLE, Item: item }).promise();
      console.log('Wrote item to DynamoDB:', item);
    } catch (err) {
      console.error('DynamoDB put failed', err);
    }

    try {
      const valuesByHeader = {
        ContractEnvelopeId: envelopeId,
        ClientName: signerName || '',
        ClientEmail: '',
        ServiceRep: 'Pending Assignment',
        Status: 'Pending Slip',
        ARNumber: '',
        ServiceAddress: '',
        ContainerSize: '',
        Frequency: '',
        AssignedTo: '',
        ClaimedAt: '',
        CompletedAt: '',
        DocS3Key: s3Key || '',
        CreatedAt: now,
        SlipLink: s3Url || ''
      };
      const res = await appendRowByHeaders(valuesByHeader, SHEET_NAME);
      console.log('Appended row to Google Sheet for envelope', envelopeId, 'row', res.rowIndex);
    } catch (gsErr) {
      console.error('Failed to append to Google Sheet:', gsErr);
    }

    try {
      if (SNS_ARN) {
        const msg = `New contract signed: ${envelopeId} (${signerName || 'unknown'})`;
        await sns.publish({ TopicArn: SNS_ARN, Message: msg, Subject: 'New Contract Signed' }).promise();
        console.log('Published SNS message');
      } else {
        console.warn('No SNS_ARN set; skipping SNS publish');
      }
    } catch (snsErr) {
      console.error('SNS publish failed', snsErr);
    }

    return { statusCode: 200, body: 'OK' };

  } catch (err) {
    console.error('Error processing webhook:', err);
    return { statusCode: 500, body: 'Internal error' };
  }
};
