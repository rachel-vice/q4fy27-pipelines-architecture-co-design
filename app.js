/* Information priorities: card-sort study tool.
   Vanilla JS, no build step. Three screens: start, sort, final.
   Test flags: ?mock=ok or ?mock=fail simulate the save result without a backend. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- config
  var CONFIG = {
    // Paste your deployed Google Apps Script web app URL here (see README).
    ENDPOINT: '',
    TIMEOUT_MS: 8000,
    RETRIES: 1
  };

  var CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  var PRIMARY_LIMIT = 3;

  // ---------------------------------------------------------------- data
  // Keep these strings in sync with apps-script/Code.gs (FIELD_IDS).
  var FIELDS = [
    { id: 'run-status', name: 'Pipeline run status and duration', ex: 'Failed · 33s', def: 'Whether this run passed, failed, is running or is waiting, and how long it took' },
    { id: 'workflow', name: 'Workflow (name, status, duration)', ex: 'tag-release · Failed · 33s', def: 'A workflow groups the jobs in a run and sets the order they run in. Shows whether it passed, failed or is running, and how long it took' },
    { id: 'job', name: 'Job (name, status, duration)', ex: 'build · Failed · 31s', def: 'A job is a set of steps that run together. Shows whether it passed, failed or is running, and how long it took' },
    { id: 'pipeline-name', name: 'Pipeline name', ex: 'build-and-test', def: 'The name of the pipeline, which defines where your configuration is stored and where your code is checked out from' },
    { id: 'pipeline-id', name: 'Pipeline ID', ex: '7zuo5bQ3kz9e…', def: 'A unique identifier for the pipeline' },
    { id: 'project', name: 'Project', ex: 'acme-frontend-web', def: "The project that runs this code." },
    { id: 'repo-name', name: 'Repo name', ex: 'acme-frontend-web', def: "The code repository the project's code comes from" },
    { id: 'commit-sha', name: 'Commit SHA', ex: 'ec83f73', def: 'Short ID of the commit the run used' },
    { id: 'commit-message', name: 'Commit message', ex: '"Fix retry on timeout"', def: 'The message written for the commit' },
    { id: 'branch', name: 'Branch', ex: 'main', def: 'The branch the run was triggered on' },
    { id: 'tag', name: 'Tag', ex: 'v1.0.0', def: 'The git tag that started the run' },
    { id: 'trigger', name: 'Trigger', ex: 'Tag pushed', def: 'What happened to start the run, such as a tag push' },
    { id: 'pushed-by', name: 'Pushed by', ex: 'Jane Doe', def: 'The person whose action started the run' },
    { id: 'start-time', name: 'Start time', ex: 'Apr 07 22:05:56 UTC', def: 'When the run began' },
    { id: 'finish-time', name: 'Finish time', ex: 'Apr 07 22:06:30 UTC', def: 'When the run finished' },
    { id: 'approval', name: 'Approval button', ex: 'Approve', def: "A manual gate. A job that pauses the workflow until someone with permission approves it. Shows the approve and cancel buttons with the job's name" },
    { id: 'rerun', name: 'Rerun button', ex: 'Rerun icon', def: 'Run a failed workflow again without starting a new pipeline run' },
    { id: 'cancel', name: 'Cancel button', ex: 'Cancel icon', def: 'Button to cancel a workflow' },
    { id: 'fix-workflow', name: 'Fix workflow action', ex: 'Fix icon', def: 'An icon that lets you copy a prompt describing the failure to paste into an AI tool of your choice, or fix it with AI directly' },
    { id: 'test-failures', name: 'Test failure details', ex: 'checkout.test.js · 2 tests failed', def: 'A summary of which tests failed and where' }
  ];
  var BY_ID = {};
  FIELDS.forEach(function (f) { BY_ID[f.id] = f; });

  var GROUPS = [
    { key: 'primary', title: 'Key information I use to identify a CI pipeline (select up to 3 items)', limit: PRIMARY_LIMIT },
    { key: 'secondary', title: 'Other information I want available alongside my CI pipeline', limit: 0 },
    { key: 'click', title: "Information I'm fine looking up when I need it (i.e., behind a click or hover)", limit: 0 },
    { key: 'none', title: "Information I don't need when I'm checking on a CI pipeline.", limit: 0 }
  ];
  var KEYS = ['tray'].concat(GROUPS.map(function (g) { return g.key; }));
  function groupTitle(key) {
    for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].key === key) return GROUPS[i].title;
    return 'the tray';
  }

  // ---------------------------------------------------------------- state
  var trayOrder = shuffle(FIELDS.map(function (f) { return f.id; }));
  var state = {
    screen: 'start',
    lists: emptyLists(trayOrder),
    selected: null,
    dragId: null,
    msg: '',
    resets: 0,
    moves: {},
    log: [],
    startedAt: null,
    endedAt: null,
    code: '',
    saveStatus: 'idle', // idle | saving | ok | failed
    focusId: null
  };
  var msgTimer = null;

  function emptyLists(tray) {
    var l = { tray: tray.slice() };
    GROUPS.forEach(function (g) { l[g.key] = []; });
    return l;
  }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function where(id) {
    for (var i = 0; i < KEYS.length; i++) if (state.lists[KEYS[i]].indexOf(id) >= 0) return KEYS[i];
    return 'tray';
  }
  function logEvent(e) { e.ts = new Date().toISOString(); state.log.push(e); }

  // ---------------------------------------------------------------- DOM helper
  // h('div', {class:'x', onclick: fn, hidden: true}, 'text', childNode, [more])
  function h(tag, attrs) {
    var el = document.createElement(tag);
    var kids = Array.prototype.slice.call(arguments, 2);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === false || v === null || v === undefined) return;
      if (k === 'class') el.className = v;
      else if (k.indexOf('on') === 0) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    });
    (function add(list) {
      list.forEach(function (c) {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) add(c);
        else el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return el;
  }
  var INFO_SVG = '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="9" cy="9" r="7.5"></circle><path d="M9 8v5" stroke-linecap="round"></path><circle cx="9" cy="5.2" r="0.6" fill="currentColor"></circle></svg>';

  // ---------------------------------------------------------------- actions
  function place(id, to) {
    var from = where(id);
    if (from === to) { state.selected = null; state.focusId = id; render(); return; }
    if (to === 'primary' && state.lists.primary.length >= PRIMARY_LIMIT) {
      logEvent({ type: 'rejected', id: id, from: from, to: to });
      state.selected = null;
      state.focusId = id;
      showMessage('This group holds up to 3. Move one out first.');
      render();
      return;
    }
    KEYS.forEach(function (k) { state.lists[k] = state.lists[k].filter(function (x) { return x !== id; }); });
    state.lists[to].push(id);
    state.moves[id] = (state.moves[id] || 0) + 1;
    logEvent({ type: 'move', id: id, from: from, to: to });
    state.selected = null;
    state.msg = '';
    state.focusId = id;
    render();
  }

  function showMessage(text) {
    state.msg = text;
    document.getElementById('live').textContent = text;
    clearTimeout(msgTimer);
    msgTimer = setTimeout(function () {
      state.msg = '';
      document.getElementById('live').textContent = '';
      if (state.screen === 'sort') render();
    }, 4000);
  }

  function resetAll() {
    state.lists = emptyLists(trayOrder);
    state.selected = null;
    state.resets += 1;
    state.msg = '';
    logEvent({ type: 'reset' });
    render();
  }

  function newCode() {
    var c = '';
    var buf = new Uint32Array(6);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < 6; i++) c += CODE_ALPHABET.charAt(buf[i] % CODE_ALPHABET.length);
    return c;
  }

  function proceed() {
    if (state.lists.tray.length > 0) return;
    state.endedAt = Date.now();
    state.code = newCode();
    state.saveStatus = 'saving';
    state.selected = null;
    save(buildPayload()).then(function () {
      state.saveStatus = 'ok';
    }, function (err) {
      if (window.console) console.error('Save failed:', err);
      state.saveStatus = 'failed';
    });
    render();
  }

  // ---------------------------------------------------------------- data capture
  function deviceType() {
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (window.innerWidth < 768) return 'mobile';
    return coarse ? 'tablet-or-touch' : 'desktop';
  }

  function buildPayload() {
    var pieces = FIELDS.map(function (f) {
      var g = where(f.id);
      return { id: f.id, name: f.name, group: g, position: state.lists[g].indexOf(f.id) + 1, moves: state.moves[f.id] || 0 };
    });
    return {
      code: state.code,
      startedAt: new Date(state.startedAt).toISOString(),
      endedAt: new Date(state.endedAt).toISOString(),
      totalSeconds: Math.round((state.endedAt - state.startedAt) / 1000),
      deviceType: deviceType(),
      viewport: window.innerWidth + 'x' + window.innerHeight,
      trayOrder: trayOrder,
      resets: state.resets,
      pieces: pieces,
      log: state.log
    };
  }

  function postOnce(payload) {
    var params = new URLSearchParams(window.location.search);
    var mock = params.get('mock');
    if (mock === 'ok') return new Promise(function (r) { setTimeout(r, 400); });
    if (mock === 'fail') return new Promise(function (_, rej) { setTimeout(function () { rej(new Error('mock failure')); }, 400); });
    if (!CONFIG.ENDPOINT) return Promise.reject(new Error('CONFIG.ENDPOINT is empty'));
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, CONFIG.TIMEOUT_MS);
    // text/plain avoids a CORS preflight, which Apps Script web apps do not answer.
    return fetch(CONFIG.ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    }).then(function (res) {
      clearTimeout(timer);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    }).then(function (body) {
      if (!body || body.ok !== true) throw new Error('Server did not confirm the save');
    }, function (e) { clearTimeout(timer); throw e; });
  }

  function save(payload) {
    var attempt = 0;
    function go() {
      return postOnce(payload).catch(function (e) {
        if (attempt++ < CONFIG.RETRIES) return go();
        throw e;
      });
    }
    return go();
  }

  // ---------------------------------------------------------------- pieces
  function pieceEl(id) {
    var f = BY_ID[id];
    var sel = state.selected === id;
    var loc = where(id);
    var tipId = 'tip-' + id;
    var pinned = false;

    var tip = h('div', { class: 'tip', id: tipId, role: 'tooltip', hidden: true },
      h('div', { class: 'tip-name' }, f.name),
      h('div', null, f.def),
      h('div', { class: 'tip-ex' }, 'Example: ' + f.ex));
    function showTip() {
      tip.hidden = false;
      tip.classList.remove('align-right');
      var r = tip.getBoundingClientRect();
      if (r.right > window.innerWidth - 8) tip.classList.add('align-right');
    }
    function hideTip() { tip.hidden = true; }

    var main = h('button', {
      class: 'piece-btn', type: 'button', 'aria-pressed': sel ? 'true' : 'false',
      'aria-label': f.name + '. Currently ' + (loc === 'tray' ? 'not sorted yet' : 'sorted into ' + groupTitle(loc)) + '. ' + (sel ? 'Selected.' : 'Select to choose a group.'),
      onclick: function () { state.selected = sel ? null : id; state.focusId = id; render(); },
      onkeydown: function (e) { if (e.key === 'Escape') { state.selected = null; state.focusId = id; render(); } }
    }, h('span', { class: 'piece-name' }, f.name));

    var info = h('button', {
      class: 'info-btn', type: 'button', 'aria-label': 'About ' + f.name + ': ' + f.def + ' Example: ' + f.ex, 'aria-describedby': tipId,
      onmouseenter: showTip,
      onmouseleave: function () { if (!pinned) hideTip(); },
      onfocus: showTip,
      onblur: function () { pinned = false; hideTip(); },
      onclick: function () { pinned = !pinned; if (pinned) showTip(); else hideTip(); },
      onkeydown: function (e) { if (e.key === 'Escape') { pinned = false; hideTip(); } }
    });
    info.innerHTML = INFO_SVG;

    var el = h('div', { class: 'piece' + (sel ? ' selected' : ''), 'data-piece': id, draggable: 'true' }, main, info, tip);
    el.addEventListener('dragstart', function (e) {
      try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch (err) { /* ignore */ }
      state.dragId = id;
      state.selected = null;
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', function () { clearDrag(); });
    return el;
  }

  function clearDrag() {
    state.dragId = null;
    Array.prototype.forEach.call(document.querySelectorAll('.dragging, .over'), function (n) {
      n.classList.remove('dragging'); n.classList.remove('over');
    });
  }

  function makeDropZone(el, key) {
    el.addEventListener('dragover', function (e) {
      e.preventDefault();
      if (!el.classList.contains('over')) {
        Array.prototype.forEach.call(document.querySelectorAll('.panel.over'), function (n) { n.classList.remove('over'); });
        el.classList.add('over');
      }
    });
    el.addEventListener('drop', function (e) {
      e.preventDefault();
      var id = state.dragId;
      clearDrag();
      if (id) place(id, key);
    });
  }

  // ---------------------------------------------------------------- screens
  function startScreen() {
    return h('main', { class: 'start' },
      h('h1', null, 'Sort the information you use to check on a CI pipeline'),
      h('p', null, "When you check on a CI pipeline run, you look at certain information to understand what happened and decide what to do next. In this exercise, you'll sort pieces of that information by how useful they are to you."),
      h('p', null, 'Think about situations like these:'),
      h('ul', null,
        h('li', null, h('strong', null, 'Troubleshooting: '), 'A build failed, and you need to find out what went wrong.'),
        h('li', null, h('strong', null, 'Approving: '), 'A pipeline is waiting for someone to approve it before it continues.'),
        h('li', null, h('strong', null, 'Checking what released: '), 'You want to confirm what shipped and when.')),
      h('h2', null, 'How it works'),
      h('ol', null,
        h('li', null, 'There is a bank of available pieces of information. Hover over or tap the ⓘ to read what it means and see an example. The terms may differ from your own tool’s, and if they do, tell us out loud.'),
        h('li', null, 'Place each piece into the group that fits how you use it.'),
        h('li', null, 'Your first group holds the information you need to identify a CI pipeline run. You can put up to 3 pieces of information here but do not need to fill all 3 spots.'),
        h('li', null, 'Every piece of information needs to go somewhere.'),
        h('li', null, 'If you need different pieces in different situations, put each one where you’d reach for it most often, and tell us about the exception.'),
        h('li', null, h('strong', null, "Please talk aloud about what you're choosing and why as you go."))),
      h('div', null, h('button', { class: 'btn-primary', type: 'button', onclick: function () {
        state.screen = 'sort'; state.startedAt = Date.now(); logEvent({ type: 'start' }); render();
      } }, 'Start')));
  }

  function sortScreen() {
    var left = state.lists.tray.length;
    var selLoc = state.selected ? where(state.selected) : null;
    var complete = state.saveStatus !== 'idle';

    var tray = h('section', { class: 'panel tray', 'aria-label': 'Pieces to sort, ' + left + ' left' },
      h('div', { class: 'panel-head' },
        h('h2', null, 'Pieces to sort'),
        h('div', { class: 'panel-tools' },
          h('span', { class: 'tray-count' }, left + ' left'),
          state.selected && selLoc !== 'tray' ? h('button', { class: 'btn-add', type: 'button', onclick: function () { place(state.selected, 'tray'); } }, 'Put back') : null)),
      left === 0 ? h('p', { class: 'tray-done' }, complete ? 'All pieces are sorted.' : "Every piece is sorted. Press Continue when you're ready.") : null,
      h('div', { class: 'pieces' }, state.lists.tray.map(pieceEl)));
    makeDropZone(tray, 'tray');

    var groups = GROUPS.map(function (g) {
      var n = state.lists[g.key].length;
      var full = g.limit > 0 && n >= g.limit;
      var countText = g.limit ? n + ' of ' + g.limit + (full ? ' · Full' : '') : String(n);
      var sec = h('section', {
        class: 'panel' + (g.key === 'primary' ? ' primary' : '') + (full ? ' full' : ''),
        'aria-label': g.title + (g.limit ? ', ' + n + ' of ' + g.limit : ', ' + n + ' placed') + (full ? ', full' : '')
      },
        h('div', { class: 'panel-head' },
          h('div', { class: 'titles' }, h('h2', null, g.title), g.key === 'click' ? h('p', { class: 'label' }) : null),
          h('div', { class: 'panel-tools' },
            h('span', { class: 'count' + (full ? ' full' : '') }, countText),
            state.selected && selLoc !== g.key ? h('button', { class: 'btn-add', type: 'button', onclick: function () { place(state.selected, g.key); } }, 'Add to this group') : null)),
        g.key === 'primary' && state.msg ? h('p', { class: 'limit-msg' }, state.msg) : null,
        h('p', { class: 'over-hint' }, 'Release to add to this group'),
        h('div', { class: 'pieces' },
          n === 0 ? h('p', { class: 'empty' }, 'Nothing here yet') : null,
          state.lists[g.key].map(pieceEl)));
      makeDropZone(sec, g.key);
      return sec;
    });

    return h('main', { class: 'sort' },
      h('header', { class: 'sort-header' },
        h('div', { class: 'intro' },
          h('h1', null, 'Sort the information you use to check on a CI pipeline'),
          h('p', null, "Drag it to a group, or select it and choose Add to this group. Talk aloud as you go about what you're doing and why.")),
        h('div', { class: 'header-actions' },
          h('button', { class: 'btn-secondary', type: 'button', onclick: resetAll }, 'Reset'),
          h('button', { class: 'btn-continue', type: 'button', disabled: left > 0 || complete, onclick: proceed }, complete ? 'Complete' : left > 0 ? left + ' left' : 'Continue'))),
      h('div', { class: 'layout' }, tray, h('div', { class: 'groups' }, groups)),
      state.selected ? h('div', { class: 'select-bar', role: 'status' },
        h('span', null, 'Selected: ', h('strong', null, BY_ID[state.selected].name), '. Choose a group to add it to. Escape cancels.'),
        h('button', { type: 'button', onclick: function () { state.selected = null; render(); } }, 'Cancel')) : null);
  }

  // ---------------------------------------------------------------- render
  function render() {
    var root = document.getElementById('app');
    var scrollY = window.scrollY;
    root.textContent = '';
    root.appendChild(state.screen === 'start' ? startScreen() : sortScreen());
    if (state.focusId) {
      var btn = root.querySelector('[data-piece="' + state.focusId + '"] .piece-btn');
      if (btn) btn.focus({ preventScroll: true });
      state.focusId = null;
      window.scrollTo(0, scrollY);
    }
  }

  render();
})();
