(function () {
  'use strict';

  const KEY = 'jmb-state-v1';
  const PALETTE = ['#2E3FB8', '#2F7D32', '#D9731A', '#7040C4', '#B3261E', '#00838F', '#6D4C41', '#455A64'];
  const DEFAULT_EMOJIS = ['\u{1F623}', '\u{1F615}', '\u{1F610}', '\u{1F642}', '\u{1F604}'];
  const EMOJI_CHOICES = ['\u{1F621}', '\u{1F620}', '\u{1F62D}', '\u{1F622}', '\u{1F623}', '\u{1F629}', '\u{1F61E}', '\u{1F615}', '\u{1F641}', '\u{1F610}', '\u{1F611}', '\u{1F636}', '\u{1F642}', '\u{1F60A}', '\u{1F600}', '\u{1F604}', '\u{1F601}', '\u{1F60D}', '\u{1F929}', '\u{1F973}'];
  const SCALE_LABELS = ['Very negative', 'Negative', 'Neutral', 'Positive', 'Very positive'];
  const STEPS = ['Details', 'Personas', 'Stages', 'Content', 'Feelings'];
  const TITLES = [
    ['Map details', 'Title, header tags, and footer text that frame the map.'],
    ['Personas', 'Each persona\'s color carries through the legend, the action tags, and their feelings line.'],
    ['Stages', 'Each stage becomes a column on the map.'],
    ['Stage content', 'Fill in each stage column, one stage at a time.'],
    ['Feelings', 'Pick your five emojis, then rate each persona at each stage.']
  ];
  const ALIASES = {
    actions: ['actions', 'action', 'steps', 'doing'],
    bright: ['bright spots', 'bright spot', 'likes', 'positives', 'what works'],
    pain: ['pain points', 'pain point', 'pains', 'frustrations'],
    opps: ['opportunities', 'opportunity', 'ideas']
  };
  const SECTION_DOT = { actions: '#6C7FD8', bright: '#3E9B4F', pain: '#D64545', opps: '#D9A21A', note: '#8A94A3' };

  const I = {
    x: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
    up: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l5-5 5 5"/></svg>',
    down: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l5 5 5-5"/></svg>',
    left: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg>',
    right: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3l5 5-5 5"/></svg>'
  };

  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  function defaultRows() {
    return [
      { key: 'actions', label: 'Actions', kind: 'actions', on: true },
      { key: 'feelings', label: 'Feelings', kind: 'feelings', on: true },
      { key: 'bright', label: 'Bright spots', kind: 'bright', on: true },
      { key: 'pain', label: 'Pain points', kind: 'pain', on: true },
      { key: 'opps', label: 'Opportunities', kind: 'opps', on: true }
    ];
  }
  function blank() {
    return { title: '', subtitle: '', tags: [], footer: '', project: '', date: '',
      rows: defaultRows(), personas: [], stages: [], emojis: DEFAULT_EMOJIS.slice(), ratings: {} };
  }
  function normalize(d) {
    const s = Object.assign(blank(), d || {});
    if (!Array.isArray(s.rows) || !s.rows.length) s.rows = defaultRows();
    s.tags = Array.isArray(s.tags) ? s.tags : [];
    s.personas = Array.isArray(s.personas) ? s.personas : [];
    s.stages = Array.isArray(s.stages) ? s.stages : [];
    s.stages.forEach((st) => { st.cells = st.cells || {}; });
    if (!Array.isArray(s.emojis) || s.emojis.length !== 5) s.emojis = DEFAULT_EMOJIS.slice();
    s.ratings = s.ratings || {};
    return s;
  }
  function load() {
    try { const t = localStorage.getItem(KEY); if (t) return normalize(JSON.parse(t)); } catch (e) { /* ignore */ }
    return blank();
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } }

  function fromSample(src) {
    const s = blank();
    ['title', 'subtitle', 'footer', 'project', 'date'].forEach((k) => { s[k] = src[k] || ''; });
    s.tags = src.tags.slice();
    s.personas = src.personas.map((p) => Object.assign({}, p));
    s.stages = src.stages.map((st) => ({
      id: st.id, name: st.name, subtitle: st.subtitle,
      cells: {
        actions: st.actions.map(([text, p]) => ({ id: uid(), text, personas: p.slice() })),
        bright: st.bright.map((text) => ({ id: uid(), text, personas: [] })),
        pain: st.pain.map((text) => ({ id: uid(), text, personas: [] })),
        opps: st.opps.map((text) => ({ id: uid(), text, personas: [] }))
      }
    }));
    Object.keys(src.ratings).forEach((pid) => {
      s.ratings[pid] = {};
      src.ratings[pid].forEach((v, i) => { if (v) s.ratings[pid][s.stages[i].id] = v; });
    });
    return s;
  }

  function setPath(path, val) {
    const ks = path.split('.');
    let o = S;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = val;
  }

  // Excel and Google Sheets copy as tab separated text, with quotes around cells that hold line breaks.
  function parseTSV(t) {
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      if (q) {
        if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"' && cell === '') q = true;
      else if (ch === '\t') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && t[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function applyPaste(textIn) {
    const rows = parseTSV(textIn).filter((r) => r.some((c) => c.trim()));
    if (rows.length < 2 || rows[0].length < 2) {
      return 'Paste a header row of stage names and at least one row of content below it.';
    }
    const cols = rows[0].slice(1).map((c) => c.trim());
    const stages = cols.map((name) => {
      if (!name) return null;
      const ex = S.stages.find((s) => s.name.trim().toLowerCase() === name.toLowerCase());
      if (ex) { ex.cells = {}; return ex; }
      return { id: uid(), name, subtitle: '', cells: {} };
    });
    rows.slice(1).forEach((r) => {
      const label = (r[0] || '').trim();
      if (!label) return;
      const low = label.toLowerCase();
      if (low === 'subtitle' || low === 'subtitles') {
        cols.forEach((_, ci) => { if (stages[ci]) stages[ci].subtitle = (r[ci + 1] || '').trim(); });
        return;
      }
      let def = S.rows.find((x) => x.label.trim().toLowerCase() === low)
        || S.rows.find((x) => (ALIASES[x.kind] || []).includes(low));
      if (def && def.kind === 'feelings') return;
      if (!def) { def = { key: 'r' + uid(), label, kind: 'note', on: true }; S.rows.push(def); }
      cols.forEach((_, ci) => {
        const st = stages[ci]; if (!st) return;
        const items = (r[ci + 1] || '').split(/\r?\n/)
          .map((s) => s.replace(/^\s*([-*\u2022]|\d+[.)])\s+/, '').trim()).filter(Boolean);
        st.cells[def.key] = (st.cells[def.key] || []).concat(items.map((t) => ({ id: uid(), text: t, personas: [] })));
      });
    });
    S.stages = stages.filter(Boolean);
    ui.stage = 0;
    return '';
  }

  let S = load();
  const ui = { step: 1, stage: 0, persona: null, collapsed: {}, paste: false, pasteErr: '',
    status: '', busy: false, emojiSlot: null, focus: null, confirm: null };
  const root = document.getElementById('app');

  // ---------- views ----------

  function header() {
    const steps = STEPS.map((s, i) => {
      const n = i + 1;
      const cls = 'stp' + (n === ui.step ? ' on' : '') + (n < ui.step ? ' done' : '');
      return `<button type="button" class="${cls}" data-act="goto" data-v="${n}" aria-current="${n === ui.step ? 'step' : 'false'}"><span class="bar"></span><span class="sl">${s}</span></button>`;
    }).join('');
    const t = TITLES[ui.step - 1];
    return `<header class="hd"><div class="hd-top"><span class="app">Journey Map Builder</span><span class="muted">Step ${ui.step} of 5</span></div>
      <nav class="steps" aria-label="Steps">${steps}</nav><h1>${t[0]}</h1><p class="muted">${t[1]}</p></header>`;
  }

  function footer() {
    const back = ui.step > 1 ? '<button class="bs" type="button" data-act="back">Back</button>' : '';
    const next = ui.step < 5
      ? `<button class="bp" type="button" data-act="next">Next: ${STEPS[ui.step]}</button>`
      : `<button class="bp" type="button" data-act="generate" ${ui.busy ? 'disabled' : ''}>${ui.busy ? 'Building map...' : 'Generate map on board'}</button>`;
    const status = ui.status ? `<div class="status" role="status">${esc(ui.status)}</div>` : '';
    return `${status}<footer class="ft">${back}${next}</footer>`;
  }

  function confirmBtn(act, label, confirmLabel) {
    const armed = ui.confirm === act;
    return `<button class="bs sm${armed ? ' warn' : ''}" type="button" data-act="${act}">${armed ? confirmLabel : label}</button>`;
  }

  function vDetails() {
    const tags = S.tags.map((t, i) => `<span class="pill">${esc(t)}<button class="ib sm" type="button" data-act="tag-del" data-i="${i}" aria-label="Remove tag">${I.x}</button></span>`).join('');
    const rows = S.rows.map((r, i) => `<div class="rowitem">
        <input type="checkbox" data-bind="rows.${i}.on" ${r.on ? 'checked' : ''} aria-label="Show the ${esc(r.label)} row">
        <input class="in" data-bind="rows.${i}.label" value="${esc(r.label)}" aria-label="Row name">
        <button class="ib" type="button" data-act="row-up" data-i="${i}" aria-label="Move row up" ${i === 0 ? 'disabled' : ''}>${I.up}</button>
        <button class="ib" type="button" data-act="row-down" data-i="${i}" aria-label="Move row down" ${i === S.rows.length - 1 ? 'disabled' : ''}>${I.down}</button>
        ${r.kind === 'note' ? `<button class="ib" type="button" data-act="row-del" data-i="${i}" aria-label="Remove row">${I.x}</button>` : '<span class="ib-space"></span>'}
      </div>`).join('');
    return `
      <div class="fld"><label class="lbl" for="f-title">Map title</label><input class="in" id="f-title" data-bind="title" value="${esc(S.title)}" placeholder="e.g. Hardware Management User Journey"></div>
      <div class="fld"><label class="lbl" for="f-sub">Subtitle</label><input class="in" id="f-sub" data-bind="subtitle" value="${esc(S.subtitle)}" placeholder="e.g. Stakeholder summary"></div>
      <div class="fld"><span class="lbl">Header tags</span>${tags ? `<div class="pills">${tags}</div>` : ''}
        <div class="inline"><input class="in" id="tag-new" placeholder="e.g. 25 Interviews | 26 Participants" aria-label="New tag"><button class="bs sm" type="button" data-act="tag-add">Add</button></div></div>
      <div class="fld"><label class="lbl" for="f-foot">Footer text</label><input class="in" id="f-foot" data-bind="footer" value="${esc(S.footer)}" placeholder="e.g. DTMB Office of Continuous Improvement"></div>
      <div class="inline top">
        <div class="fld grow"><label class="lbl" for="f-proj">Project</label><input class="in" id="f-proj" data-bind="project" value="${esc(S.project)}"></div>
        <div class="fld w110"><label class="lbl" for="f-date">Date</label><input class="in" id="f-date" data-bind="date" value="${esc(S.date)}"></div>
      </div>
      <div class="fld"><span class="lbl">Rows on the map</span><div class="stack">${rows}</div>
        <button class="add" type="button" data-act="row-add">Add custom row</button></div>
      <div class="fld"><span class="lbl">Your data</span>
        <div class="toolgrid">
          ${confirmBtn('sample', 'Load ITAM sample', 'Replace my work?')}
          <button class="bs sm" type="button" data-act="paste-open">Paste from spreadsheet</button>
          <button class="bs sm" type="button" data-act="export">Save to file</button>
          <label class="bs sm filebtn">Open file<input type="file" accept=".json,application/json" data-act-change="import" hidden></label>
          ${confirmBtn('reset', 'Start over', 'Clear everything?')}
        </div>
        <p class="hint">Your work saves automatically in this browser.</p></div>`;
  }

  function vPersonas() {
    const list = S.personas.map((p, i) => {
      const sw = PALETTE.map((c) => `<button type="button" class="sw${c === p.color ? ' on' : ''}" style="background:${c}" data-act="persona-color" data-i="${i}" data-v="${c}" aria-label="Use color ${c}"></button>`).join('');
      return `<div class="card">
        <div class="inline"><span class="dot" style="background:${esc(p.color)}"></span>
          <input class="in strong" data-bind="personas.${i}.name" value="${esc(p.name)}" placeholder="Name" aria-label="Persona name">
          <button class="ib" type="button" data-act="persona-del" data-i="${i}" aria-label="Remove persona">${I.x}</button></div>
        <input class="in" data-bind="personas.${i}.role" value="${esc(p.role)}" placeholder="Role" aria-label="Persona role">
        <div class="swatches">${sw}<input type="color" class="cpick" value="${esc(p.color)}" data-act-change="persona-color" data-i="${i}" aria-label="Pick a custom color"></div>
      </div>`;
    }).join('');
    const empty = S.personas.length ? '' : '<div class="empty">Add the people whose experience this map follows.</div>';
    return `${empty}${list}<button class="add" type="button" data-act="persona-add">Add persona</button>`;
  }

  function vStages() {
    const list = S.stages.map((s, i) => `<div class="stageitem">
        <span class="num">${i + 1}</span>
        <div class="grow stack">
          <input class="in strong" data-bind="stages.${i}.name" value="${esc(s.name)}" placeholder="Stage name" aria-label="Stage ${i + 1} name">
          <input class="in sub" data-bind="stages.${i}.subtitle" value="${esc(s.subtitle)}" placeholder="Subtitle" aria-label="Stage ${i + 1} subtitle">
        </div>
        <div class="stack tight">
          <button class="ib" type="button" data-act="stage-up" data-i="${i}" aria-label="Move stage up" ${i === 0 ? 'disabled' : ''}>${I.up}</button>
          <button class="ib" type="button" data-act="stage-down" data-i="${i}" aria-label="Move stage down" ${i === S.stages.length - 1 ? 'disabled' : ''}>${I.down}</button>
        </div>
        <button class="ib" type="button" data-act="stage-del" data-i="${i}" aria-label="Remove stage">${I.x}</button>
      </div>`).join('');
    const empty = S.stages.length ? '' : '<div class="empty">Add the stages of the journey in order, from first to last.</div>';
    return `${empty}${list}<button class="add" type="button" data-act="stage-add">Add stage</button>`;
  }

  function vSection(st, si, row) {
    const items = st.cells[row.key] || [];
    const open = !ui.collapsed[row.key];
    const dot = SECTION_DOT[row.kind] || SECTION_DOT.note;
    let body = '';
    if (open) {
      body = items.map((it, j) => {
        const chips = S.personas.length
          ? `<div class="chips">${S.personas.map((p) => {
              const on = (it.personas || []).includes(p.id);
              const style = on ? `background:${p.color};border-color:${p.color}` : '';
              return `<button type="button" class="chip${on ? ' on' : ''}" style="${style}" data-act="card-tag" data-key="${row.key}" data-j="${j}" data-pid="${p.id}" aria-pressed="${on}">${esc(p.name || 'Unnamed')}</button>`;
            }).join('')}</div>` : '';
        return `<div class="item k-${row.kind}"><div class="inline top">
            <textarea class="ta" rows="2" data-bind="stages.${si}.cells.${row.key}.${j}.text" aria-label="${esc(row.label)} card">${esc(it.text)}</textarea>
            <button class="ib" type="button" data-act="card-del" data-key="${row.key}" data-j="${j}" aria-label="Remove card">${I.x}</button></div>${chips}</div>`;
      }).join('') + `<button class="add" type="button" data-act="card-add" data-key="${row.key}">Add to ${esc(row.label.toLowerCase())}</button>`;
    }
    return `<section class="sec">
      <button type="button" class="sechd" data-act="sec" data-key="${row.key}" aria-expanded="${open}">
        <span class="dot sm" style="background:${dot}"></span><span class="nm">${esc(row.label)}</span>
        <span class="muted">${items.length} ${items.length === 1 ? 'card' : 'cards'}</span><span class="chev">${I.down}</span></button>
      ${open ? `<div class="stack">${body}</div>` : ''}</section>`;
  }

  function vContent() {
    if (!S.stages.length) {
      return '<div class="empty">Add stages first, then fill in each one here.<br><button class="bs sm mt" type="button" data-act="goto" data-v="3">Go to stages</button></div>';
    }
    ui.stage = Math.max(0, Math.min(ui.stage, S.stages.length - 1));
    const si = ui.stage, st = S.stages[si];
    const sections = S.rows.filter((r) => r.on && r.kind !== 'feelings').map((r) => vSection(st, si, r)).join('');
    return `<div class="snav">
        <button class="ib" type="button" data-act="stage-prev" aria-label="Previous stage" ${si === 0 ? 'disabled' : ''}>${I.left}</button>
        <div class="t"><b>${esc(st.name || 'Untitled stage')}</b><span>Stage ${si + 1} of ${S.stages.length}${st.subtitle ? ', ' + esc(st.subtitle) : ''}</span></div>
        <button class="ib" type="button" data-act="stage-next" aria-label="Next stage" ${si === S.stages.length - 1 ? 'disabled' : ''}>${I.right}</button>
      </div>
      <p class="hint">Have it in a spreadsheet already? <button class="linkbtn" type="button" data-act="paste-open">Paste a table instead</button></p>
      ${sections}`;
  }

  function vFeelings() {
    const slots = S.emojis.map((e, k) => `<button type="button" class="emo-slot${ui.emojiSlot === k ? ' on' : ''}" data-act="emoji-slot" data-v="${k}" aria-label="Change emoji for ${k + 1}, ${SCALE_LABELS[k]}" aria-expanded="${ui.emojiSlot === k}"><span class="em">${esc(e)}</span><b>${k + 1}</b><span>${SCALE_LABELS[k]}</span></button>`).join('');
    let picker = '';
    if (ui.emojiSlot != null) {
      const k = ui.emojiSlot;
      const opts = EMOJI_CHOICES.map((e) => `<button type="button" class="eb${S.emojis[k] === e ? ' on' : ''}" data-act="emoji-pick" data-v="${e}" aria-label="Use ${e}">${e}</button>`).join('');
      picker = `<div class="picker"><div class="lblrow"><span class="lbl">Emoji for ${k + 1}, ${SCALE_LABELS[k]}</span><button class="linkbtn" type="button" data-act="emoji-default">Reset to default</button></div>
        <div class="emo-choices">${opts}</div>
        <div class="inline"><input class="in" id="emoji-custom" placeholder="Or type or paste any emoji" aria-label="Custom emoji"><button class="bs sm" type="button" data-act="emoji-custom">Use</button><button class="bs sm" type="button" data-act="emoji-done">Done</button></div></div>`;
    }
    let rest = '';
    if (!S.personas.length || !S.stages.length) {
      rest = '<div class="empty">Add personas and stages first, then rate them here.</div>';
    } else {
      if (!S.personas.find((p) => p.id === ui.persona)) ui.persona = S.personas[0].id;
      const p = S.personas.find((x) => x.id === ui.persona);
      const r = S.ratings[p.id] || {};
      const chips = S.personas.map((x) => {
        const on = x.id === p.id;
        const style = on ? `background:${x.color};border-color:${x.color};color:#fff` : `box-shadow:inset 3px 0 0 ${x.color}`;
        return `<button type="button" class="pchip${on ? ' on' : ''}" style="${style}" data-act="rate-persona" data-pid="${x.id}" aria-pressed="${on}">${esc(x.name || 'Unnamed')}</button>`;
      }).join('');
      const tintBg = p.color + '1f';
      const rows = S.stages.map((s) => {
        const v = r[s.id];
        const absent = !v;
        const btns = S.emojis.map((e, k) => {
          const on = v === k + 1;
          const style = on ? `border-color:${p.color};background:${tintBg}` : '';
          return `<button type="button" class="eb${on ? ' on' : ''}" style="${style}" data-act="rate" data-sid="${s.id}" data-v="${k + 1}" aria-label="${esc(s.name)}: ${SCALE_LABELS[k]}" aria-pressed="${on}">${esc(e)}</button>`;
        }).join('');
        return `<div class="rate${absent ? ' absent' : ''}"><div class="rate-top"><b>${esc(s.name || 'Untitled stage')}</b>
          <label class="chk"><input type="checkbox" data-act-change="absent" data-sid="${s.id}" ${absent ? 'checked' : ''}>Not in this stage</label></div>
          <div class="emo-grid">${btns}</div></div>`;
      }).join('');
      rest = `<div class="fld"><span class="lbl">Rate a persona</span><div class="pchips">${chips}</div></div>
        <div class="stack">${rows}</div>${vPreview(p, r)}`;
    }
    return `<div class="fld"><div class="lblrow"><span class="lbl">Emoji scale</span><span class="hint nm">Tap one to change it</span></div>
      <div class="emo-grid">${slots}</div>${picker}</div>${rest}`;
  }

  function vPreview(p, r) {
    const n = S.stages.length;
    const x = (i) => 20 + (n > 1 ? i * (260 / (n - 1)) : 130);
    const y = (v) => 100 - (v - 1) * 22;
    const pts = S.stages.map((s, i) => (r[s.id] ? [x(i), y(r[s.id])] : null)).filter(Boolean);
    let curve = '', dots = '';
    pts.forEach((pt, j) => {
      dots += `M${pt[0]} ${pt[1]} l0 0 `;
      if (j === 0) curve = `M${pt[0]} ${pt[1]}`;
      else { const q = pts[j - 1], m = (q[0] + pt[0]) / 2; curve += ` C${m} ${q[1]} ${m} ${pt[1]} ${pt[0]} ${pt[1]}`; }
    });
    const labels = S.stages.map((s) => `<span>${esc(s.name)}</span>`).join('');
    return `<div class="preview"><div class="lbl">Preview of ${esc(p.name || 'this persona')}'s line</div>
      <svg viewBox="0 0 300 112" role="img" aria-label="Feelings line preview">
        <line x1="8" y1="56" x2="292" y2="56" stroke="#9AA5B4" stroke-dasharray="4 4"/>
        <path d="${curve}" fill="none" stroke="${esc(p.color)}" stroke-width="2.5"/>
        <path d="${dots}" fill="none" stroke="${esc(p.color)}" stroke-width="10" stroke-linecap="round"/>
      </svg>
      <div class="pv-labels" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${labels}</div></div>`;
  }

  function vPaste() {
    return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="paste-h"><div class="sheet">
      <h2 id="paste-h">Paste from spreadsheet</h2>
      <p class="muted">Put stage names across the top row and row names down the first column (Actions, Bright spots, Pain points, Opportunities). A row called Subtitle sets stage subtitles. Put each card on its own line inside a cell. Pasting replaces the cards in those stages.</p>
      <textarea class="ta paste" id="paste-box" aria-label="Pasted table" placeholder="Copy the table in Excel, then paste here"></textarea>
      ${ui.pasteErr ? `<p class="err">${esc(ui.pasteErr)}</p>` : ''}
      <div class="inline"><button class="bs grow" type="button" data-act="paste-close">Cancel</button><button class="bp grow" type="button" data-act="paste-apply">Add to map</button></div>
    </div></div>`;
  }

  function render() {
    const prev = root.querySelector('.body');
    const keepScroll = prev && prev.dataset.step === String(ui.step) ? prev.scrollTop : 0;
    const views = [vDetails, vPersonas, vStages, vContent, vFeelings];
    root.innerHTML = header() + `<main class="body" data-step="${ui.step}">${views[ui.step - 1]()}</main>` + footer() + (ui.paste ? vPaste() : '');
    const body = root.querySelector('.body');
    if (body) body.scrollTop = keepScroll;
    if (ui.focus) { const el = root.querySelector(ui.focus); if (el) el.focus(); ui.focus = null; }
  }

  // ---------- actions ----------

  async function generate() {
    if (!window.miro || !miro.board) {
      ui.status = 'Open this panel inside Miro to generate the map.'; render(); return;
    }
    if (!S.stages.length) { ui.status = 'Add at least one stage before generating.'; render(); return; }
    ui.busy = true; ui.status = 'Starting...'; render();
    try {
      await window.JMB_generate(S, (msg) => {
        ui.status = msg;
        const el = root.querySelector('.status'); if (el) el.textContent = msg;
      });
      ui.status = 'Map added to the board.';
    } catch (err) {
      console.error(err);
      ui.status = 'The map stopped partway: ' + ((err && err.message) || err) + '. Delete the partial frame and try again.';
    }
    ui.busy = false; render();
  }

  function download() {
    const blob = new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (S.title || 'journey-map').replace(/[^\w-]+/g, '-').toLowerCase().slice(0, 60) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  function swap(arr, i, j) { if (j < 0 || j >= arr.length) return; const t = arr[i]; arr[i] = arr[j]; arr[j] = t; }

  function act(a, d, el) {
    const i = d.i != null ? +d.i : null;
    if (a !== ui.confirm) ui.confirm = null;
    const st = S.stages[ui.stage];
    switch (a) {
      case 'goto': ui.step = +d.v; break;
      case 'next': ui.step = Math.min(5, ui.step + 1); break;
      case 'back': ui.step = Math.max(1, ui.step - 1); break;

      case 'tag-add': {
        const inp = root.querySelector('#tag-new'); const v = inp && inp.value.trim();
        if (v) S.tags.push(v);
        ui.focus = '#tag-new'; break;
      }
      case 'tag-del': S.tags.splice(i, 1); break;

      case 'row-up': swap(S.rows, i, i - 1); break;
      case 'row-down': swap(S.rows, i, i + 1); break;
      case 'row-add': S.rows.push({ key: 'r' + uid(), label: 'New row', kind: 'note', on: true });
        ui.focus = `[data-bind="rows.${S.rows.length - 1}.label"]`; break;
      case 'row-del': S.rows.splice(i, 1); break;

      case 'persona-add': {
        const used = S.personas.map((p) => p.color);
        const color = PALETTE.find((c) => !used.includes(c)) || PALETTE[S.personas.length % PALETTE.length];
        S.personas.push({ id: uid(), name: '', role: '', color });
        ui.focus = `[data-bind="personas.${S.personas.length - 1}.name"]`; break;
      }
      case 'persona-del': delete S.ratings[S.personas[i].id]; S.personas.splice(i, 1); break;
      case 'persona-color': S.personas[i].color = d.v || el.value; break;

      case 'stage-add': S.stages.push({ id: uid(), name: '', subtitle: '', cells: {} });
        ui.focus = `[data-bind="stages.${S.stages.length - 1}.name"]`; break;
      case 'stage-del': S.stages.splice(i, 1); break;
      case 'stage-up': swap(S.stages, i, i - 1); break;
      case 'stage-down': swap(S.stages, i, i + 1); break;
      case 'stage-prev': ui.stage = Math.max(0, ui.stage - 1); break;
      case 'stage-next': ui.stage = Math.min(S.stages.length - 1, ui.stage + 1); break;

      case 'sec': ui.collapsed[d.key] = !ui.collapsed[d.key]; break;
      case 'card-add': {
        const list = st.cells[d.key] = st.cells[d.key] || [];
        list.push({ id: uid(), text: '', personas: [] });
        ui.collapsed[d.key] = false;
        ui.focus = `[data-bind="stages.${ui.stage}.cells.${d.key}.${list.length - 1}.text"]`; break;
      }
      case 'card-del': st.cells[d.key].splice(+d.j, 1); break;
      case 'card-tag': {
        const it = st.cells[d.key][+d.j]; it.personas = it.personas || [];
        const k = it.personas.indexOf(d.pid);
        if (k >= 0) it.personas.splice(k, 1); else it.personas.push(d.pid);
        break;
      }

      case 'emoji-slot': ui.emojiSlot = ui.emojiSlot === +d.v ? null : +d.v; break;
      case 'emoji-pick': S.emojis[ui.emojiSlot] = d.v; break;
      case 'emoji-default': S.emojis[ui.emojiSlot] = DEFAULT_EMOJIS[ui.emojiSlot]; break;
      case 'emoji-custom': {
        const inp = root.querySelector('#emoji-custom'); const v = inp && inp.value.trim();
        if (v) S.emojis[ui.emojiSlot] = Array.from(v).slice(0, 2).join('');
        break;
      }
      case 'emoji-done': ui.emojiSlot = null; break;
      case 'rate-persona': ui.persona = d.pid; break;
      case 'rate': (S.ratings[ui.persona] = S.ratings[ui.persona] || {})[d.sid] = +d.v; break;
      case 'absent': {
        const r = S.ratings[ui.persona] = S.ratings[ui.persona] || {};
        if (el.checked) delete r[d.sid]; else r[d.sid] = 3;
        break;
      }

      case 'sample':
        if (ui.confirm !== 'sample' && (S.stages.length || S.personas.length)) { ui.confirm = 'sample'; break; }
        S = fromSample(window.JMB_SAMPLE); ui.confirm = null; ui.stage = 0; ui.status = 'Sample loaded.'; break;
      case 'reset':
        if (ui.confirm !== 'reset') { ui.confirm = 'reset'; break; }
        S = blank(); ui.confirm = null; ui.stage = 0; ui.status = ''; break;

      case 'paste-open': ui.paste = true; ui.pasteErr = ''; ui.focus = '#paste-box'; break;
      case 'paste-close': ui.paste = false; break;
      case 'paste-apply': {
        const box = root.querySelector('#paste-box');
        const err = applyPaste(box ? box.value : '');
        if (err) { ui.pasteErr = err; break; }
        ui.paste = false; ui.step = 4; ui.status = 'Table added. Tag personas on the action cards if you want them on the map.';
        break;
      }

      case 'export': download(); return;
      case 'import': {
        const f = el.files && el.files[0]; if (!f) return;
        const rd = new FileReader();
        rd.onload = () => {
          try { S = normalize(JSON.parse(rd.result)); ui.stage = 0; ui.status = 'Opened ' + f.name + '.'; save(); }
          catch (e) { ui.status = 'That file could not be read. Choose a file saved from this app.'; }
          render();
        };
        rd.readAsText(f); return;
      }
      case 'generate': generate(); return;
      default: return;
    }
    save(); render();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || b.tagName === 'INPUT') return;
    act(b.dataset.act, b.dataset, b);
  });
  root.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.bind && t.type !== 'checkbox') { setPath(t.dataset.bind, t.value); save(); }
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.bind) {
      setPath(t.dataset.bind, t.type === 'checkbox' ? t.checked : t.value); save();
      if (t.type === 'checkbox' || 'rerender' in t.dataset) render();
      return;
    }
    if (t.dataset.actChange) act(t.dataset.actChange, t.dataset, t);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'tag-new') { e.preventDefault(); act('tag-add', {}, e.target); }
    if (e.key === 'Enter' && e.target.id === 'emoji-custom') { e.preventDefault(); act('emoji-custom', {}, e.target); }
    if (e.key === 'Escape' && ui.paste) { ui.paste = false; render(); }
  });

  render();
})();
