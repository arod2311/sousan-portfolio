/****************  CONFIG  ****************/
const SHEET_NAME = "ServiceSlips";
const COMPLETED_SHEET = "Completed";
const LOOKUPS_SHEET = "Lookups";
const INITIATE_COLUMN_HDR = "InitiateSlip";

const DRIVER_NAME_HDR = "DeliveryDriverName";
const DRIVER_EMAIL_HDR = "DeliveryDriverEmail";
const APPROVER_NAME_HDR = "StaffApproverName";
const APPROVER_EMAIL_HDR = "StaffApproverEmail";

const REQUIRED_FIELDS_FOR_SLIP = [
  "ContractEnvelopeId",
  "ClientName",
  "ClientEmail",
  "ServiceAddress",
  "ContainerSize",
  "Frequency",
  APPROVER_EMAIL_HDR,
  APPROVER_NAME_HDR,
  DRIVER_NAME_HDR,
  DRIVER_EMAIL_HDR,
];

const FINAL_STATUSES = [
  "Service Slip Initiated",
  "Service Slip Sent",
  "Assigned",
  "Driver Out",
  "Driver Completed",
  "Completed",
  "Billing Pending",
  "Cancelled",
  "Service Slip Completed",
  "Welcome Email Sent",
  "Ready for Service Slip",
];

const PROTECT_HEADERS = ["SlipLink", "DocS3Key", "CreatedAt", "UpdatedAt"];

const SERVICE_ACCOUNT_EMAIL = (
  PropertiesService.getScriptProperties().getProperty(
    "SERVICE_ACCOUNT_EMAIL"
  ) || ""
).trim();

// --- Helpers for tolerant header/status handling ---
function findInitiateCol(hdr) {
  return (
    hdr[INITIATE_COLUMN_HDR] ||
    hdr["Initiate Slip"] ||
    hdr["Initate Slip"] ||
    hdr["Initiate"]
  );
}
function isReadyStatus(s) {
  const x = String(s || "")
    .toLowerCase()
    .trim();
  return (
    x === "ready for service slip" ||
    x === "ready for services" ||
    x === "ready for service" ||
    x.indexOf("ready for service") !== -1
  );
}

/****************  MENU  ****************/
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("ServiceSlip")
    .addItem("Run setup (dropdowns + protection)", "setupLookupsAndValidation")
    .addItem("Install/repair onEdit trigger", "installOnEditTrigger")
    .addSeparator()
    .addItem("Validate selected row", "menuValidateSelectedRow")
    .addItem("Initiate selected row (manual)", "menuInitiateSelectedRow")
    .addSeparator()
    .addItem(
      "Grant SA to protections (repair)",
      "grantServiceAccountToProtections"
    )
    .addItem("Sweep & archive completed rows", "sweepForCompleted")
    .addToUi();
}

/****************  SETUP  ****************/
function setupLookupsAndValidation() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  const look = ss.getSheetByName(LOOKUPS_SHEET);
  if (!sheet || !look) {
    SpreadsheetApp.getUi().alert(
      `Missing required sheets. Ensure "${SHEET_NAME}" and "${LOOKUPS_SHEET}" exist.`
    );
    return;
  }

  // Lookups: A reps, B statuses, C driver name, D driver email, E approver name, F approver email
  const lastLookRow = Math.max(2, look.getLastRow());
  const repsRange = look.getRange(2, 1, Math.max(1, lastLookRow - 1), 1);
  const statusRange = look.getRange(2, 2, Math.max(1, lastLookRow - 1), 1);
  const driverNameRange = look.getRange(2, 3, Math.max(1, lastLookRow - 1), 1);
  const driverEmailRange = look.getRange(2, 4, Math.max(1, lastLookRow - 1), 1);
  const approverNameRange = look.getRange(
    2,
    5,
    Math.max(1, lastLookRow - 1),
    1
  );
  const approverEmailRange = look.getRange(
    2,
    6,
    Math.max(1, lastLookRow - 1),
    1
  );

  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((h) => (h || "").toString().trim());
  const hdrMap = {};
  headers.forEach((h, i) => {
    if (h) hdrMap[h] = i + 1;
  });

  const setDropdown = (headerName, range) => {
    const col = hdrMap[headerName];
    if (!col) return;
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(range, true)
      .setAllowInvalid(false)
      .build();
    sheet.getRange(2, col, sheet.getMaxRows() - 1).setDataValidation(rule);
  };

  if (hdrMap["ServiceRep"]) setDropdown("ServiceRep", repsRange);
  if (hdrMap["Status"]) setDropdown("Status", statusRange);

  setDropdown(DRIVER_NAME_HDR, driverNameRange);
  setDropdown(DRIVER_EMAIL_HDR, driverEmailRange);
  setDropdown(APPROVER_NAME_HDR, approverNameRange);
  setDropdown(APPROVER_EMAIL_HDR, approverEmailRange);

  // Force InitiateSlip as checkbox
  const initCol =
    hdrMap[INITIATE_COLUMN_HDR] ||
    hdrMap["Initiate Slip"] ||
    hdrMap["Initate Slip"] ||
    hdrMap["Initiate"];
  if (initCol) {
    const rng = sheet.getRange(2, initCol, sheet.getMaxRows() - 1);
    const rule = SpreadsheetApp.newDataValidation()
      .requireCheckbox()
      .setAllowInvalid(true)
      .build();
    rng.setDataValidation(rule);
  }

  protectOutputColumns(sheet);
  try {
    look.hideSheet();
  } catch (e) {}
  SpreadsheetApp.getUi().alert(
    "Setup complete: dropdowns + Initiate checkbox applied, and columns protected."
  );
}

function installOnEditTrigger() {
  const project = ScriptApp.getProjectTriggers();
  project.forEach((t) => {
    if (t.getHandlerFunction() === "onEditHandler") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("onEditHandler")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  SpreadsheetApp.getUi().alert("onEdit trigger installed.");
}

/****************  PROTECTION  ****************/
function protectOutputColumns(sheet) {
  if (!sheet) return;

  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => {
    const d = p.getDescription() || "";
    if (d.indexOf("ServiceSlip_protect_") === 0) p.remove();
  });

  const hdrMap = getHeaderMap(sheet);
  const owner = Session.getEffectiveUser();
  const editorsToAdd = [];
  if (owner) editorsToAdd.push(owner.getEmail());
  if (SERVICE_ACCOUNT_EMAIL) editorsToAdd.push(SERVICE_ACCOUNT_EMAIL);

  ["SlipLink", "DocS3Key", "CreatedAt", "UpdatedAt"].forEach((h) => {
    const col = hdrMap[h];
    if (!col) return;
    const rng = sheet.getRange(2, col, sheet.getMaxRows() - 1);
    const prot = rng.protect();
    prot.setDescription("ServiceSlip_protect_" + h);
    const current = prot.getEditors().map((u) => u.getEmail && u.getEmail());
    editorsToAdd.forEach((email) => {
      if (email && current.indexOf(email) === -1) {
        try {
          prot.addEditor(email);
        } catch (e) {}
      }
    });
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  });

  const ss = sheet.getParent();
  const look = ss.getSheetByName(LOOKUPS_SHEET);
  if (look) {
    const prot = look.protect();
    prot.setDescription("ServiceSlip_protect_Lookups");
    const existing = prot.getEditors().map((u) => u.getEmail && u.getEmail());
    editorsToAdd.forEach((email) => {
      if (email && existing.indexOf(email) === -1) {
        try {
          prot.addEditor(email);
        } catch (e) {}
      }
    });
    if (prot.canDomainEdit()) prot.setDomainEdit(false);
  }
}

function grantServiceAccountToProtections() {
  if (!SERVICE_ACCOUNT_EMAIL) {
    SpreadsheetApp.getUi().alert(
      "Set SERVICE_ACCOUNT_EMAIL in Script Properties first."
    );
    return;
  }
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;

  let n = 0;
  sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => {
    const d = p.getDescription() || "";
    if (d.indexOf("ServiceSlip_protect_") === 0) {
      try {
        p.addEditor(SERVICE_ACCOUNT_EMAIL);
        n++;
      } catch (e) {}
    }
  });
  const look = ss.getSheetByName(LOOKUPS_SHEET);
  if (look) {
    look.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach((p) => {
      try {
        p.addEditor(SERVICE_ACCOUNT_EMAIL);
      } catch (e) {}
    });
    look.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach((p) => {
      try {
        p.addEditor(SERVICE_ACCOUNT_EMAIL);
      } catch (e) {}
    });
  }
  SpreadsheetApp.getUi().alert(
    `Service account added to ${n} protected ranges.`
  );
}

/****************  EDIT FLOW  ****************/
function onEditHandler(e) {
  try {
    if (!e || !e.range) return;
    const sheet = e.range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    // ---------- NEW: Row-level debounce (prevents rapid double-clicks) ----------
    const row = e.range.getRow();
    const sp = PropertiesService.getScriptProperties();
    const rowKey = "row_lock_" + row;
    const now = Date.now();
    const last = Number(sp.getProperty(rowKey) || 0);
    if (now - last < 8000) {
      // 8s window
      return; // ignore repeat within 8s
    }
    sp.setProperty(rowKey, String(now));

    const docLock = LockService.getDocumentLock();
    if (!docLock.tryLock(5000)) return; // someone else is running; bail

    try {
      autoFillDriverPairOnEdit(e);
    } catch (err) {
      console.error("autoFillDriverPairOnEdit err", err);
    }
    try {
      autoFillApproverPairOnEdit(e);
    } catch (err) {
      console.error("autoFillApproverPairOnEdit err", err);
    }
    try {
      autoSetReadyStatusOnEdit(e);
    } catch (err) {
      console.error("autoSetReadyStatusOnEdit err", err);
    }

    const hdr = getHeaderMap(sheet);
    const editedRow = e.range.getRow();
    const editedCol = e.range.getColumn();
    if (editedRow === 1) return;

    const statusCol = hdr["Status"];
    if (statusCol && editedCol === statusCol) {
      const s = (
        sheet.getRange(editedRow, statusCol).getValue() || ""
      ).toString();
      if (["Service Slip Completed", "Welcome Email Sent"].indexOf(s) !== -1) {
        maybeArchiveRow(sheet, hdr, editedRow);
        return;
      }
    }

    const checkboxCol = findInitiateCol(hdr);
    if (!checkboxCol || editedCol !== checkboxCol) return;

    const isChecked =
      e.value === "TRUE" ||
      e.value === true ||
      String(e.value).toLowerCase() === "true";
    if (!isChecked) return;

    if (hdr["Status"]) {
      const cur = (
        sheet.getRange(editedRow, hdr["Status"]).getValue() || ""
      ).toString();
      if (!isReadyStatus(cur)) {
        SpreadsheetApp.getActive().toast(
          "Not ready to initiate. Status: " + cur,
          "ServiceSlip",
          6
        );
        sheet.getRange(editedRow, checkboxCol).setValue(false);
        return;
      }
    }

    const missing = validateRequiredFields(sheet, hdr, editedRow);
    if (missing.length > 0) {
      SpreadsheetApp.getActive().toast(
        "Missing required: " + missing.join(", "),
        "ServiceSlip",
        8
      );
      sheet.getRange(editedRow, checkboxCol).setValue(false);
      return;
    }

    const payload = buildPayloadFromRow(sheet, hdr, editedRow);
    setCellIfHeaderExists(
      sheet,
      hdr,
      editedRow,
      "Status",
      "Service Slip Initiated"
    );
    setCellIfHeaderExists(
      sheet,
      hdr,
      editedRow,
      "UpdatedAt",
      new Date().toISOString()
    );
    sheet.getRange(editedRow, checkboxCol).setValue(false);

    const resp = callBackendToCreateServiceSlip(payload);
    if (resp && resp.success === true) {
      const n =
        resp.createdCount ||
        (resp.serviceSlipEnvelopeIds ? resp.serviceSlipEnvelopeIds.length : 1);
      SpreadsheetApp.getActive().toast(
        "Service Slip(s) initiated: " +
          n +
          (resp.serviceSlipEnvelopeId
            ? " (first: " + resp.serviceSlipEnvelopeId + ")"
            : ""),
        "ServiceSlip",
        6
      );
    } else {
      setCellIfHeaderExists(
        sheet,
        hdr,
        editedRow,
        "Status",
        "Ready for Service Slip"
      );
      SpreadsheetApp.getActive().toast(
        "Failed to send Service Slip" +
          (resp && resp.error ? ": " + resp.error : ""),
        "ServiceSlip",
        8
      );
    }
  } catch (err) {
    console.error("onEditHandler error", err);
    try {
      if (e && e.range) e.range.setValue(false);
    } catch (ignore) {}
    SpreadsheetApp.getActive().toast(
      "Error: " + (err && err.toString ? err.toString() : JSON.stringify(err)),
      "ServiceSlip",
      8
    );
  } finally {
    try {
      LockService.getDocumentLock().releaseLock();
    } catch (_) {}
  }
}

function autoSetReadyStatusOnEdit(e) {
  const sheet = e.range.getSheet();
  const r = e.range.getRow();
  if (r === 1) return;
  const hdr = getHeaderMap(sheet);
  const statusCol = hdr["Status"];
  if (!statusCol) return;

  const current = sheet.getRange(r, statusCol).getValue();
  if (FINAL_STATUSES.indexOf(current) !== -1) return;

  let allGood = true;
  for (const fld of REQUIRED_FIELDS_FOR_SLIP) {
    const c = hdr[fld];
    if (!c) {
      allGood = false;
      break;
    }
    const v = sheet.getRange(r, c).getValue();
    if (v === "" || v === null) {
      allGood = false;
      break;
    }
  }
  if (allGood) {
    const prev = sheet.getRange(r, statusCol).getValue();
    if (
      !prev ||
      prev === "" ||
      prev === "Pending Slip" ||
      prev === "Pending Assignment"
    ) {
      sheet.getRange(r, statusCol).setValue("Ready for Service Slip");
      if (hdr["UpdatedAt"])
        sheet.getRange(r, hdr["UpdatedAt"]).setValue(new Date().toISOString());
    }
  }
}

/*********** Auto-fill Name/Email pairs from Lookups ***********/
function autoFillDriverPairOnEdit(e) {
  const sheet = e.range.getSheet();
  const hdr = getHeaderMap(sheet);
  const row = e.range.getRow();
  if (row === 1) return;

  const editedCol = e.range.getColumn();
  const nameCol = hdr[DRIVER_NAME_HDR],
    emailCol = hdr[DRIVER_EMAIL_HDR];
  if (!nameCol && !emailCol) return;
  if (editedCol !== nameCol && editedCol !== emailCol) return;

  const look = SpreadsheetApp.getActive().getSheetByName(LOOKUPS_SHEET);
  if (!look) return;
  const vals = look
    .getRange(2, 3, Math.max(1, look.getLastRow() - 1), 4)
    .getValues();

  const nameToEmail = new Map();
  const emailToName = new Map();
  vals.forEach((r) => {
    const name = (r[0] || "").toString().trim();
    const email = (r[1] || "").toString().trim();
    if (name) nameToEmail.set(name.toLowerCase(), email);
    if (email) emailToName.set(email.toLowerCase(), name);
  });

  if (editedCol === nameCol) {
    const name = (sheet.getRange(row, nameCol).getValue() || "")
      .toString()
      .trim()
      .toLowerCase();
    const email = nameToEmail.get(name) || "";
    if (emailCol) sheet.getRange(row, emailCol).setValue(email);
  } else if (editedCol === emailCol) {
    const email = (sheet.getRange(row, emailCol).getValue() || "")
      .toString()
      .trim()
      .toLowerCase();
    const name = emailToName.get(email) || "";
    if (nameCol) sheet.getRange(row, nameCol).setValue(name);
  }
}

function autoFillApproverPairOnEdit(e) {
  const sheet = e.range.getSheet();
  const hdr = getHeaderMap(sheet);
  const row = e.range.getRow();
  if (row === 1) return;

  const editedCol = e.range.getColumn();
  const nameCol = hdr[APPROVER_NAME_HDR],
    emailCol = hdr[APPROVER_EMAIL_HDR];
  if (!nameCol && !emailCol) return;
  if (editedCol !== nameCol && editedCol !== emailCol) return;

  const look = SpreadsheetApp.getActive().getSheetByName(LOOKUPS_SHEET);
  if (!look) return;
  const vals = look
    .getRange(2, 5, Math.max(1, look.getLastRow() - 1), 2)
    .getValues();

  const nameToEmail = new Map();
  const emailToName = new Map();
  vals.forEach((r) => {
    const name = (r[0] || "").toString().trim();
    const email = (r[1] || "").toString().trim();
    if (name) nameToEmail.set(name.toLowerCase(), email);
    if (email) emailToName.set(email.toLowerCase(), name);
  });

  if (editedCol === nameCol) {
    const name = (sheet.getRange(row, nameCol).getValue() || "")
      .toString()
      .trim()
      .toLowerCase();
    const email = nameToEmail.get(name) || "";
    if (emailCol) sheet.getRange(row, emailCol).setValue(email);
  } else if (editedCol === emailCol) {
    const email = (sheet.getRange(row, emailCol).getValue() || "")
      .toString()
      .trim()
      .toLowerCase();
    const name = emailToName.get(email) || "";
    if (nameCol) sheet.getRange(row, nameCol).setValue(name);
  }
}

/****************  BACKEND CALL  ****************/
function callBackendToCreateServiceSlip(payload) {
  const props = PropertiesService.getScriptProperties();
  const API_URL = props.getProperty("API_URL");
  const API_KEY = props.getProperty("API_KEY");
  const API_SEC = props.getProperty("API_SECRET");

  if (!API_URL || !API_KEY) {
    return {
      success: false,
      error: "Missing API_URL or API_KEY in Script Properties",
    };
  }

  const bodyStr = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  let signature = "";

  if (API_SEC) {
    const rawSig = Utilities.computeHmacSignature(
      Utilities.MacAlgorithm.HMAC_SHA_256,
      timestamp + "." + bodyStr,
      API_SEC
    );
    signature = rawSig
      .map((b) => (b < 0 ? b + 256 : b).toString(16).padStart(2, "0"))
      .join("");
  }

  const options = {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: {
      "x-api-key": API_KEY,
      "x-timestamp": timestamp,
      ...(signature ? { "x-signature": signature } : {}),
    },
    payload: bodyStr,
    followRedirects: true,
    validateHttpsCertificates: true,
  };

  try {
    const resp = UrlFetchApp.fetch(API_URL, options);
    const code = resp.getResponseCode();
    const txt = resp.getContentText();
    let data;
    try {
      data = JSON.parse(txt);
    } catch {
      data = { raw: txt };
    }
    if (code >= 200 && code < 300) return data;
    return { success: false, error: "HTTP " + code + ": " + txt };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

/****************  ARCHIVE HELPERS  ****************/
function maybeArchiveRow(sheet, hdrMap, row) {
  const ss = sheet.getParent();
  const archive =
    ss.getSheetByName(COMPLETED_SHEET) || ss.insertSheet(COMPLETED_SHEET);
  const headers = Object.keys(hdrMap).sort((a, b) => hdrMap[a] - hdrMap[b]);

  if (archive.getLastRow() === 0) {
    const rowVals = new Array(headers.length).fill("");
    headers.forEach((h, i) => (rowVals[i] = h));
    archive.getRange(1, 1, 1, headers.length).setValues([rowVals]);
  }

  const values = sheet
    .getRange(row, 1, 1, sheet.getLastColumn())
    .getValues()[0];
  archive.appendRow(values);
  sheet.deleteRow(row);
  SpreadsheetApp.getUi().alert('Row archived to "' + COMPLETED_SHEET + '".');
}

function sweepForCompleted() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const hdr = getHeaderMap(sheet);
  const statusCol = hdr["Status"];
  if (!statusCol) return;

  for (let r = sheet.getLastRow(); r >= 2; r--) {
    const s = (sheet.getRange(r, statusCol).getValue() || "").toString();
    if (["Service Slip Completed", "Welcome Email Sent"].indexOf(s) !== -1) {
      maybeArchiveRow(sheet, hdr, r);
    }
  }
}

/****************  SMALL UTILITIES  ****************/
function validateRequiredFields(sheet, headerMap, row) {
  const missing = [];
  REQUIRED_FIELDS_FOR_SLIP.forEach((hdr) => {
    const col = headerMap[hdr];
    if (!col) {
      missing.push(hdr + " (column not found)");
      return;
    }
    const val = sheet.getRange(row, col).getValue();
    if (val === "" || val === null) missing.push(hdr);
  });
  return missing;
}
function buildPayloadFromRow(sheet, headerMap, row) {
  const payload = {};
  const maxCol = sheet.getLastColumn();
  for (let c = 1; c <= maxCol; c++) {
    const key = sheet.getRange(1, c).getValue();
    if (!key) continue;
    payload[key] = sheet.getRange(row, c).getValue();
  }
  return payload;
}
function getHeaderMap(sheet) {
  const headerRange = sheet.getRange(1, 1, 1, sheet.getLastColumn());
  const headers = headerRange.getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    if (h) map[h.toString().trim()] = i + 1;
  });
  return map;
}

/*************** MENU HELPERS ***************/
function menuValidateSelectedRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== SHEET_NAME) {
    SpreadsheetApp.getUi().alert(
      'Switch to the "' + SHEET_NAME + '" sheet first.'
    );
    return;
  }
  const hdr = getHeaderMap(sheet);
  const row = sheet.getActiveRange().getRow();
  if (row === 1) {
    SpreadsheetApp.getUi().alert("Select a data row");
    return;
  }
  const missing = validateRequiredFields(sheet, hdr, row);
  if (missing.length > 0)
    SpreadsheetApp.getUi().alert("Missing fields:\n" + missing.join("\n"));
  else SpreadsheetApp.getUi().alert("All required fields are present.");
}
function menuInitiateSelectedRow() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  if (sheet.getName() !== SHEET_NAME) {
    SpreadsheetApp.getUi().alert(
      'Switch to the "' + SHEET_NAME + '" sheet first.'
    );
    return;
  }
  const hdr = getHeaderMap(sheet);
  const row = sheet.getActiveRange().getRow();
  if (row === 1) {
    SpreadsheetApp.getUi().alert("Select a data row");
    return;
  }

  const curStatus = hdr["Status"]
    ? sheet.getRange(row, hdr["Status"]).getValue()
    : "";
  if (curStatus !== "Ready for Service Slip") {
    SpreadsheetApp.getUi().alert(
      'Status must be "Ready for Service Slip" to initiate from the menu. Current: ' +
        curStatus
    );
    return;
  }

  const missing = validateRequiredFields(sheet, hdr, row);
  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert(
      "Missing required fields:\n" + missing.join("\n")
    );
    return;
  }

  const payload = buildPayloadFromRow(sheet, hdr, row);
  setCellIfHeaderExists(sheet, hdr, row, "Status", "Service Slip Initiated");
  setCellIfHeaderExists(sheet, hdr, row, "UpdatedAt", new Date().toISOString());

  const resp = callBackendToCreateServiceSlip(payload);
  if (resp && resp.success === true) {
    const n =
      resp.createdCount ||
      (resp.serviceSlipEnvelopeIds ? resp.serviceSlipEnvelopeIds.length : 1);
    SpreadsheetApp.getUi().alert("Service Slip(s) initiated: " + n);
  } else {
    setCellIfHeaderExists(sheet, hdr, row, "Status", "Ready for Service Slip");
    SpreadsheetApp.getUi().alert(
      "Failed to initiate Service Slip: " +
        (resp && resp.error ? resp.error : "unknown")
    );
  }
}
function setCellIfHeaderExists(sheet, headerMap, row, headerName, value) {
  const col = headerMap[headerName];
  if (!col) return false;
  sheet.getRange(row, col).setValue(value);
  return true;
}
