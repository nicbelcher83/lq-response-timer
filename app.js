(function () {
  'use strict';

  var TZ = 'Europe/London';
  var DAY_MS = 86400000;

  // England & Wales bank holidays (source: gov.uk). Refreshed from gov.uk at load when reachable.
  var HOLIDAYS = new Set([
    '2026-01-01', '2026-04-03', '2026-04-06', '2026-05-04', '2026-05-25', '2026-08-31', '2026-12-25', '2026-12-28',
    '2027-01-01', '2027-03-26', '2027-03-29', '2027-05-03', '2027-05-31', '2027-08-30', '2027-12-27', '2027-12-28',
    '2028-01-03', '2028-04-14', '2028-04-17', '2028-05-01', '2028-05-29', '2028-08-28', '2028-12-25', '2028-12-26'
  ]);

  var MEANWHILE = [
    [1, 'a Royal Mail first class letter is meant to arrive, and the International Space Station circles the Earth about 16 times.'],
    [2, 'you could fly London to Sydney and back.'],
    [3, 'Apollo 11 got from Florida into orbit around the Moon.'],
    [6, 'according to Genesis, the whole world was created.'],
    [7, 'the Queen Mary 2 sails Southampton to New York.'],
    [9, 'Broad Group built a three-storey building.'],
    [10, 'China built the 1,000-bed Huoshenshan Hospital.'],
    [13, "you could walk England's 190-mile Coast to Coast Path."],
    [14, 'the whole Wimbledon Championships is played.'],
    [15, 'Broad Group built a 30-storey hotel.'],
    [19, 'Broad Group built a 57-storey skyscraper (in 19 working days).']
  ];

  var MILESTONES = [
    { key: 'auto_ack', title: 'Automated acknowledgement of receipt', promise: 'ack' },
    { key: 'human_ack', title: 'Acknowledgement from a person', promise: 'ack' },
    { key: 'response', title: 'Response: L&Q confirms what it is doing to move things forward', promise: 'full' }
  ];

  var params = new URLSearchParams(location.search);
  var nowOverride = params.get('now') ? new Date(params.get('now')).getTime() : null;
  var loadedAt = Date.now();
  function now() { return nowOverride ? nowOverride + (Date.now() - loadedAt) : Date.now(); }

  // ---- UK date helpers ----
  var partsFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
  });
  function ukParts(ms) {
    var o = {};
    partsFmt.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  function ukKey(ms) { var p = ukParts(ms); return p.year + '-' + p.month + '-' + p.day; }
  function keyToUtc(key) { var a = key.split('-'); return Date.UTC(+a[0], +a[1] - 1, +a[2]); }
  function utcToKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
  function addDays(key, n) { return utcToKey(keyToUtc(key) + n * DAY_MS); }
  function isWorkingDay(key) {
    var dow = new Date(keyToUtc(key)).getUTCDay();
    return dow !== 0 && dow !== 6 && !HOLIDAYS.has(key);
  }
  function addWorkingDays(key, n) {
    var k = key;
    while (n > 0) { k = addDays(k, 1); if (isWorkingDay(k)) n--; }
    return k;
  }
  function firstWorkingDayFrom(key) {
    var k = key;
    while (!isWorkingDay(k)) k = addDays(k, 1);
    return k;
  }
  // The instant of 23:59:59.999 UK time on a given date.
  function endOfUkDay(key) {
    var a = key.split('-');
    var guess = Date.UTC(+a[0], +a[1] - 1, +a[2], 23, 59, 59, 999);
    var p = ukParts(guess);
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, 999);
    return guess - (asUtc - guess);
  }

  function isWeekend(key) { var dow = new Date(keyToUtc(key)).getUTCDay(); return dow === 0 || dow === 6; }
  // Time between two instants counting Monday to Friday only (UK days); weekends are skipped entirely.
  function weekdaySpan(a, b) {
    if (b <= a) return 0;
    var total = 0, key = ukKey(a), last = ukKey(b);
    for (;;) {
      if (!isWeekend(key)) {
        var dayStart = endOfUkDay(addDays(key, -1)) + 1, dayEnd = endOfUkDay(key) + 1;
        total += Math.max(0, Math.min(b, dayEnd) - Math.max(a, dayStart));
      }
      if (key === last) break;
      key = addDays(key, 1);
    }
    return total;
  }

  // ---- formatting ----
  var dateTimeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  var dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  function fmtDateTime(ms) { return dateTimeFmt.format(new Date(ms)); }
  function fmtDate(ms) { return dateFmt.format(new Date(ms)); }
  function split(ms) {
    ms = Math.max(0, ms);
    var mins = Math.floor(ms / 60000);
    return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
  }
  function fmtDuration(ms) {
    var s = split(ms), out = [];
    if (s.d) out.push(s.d + (s.d === 1 ? ' day' : ' days'));
    if (s.h) out.push(s.h + (s.h === 1 ? ' hour' : ' hours'));
    if (s.m || !out.length) out.push(s.m + (s.m === 1 ? ' minute' : ' minutes'));
    return out.join(' ');
  }
  function t(iso) { return iso ? new Date(iso).getTime() : null; }
  function $(id) { return document.getElementById(id); }

  // ---- render ----
  var status = null;

  function deadlines(sent) {
    var day0 = firstWorkingDayFrom(ukKey(sent));
    return {
      ack: endOfUkDay(addWorkingDays(day0, 1)),
      full: endOfUkDay(addWorkingDays(day0, status.extended ? 20 : 10))
    };
  }

  function renderCounter(sent, full) {
    var c = document.querySelector('.counter');
    if (!sent) {
      $('counter-label').textContent = 'The complaint has not been sent yet';
      $('d').textContent = $('h').textContent = $('m').textContent = '0';
      $('counter-sub').textContent = 'The timer starts when the complaint is sent.';
      return 0;
    }
    var end = full || now();
    var elapsed = end - sent;
    var s = split(elapsed);
    var w = split(weekdaySpan(sent, end));
    $('wd').textContent = w.d; $('wh').textContent = w.h; $('wm').textContent = w.m;
    $('weekday-note').textContent = (!full && isWeekend(ukKey(now()))) ? 'Paused for the weekend' : '';
    $('weekdays').hidden = false;
    $('d').textContent = s.d; $('h').textContent = s.h; $('m').textContent = s.m;
    if (full) {
      c.classList.add('done');
      $('counter-label').textContent = 'Final total: response received after';
      $('counter-sub').textContent = 'Sent ' + fmtDateTime(sent) + ' · response ' + fmtDateTime(full);
    } else {
      c.classList.remove('done');
      $('counter-label').textContent = 'Time since the complaint was sent';
      $('counter-sub').textContent = 'Sent ' + fmtDateTime(sent);
    }
    return elapsed;
  }

  function renderMeanwhile(elapsed, sent, full) {
    var box = $('meanwhile');
    if (!sent) { box.hidden = true; return; }
    box.hidden = false;
    var days = Math.floor(elapsed / DAY_MS);
    var list = $('meanwhile-list');
    list.textContent = '';
    var reached = 0;
    MEANWHILE.forEach(function (e) {
      var done = e[0] <= days;
      if (done) reached++;
      var li = document.createElement('li');
      if (done) li.className = 'done';
      var tick = document.createElement('span'); tick.className = 'tick'; tick.setAttribute('aria-hidden', 'true');
      tick.textContent = done ? '\u2713' : '';
      var day = document.createElement('span'); day.className = 'day';
      day.textContent = 'Day ' + e[0];
      var txt = document.createElement('span'); txt.className = 'txt';
      txt.textContent = e[1].charAt(0).toUpperCase() + e[1].slice(1);
      var sr = document.createElement('span'); sr.className = 'sr';
      sr.textContent = done ? ' (passed)' : ' (not yet)';
      li.appendChild(tick); li.appendChild(day); li.appendChild(txt); li.appendChild(sr);
      list.appendChild(li);
    });
    $('meanwhile-label').textContent = full
      ? 'In the time it took L&Q to respond…'
      : 'Meanwhile, in the same amount of time…';
    $('meanwhile-count').textContent = reached + ' of ' + MEANWHILE.length;
  }

  function renderMilestones(sent) {
    var list = $('milestones');
    list.textContent = '';
    var dl = sent ? deadlines(sent) : null;

    MILESTONES.forEach(function (ms, i) {
      var at = t(status.milestones[ms.key]);
      var li = document.createElement('li');

      var head = document.createElement('div'); head.className = 'ms-head';
      var title = document.createElement('span'); title.className = 'ms-title'; title.textContent = (i + 1) + '. ' + ms.title;
      var state = document.createElement('span'); state.className = 'ms-state';
      if (at) { state.textContent = 'Reached'; state.classList.add('reached'); }
      else { state.textContent = 'Waiting'; }
      head.appendChild(title); head.appendChild(state); li.appendChild(head);

      if (at && sent) {
        var det = document.createElement('p'); det.className = 'ms-detail';
        det.textContent = fmtDateTime(at) + ' · took ' + fmtDuration(at - sent);
        li.appendChild(det);
      }

      if (ms.promise) {
        var p = document.createElement('div'); p.className = 'promise';
        var label = ms.promise === 'ack'
          ? "L&Q's promise: acknowledge by the end of the next working day"
          : "L&Q's promise: respond to a complaint within " + (status.extended ? '20 working days (formally extended)' : '10 working days');
        if (dl) {
          var due = dl[ms.promise];
          label += ' (' + fmtDate(due) + ')';
          if (at && at <= due) { p.classList.add('met'); label += ' · met'; }
          else if (at && at > due) { p.classList.add('missed'); li.classList.add('missed'); label += ' · missed by ' + fmtDuration(at - due); }
          else if (now() > due) { p.classList.add('missed'); li.classList.add('missed'); label += ' · missed, overdue by ' + fmtDuration(now() - due); }
        }
        p.textContent = label;
        li.appendChild(p);
      }
      list.appendChild(li);
    });
  }

  function render() {
    if (!status) return;
    var sent = t(status.complaint_sent_at);
    var full = t(status.milestones.response);
    var elapsed = renderCounter(sent, full);
    renderMeanwhile(elapsed, sent, full);
    renderMilestones(sent);
    var ext = $('extension-note');
    if (status.extended && status.extended_at) {
      ext.hidden = false;
      ext.textContent = 'L&Q formally extended the response deadline on ' + fmtDateTime(t(status.extended_at)) + '.';
    } else { ext.hidden = true; }
    $('updated').textContent = status.updated_at ? 'Status last updated ' + fmtDateTime(t(status.updated_at)) + '.' : '';
  }

  function load() {
    fetch('status.json?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (s) { status = s; render(); })
      .catch(function () { $('counter-label').textContent = 'Could not load status. Try refreshing.'; });
  }

  fetch('https://www.gov.uk/bank-holidays.json')
    .then(function (r) { return r.json(); })
    .then(function (d) { d['england-and-wales'].events.forEach(function (e) { HOLIDAYS.add(e.date); }); render(); })
    .catch(function () {});

  load();
  setInterval(render, 15000);
  setInterval(load, 5 * 60000);
})();
