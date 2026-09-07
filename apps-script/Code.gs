/**
 * Candy's Pub & Restaurant — Order Book backend.
 *
 * Standalone Apps Script that opens the Google Sheet by ID (SHEET_ID below) and
 * exposes a tiny JSON web app. Staff need no login; menu, open/closed tables and
 * sales history are shared across every device.
 *
 * Sheets (auto-created / auto-repaired on first run):
 *   Menu       : id | name | category | price | active
 *   Tabs       : id | name | openedAt | status | closedAt
 *   OrderLines : tabId | itemId | name | category | price | qty
 *   Settings   : key | value          (managerPin lives here)
 *
 * Deploy:  Deploy ▸ New deployment ▸ Web app ▸ Execute as: Me ▸ Access: Anyone.
 * The /exec URL goes into SCRIPT_URL in index.html.
 */

var SHEET_ID = '132OPfLtX-dKD-pVdNXHcQ9OJyMC3AoCxrJG2Xk5GJKw';
function book() { return SpreadsheetApp.openById(SHEET_ID); }

var SHEET_MENU     = 'Menu';
var SHEET_TABS     = 'Tabs';
var SHEET_LINES    = 'OrderLines';
var SHEET_SETTINGS = 'Settings';

var CLOSED_WINDOW_MS = 36 * 60 * 60 * 1000; // closed tables shown to bartenders (last 36h)
var DEFAULT_PIN = '1234';

// Seeded once, only if the Menu sheet is empty. Prices set later by the manager.
var SEED_MENU = [
  ['homemade-burger','Homemade Burger','Food'], ['cheese-burger','Cheese Burger','Food'],
  ['fillet-steak','Fillet Steak','Food'], ['rump-steak','Rump Steak','Food'],
  ['ribs','Pork Ribs','Food'], ['fish-and-chips','Fish & Chips','Food'],
  ['calamari','Calamari','Food'], ['oysters','Oysters','Food'],
  ['chicken-schnitzel','Chicken Schnitzel','Food'], ['chicken-pie','Chicken Pie','Food'],
  ['toasted-sarmie','Toasted Sandwich','Food'], ['boerie-roll','Boerewors Roll','Food'],
  ['chips','Chips / Fries','Food'], ['greek-salad','Greek Salad','Food'], ['breakfast','Full Breakfast','Food'],
  ['draught-beer','Draught Beer','Drink'], ['bottled-beer','Bottled Beer','Drink'],
  ['cider','Cider','Drink'], ['red-wine','Red Wine (glass)','Drink'],
  ['white-wine','White Wine (glass)','Drink'], ['cocktail','House Cocktail','Drink'],
  ['brandy-coke','Brandy & Coke','Drink'], ['sherry','Sherry','Drink'],
  ['coke','Coke','Drink'], ['lemonade','Lemonade','Drink'],
  ['still-water','Still Water','Drink'], ['sparkling-water','Sparkling Water','Drink'],
  ['coffee','Coffee','Drink'], ['cappuccino','Cappuccino','Drink']
];

// ---------- HTTP entry points ----------
function doGet(e)  { return handle((e && e.parameter) ? e.parameter : {}); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (err) {}
  return handle(body);
}

function handle(req) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (err) { return json({ ok:false, error:'busy' }); }
  try {
    ensureSheets();
    var a = req.action || 'bootstrap';
    switch (a) {
      case 'bootstrap':   return json(state());
      case 'analytics':   return json(analytics());
      case 'managerAuth': return json({ ok:true, manager: String(req.pin) === String(getSetting('managerPin', DEFAULT_PIN)) });
      case 'setPin':      return json(setPin(req.pin, req.newPin));
      case 'openTab':     openTab(req.name);                               return json(state());
      case 'addItem':     addItem(req.tabId, req.itemId, Number(req.qty)); return json(state());
      case 'setQty':      setQty(req.tabId, req.itemId, Number(req.qty));  return json(state());
      case 'closeTab':    closeTab(req.tabId);                             return json(state());
      case 'menuUpsert':  menuUpsert(req);                                 return json(state());
      case 'menuDelete':  menuDelete(req.id);                              return json(state());
      default:            return json({ ok:false, error:'unknown action: ' + a });
    }
  } catch (err) {
    return json({ ok:false, error:String(err) });
  } finally {
    lock.releaseLock();
  }
}

// ---------- shared state (menu + open/closed tables) ----------
function state() {
  var menu = rows(SHEET_MENU)
    .filter(function(r){ return String(r.active) !== 'false' && String(r.active) !== 'FALSE'; })
    .map(function(r){ return { id:r.id, name:r.name, category:(r.category==='Drink'?'Drink':'Food'),
      price:(r.price===''||r.price==null)?null:Number(r.price) }; });

  var byTab = {};
  rows(SHEET_LINES).forEach(function(l){
    (byTab[l.tabId] = byTab[l.tabId] || []).push({ id:l.itemId, name:l.name,
      category:(l.category==='Drink'?'Drink':'Food'),
      price:(l.price===''||l.price==null)?null:Number(l.price), qty:Number(l.qty) });
  });

  var open = [], closed = [], cutoff = Date.now() - CLOSED_WINDOW_MS;
  rows(SHEET_TABS).forEach(function(t){
    var items = byTab[t.id] || [];
    if (t.status === 'closed') {
      var ca = Number(t.closedAt) || 0;
      if (ca >= cutoff) closed.push({ id:t.id, name:t.name, opened:Number(t.openedAt)||0, closedAt:ca, items:items });
    } else {
      open.push({ id:t.id, name:t.name, opened:Number(t.openedAt)||0, items:items });
    }
  });
  closed.sort(function(a,b){ return b.closedAt - a.closedAt; });
  if (closed.length > 60) closed = closed.slice(0, 60);

  return { ok:true, menu:menu, open:open, closed:closed };
}

// ---------- analytics (manager reports, all closed history) ----------
function analytics() {
  var tz = Session.getScriptTimeZone() || 'Africa/Johannesburg';
  var closedAt = {};
  rows(SHEET_TABS).forEach(function(t){ if (t.status === 'closed') closedAt[t.id] = Number(t.closedAt) || 0; });

  var perDay = {}, items = {}, totalRevenue = 0, tableSet = {};
  rows(SHEET_LINES).forEach(function(l){
    var ca = closedAt[l.tabId]; if (!ca) return;                  // only settled tables are sales
    var price = (l.price===''||l.price==null) ? 0 : Number(l.price);
    var rev = price * Number(l.qty);
    var day = Utilities.formatDate(new Date(ca), tz, 'yyyy-MM-dd');
    if (!perDay[day]) perDay[day] = { date:day, total:0, tabs:{} };
    perDay[day].total += rev; perDay[day].tabs[l.tabId] = 1;
    if (!items[l.name]) items[l.name] = { name:l.name, qty:0, revenue:0 };
    items[l.name].qty += Number(l.qty); items[l.name].revenue += rev;
    totalRevenue += rev; tableSet[l.tabId] = 1;
  });

  var salesPerDay = Object.keys(perDay).sort().map(function(d){
    return { date:d, total:perDay[d].total, tables:Object.keys(perDay[d].tabs).length };
  });
  if (salesPerDay.length > 30) salesPerDay = salesPerDay.slice(-30);

  var topItems = Object.keys(items).map(function(k){ return items[k]; })
    .sort(function(a,b){ return b.qty - a.qty; }).slice(0, 15);

  var today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var td = perDay[today] || { total:0, tabs:{} };
  return { ok:true, salesPerDay:salesPerDay, topItems:topItems, kpis:{
    today: td.total, todayTables: Object.keys(td.tabs).length,
    totalRevenue: totalRevenue, totalTables: Object.keys(tableSet).length } };
}

// ---------- table actions ----------
function openTab(name) {
  name = String(name || '').trim(); if (!name) throw 'name required';
  sheet(SHEET_TABS).appendRow([ uid(), name, Date.now(), 'open', '' ]);
}
function addItem(tabId, itemId, qty) {
  qty = (qty > 0) ? qty : 1;
  var m = menuItem(itemId); if (!m) throw 'menu item not found';
  var sh = sheet(SHEET_LINES), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(tabId) && String(data[i][1]) === String(itemId)) {
      sh.getRange(i+1, 6).setValue(Number(data[i][5]) + qty); return;
    }
  }
  sh.appendRow([ tabId, m.id, m.name, m.category, (m.price==null?'':m.price), qty ]);
}
function setQty(tabId, itemId, qty) {
  var sh = sheet(SHEET_LINES), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(tabId) && String(data[i][1]) === String(itemId)) {
      if (qty > 0) sh.getRange(i+1, 6).setValue(qty); else sh.deleteRow(i+1);
      return;
    }
  }
  if (qty > 0) addItem(tabId, itemId, qty);
}
function closeTab(tabId) {
  var sh = sheet(SHEET_TABS), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(tabId)) {
      sh.getRange(i+1, 4).setValue('closed');
      sh.getRange(i+1, 5).setValue(Date.now());
      return;
    }
  }
}

// ---------- menu actions ----------
function menuUpsert(req) {
  var name = String(req.name || '').trim(); if (!name) throw 'name required';
  var cat = (req.category === 'Drink') ? 'Drink' : 'Food';
  var price = (req.price === '' || req.price == null) ? '' : Number(req.price);
  var id = req.id || slug(name);
  var sh = sheet(SHEET_MENU), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) { sh.getRange(i+1,1,1,5).setValues([[ id, name, cat, price, true ]]); return; }
  }
  sh.appendRow([ id, name, cat, price, true ]);
}
function menuDelete(id) {
  var sh = sheet(SHEET_MENU), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) { sh.getRange(i+1, 5).setValue(false); return; }
  }
}

// ---------- settings / pin ----------
function getSetting(key, dflt) {
  var r = rows(SHEET_SETTINGS);
  for (var i = 0; i < r.length; i++) if (String(r[i].key) === key) return r[i].value;
  return dflt;
}
function setSetting(key, val) {
  var sh = sheet(SHEET_SETTINGS), data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) if (String(data[i][0]) === key) { sh.getRange(i+1,2).setValue(val); return; }
  sh.appendRow([ key, val ]);
}
function setPin(pin, newPin) {
  if (String(pin) !== String(getSetting('managerPin', DEFAULT_PIN))) return { ok:false, error:'wrong pin' };
  newPin = String(newPin || '').trim();
  if (!/^\d{4}$/.test(newPin)) return { ok:false, error:'PIN must be 4 digits' };
  setSetting('managerPin', newPin);
  return { ok:true };
}

// ---------- sheet helpers ----------
function menuItem(id) {
  var list = rows(SHEET_MENU);
  for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) {
    var r = list[i];
    return { id:r.id, name:r.name, category:(r.category==='Drink'?'Drink':'Food'),
      price:(r.price===''||r.price==null)?null:Number(r.price) };
  }
  return null;
}
function ensureSheets() {
  var ss = book();
  ensure(ss, SHEET_MENU,     ['id','name','category','price','active']);
  ensure(ss, SHEET_TABS,     ['id','name','openedAt','status','closedAt']);
  ensure(ss, SHEET_LINES,    ['tabId','itemId','name','category','price','qty']);
  ensure(ss, SHEET_SETTINGS, ['key','value']);
  var menuSh = ss.getSheetByName(SHEET_MENU);
  if (menuSh.getLastRow() < 2) SEED_MENU.forEach(function(m){ menuSh.appendRow([ m[0], m[1], m[2], '', true ]); });
  if (getSetting('managerPin', null) == null) setSetting('managerPin', DEFAULT_PIN);
}
function ensure(ss, name, header) {
  var sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  var first = sh.getRange(1, 1, 1, header.length).getValues()[0];
  var mismatch = false;
  for (var i = 0; i < header.length; i++) if (first[i] !== header[i]) mismatch = true;
  if (mismatch) sh.getRange(1, 1, 1, header.length).setValues([header]);
  sh.setFrozenRows(1);
  return sh;
}
function sheet(name) { return book().getSheetByName(name); }
function rows(name) {
  var sh = sheet(name), data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var head = data[0], out = [];
  for (var i = 1; i < data.length; i++) {
    var o = {}; for (var c = 0; c < head.length; c++) o[head[c]] = data[i][c];
    out.push(o);
  }
  return out;
}
function uid()  { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || uid(); }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
