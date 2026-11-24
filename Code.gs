/**
 * Receives one JSON POST per participant and writes one row to the "Responses" sheet.
 * Resubmitting with the same code replaces that participant's row (latest wins).
 * Bind this script to the Google Sheet (Extensions > Apps Script) and deploy as a web app.
 */

var SHEET_NAME = 'Responses';
var CODE_PATTERN = /^[A-HJKMNP-Z2-9]{6}$/; // must match CODE_ALPHABET in app.js

// Keep in sync with FIELDS in app.js. One column per piece holds its final group.
var FIELD_IDS = [
  'run-status', 'workflow', 'job', 'pipeline-name', 'pipeline-id', 'project', 'repo-name',
  'commit-sha', 'commit-message', 'branch', 'tag', 'trigger', 'pushed-by', 'start-time',
  'finish-time', 'approval', 'rerun', 'cancel', 'fix-workflow', 'test-failures'
];

var BASE_HEADERS = [
  'code', 'receivedAt', 'startedAt', 'endedAt', 'totalSeconds', 'deviceType', 'viewport',
  'resets', 'trayOrder'
];
var TAIL_HEADERS = ['piecesJson', 'eventLogJson'];

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    var data = JSON.parse(e.postData.contents);

    if (!data || typeof data.code !== 'string' || !CODE_PATTERN.test(data.code)) {
      return json_({ ok: false, error: 'invalid code' });
    }

    var sheet = getSheet_();
    var pieces = data.pieces || [];
    var groupById = {};
    pieces.forEach(function (p) { groupById[p.id] = p.group + ' #' + p.position + ' (' + p.moves + ' moves)'; });

    var row = [
      data.code,
      new Date(),
      data.startedAt || '',
      data.endedAt || '',
      data.totalSeconds || '',
      data.deviceType || '',
      data.viewport || '',
      data.resets || 0,
      (data.trayOrder || []).join(',')
    ];
    FIELD_IDS.forEach(function (id) { row.push(groupById[id] || ''); });
    row.push(JSON.stringify(pieces));
    row.push(JSON.stringify(data.log || []));

    var existing = findRow_(sheet, data.code);
    if (existing > 0) {
      sheet.getRange(existing, 1, 1, row.length).setValues([row]);
    } else {
      sheet.appendRow(row);
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignore) { /* not held */ }
  }
}

function doGet() {
  return json_({ ok: true, service: 'information-priorities' });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(BASE_HEADERS.concat(FIELD_IDS, TAIL_HEADERS));
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRow_(sheet, code) {
  var last = sheet.getLastRow();
  if (last < 2) return -1;
  var codes = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (var i = codes.length - 1; i >= 0; i--) {
    if (codes[i][0] === code) return i + 2;
  }
  return -1;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
