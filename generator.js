// Builds the journey map on the Miro board from the panel's data.
// Layout follows the ITAM Hardware Management template: dark header, persona bar,
// stage header row, then one row per enabled row type, then a footer bar.
(function () {
  'use strict';

  const L = {
    labelW: 170,     // left column with row names
    stageW: 300,     // width of each stage column
    pad: 12,         // padding inside each cell
    gap: 8,          // space between cards
    headerH: 124,
    personaH: 52,
    stageH: 84,
    footerH: 52,
    feelH: 300,
    font: 12,
    tagH: 24,
    emojiD: 44       // emoji marker diameter
  };

  const NAVY = '#13263A';
  const BODY_FONT = 'open_sans';
  const TITLE_FONT = 'georgia';

  const KIND = {
    actions: { cell: '#EAF0FB', label: '#DCE5F7', card: '#FFFFFF', border: '#C3CDE3', text: '#1B2430', prefix: '' },
    feelings: { cell: '#F2EDFA', label: '#E6DDF6' },
    bright: { cell: '#EAF6EE', label: '#DAEFE0', card: '#D6EFDC', border: '#93C9A0', text: '#1D5B2C', prefix: '\u2713 ' },
    pain: { cell: '#FCECEC', label: '#F8DCDC', card: '#F7D2D2', border: '#E09595', text: '#7F1D1D', prefix: '\u2715 ' },
    opps: { cell: '#FFF8E3', label: '#FDEFC4', card: '#FFEBB0', border: '#E3C15C', text: '#664A00', prefix: '\u00BB ' },
    note: { cell: '#F2F4F7', label: '#E4E8EE', card: '#FFFFFF', border: '#CDD3DB', text: '#1B2430', prefix: '' }
  };

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function tint(hex, amt) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    const mix = (c) => Math.round(c + (255 - c) * amt);
    const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
    return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  const textW = (s, size) => Math.ceil(String(s).length * size * 0.6) + 24;

  // Each card is drawn as an empty rounded box with separate text items placed on top
  // of it. Miro text items wrap and pad correctly the moment they are created, so the
  // card no longer needs a double click to settle its spacing.
  const SYM_W = 16;        // room for the check, x, or arrow symbol
  const PILL_H = 22;
  const PILL_GAP = 4;

  const pillW = (name) => textW(name, 10);
  const cardPersonas = (item, personas) => personas.filter((p) => (item.personas || []).includes(p.id));

  function wrapCount(text, width) {
    const cpl = Math.max(8, Math.floor(width / (L.font * 0.56)));
    let n = 0;
    String(text).split('\n').forEach((par) => {
      let line = 0;
      n++;
      par.split(/\s+/).filter(Boolean).forEach((w) => {
        if (!line) line = w.length;
        else if (line + 1 + w.length <= cpl) line += 1 + w.length;
        else { n++; line = w.length; }
        while (line > cpl) { n++; line -= cpl; }
      });
    });
    return Math.max(1, n);
  }

  // Works out the pieces of one card: where the text sits, how wide it can be,
  // and the column of persona pills on the right.
  function cardLayout(item, kind, personas) {
    const k = KIND[kind] || KIND.note;
    const cw = L.stageW - 2 * L.pad;
    const pills = kind === 'actions' ? [] : cardPersonas(item, personas);
    const pillCol = pills.length ? Math.max(...pills.map((p) => pillW(p.name))) + 10 : 0;
    const symW = k.prefix ? SYM_W : 0;
    const textX = 10 + symW;
    const textWidth = cw - textX - 10 - pillCol;
    const lines = wrapCount(item.text, textWidth);
    const textH = Math.ceil(lines * L.font * 1.45);
    const pillsH = pills.length ? pills.length * PILL_H + (pills.length - 1) * PILL_GAP : 0;
    const h = Math.max(36, Math.max(textH, pillsH) + 18);
    return { k, cw, pills, pillCol, symW, textX, textWidth, h };
  }

  function stageTags(stage, personas, rowKey) {
    const used = new Set();
    (stage.cells[rowKey] || []).forEach((it) => (it.personas || []).forEach((p) => used.add(p)));
    return personas.filter((p) => used.has(p.id));
  }

  // Runs async jobs with a small concurrency limit to stay friendly with Miro's rate limits.
  async function runAll(jobs, limit, onTick) {
    const out = new Array(jobs.length);
    let next = 0, done = 0;
    async function worker() {
      while (next < jobs.length) {
        const i = next++;
        out[i] = await jobs[i]();
        done++;
        if (onTick) onTick(done, jobs.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
    return out;
  }

  // Finds a map this app built earlier, by its stored frame id or the current selection.
  window.JMB_findMap = async function (frameId) {
    const board = miro.board;
    if (frameId) {
      try { const f = await board.getById(frameId); if (f && f.type === 'frame') return f; } catch (e) { /* gone */ }
    }
    try {
      const sel = await board.getSelection();
      for (const it of sel) {
        if (it.type !== 'frame') continue;
        try { if (await it.getMetadata('jmb')) return it; } catch (e) { /* not ours */ }
      }
    } catch (e) { /* no selection */ }
    return null;
  };

  // Deletes an existing map: its connectors, everything inside the frame, then the frame.
  window.JMB_removeMap = async function (frame, connectorIds, say) {
    const board = miro.board;
    let ids = connectorIds || [];
    try { const m = await frame.getMetadata('jmb'); if (m && m.connectorIds) ids = ids.concat(m.connectorIds); } catch (e) { /* none */ }
    const jobs = [];
    [...new Set(ids)].forEach((id) => jobs.push(async () => {
      try { const c = await board.getById(id); if (c) await board.remove(c); } catch (e) { /* already gone */ }
    }));
    let kids = [];
    try { kids = await frame.getChildren(); } catch (e) { /* none */ }
    kids.forEach((k) => jobs.push(() => board.remove(k).catch(() => null)));
    await runAll(jobs, 6, (d, t) => say && say('Clearing old map... ' + d + ' of ' + t));
    const box = { x: frame.x - frame.width / 2, y: frame.y - frame.height / 2 };
    await board.remove(frame).catch(() => null);
    return box;
  };

  window.JMB_generate = async function (S, progress, opts) {
    opts = opts || {};
    const say = progress || function () {};
    const board = miro.board;
    const rows = S.rows.filter((r) => r.on);
    const stages = S.stages;
    const personas = S.personas.filter((p) => p.name.trim());
    const n = stages.length;
    const totalW = L.labelW + n * L.stageW;

    // Work out each row's height from its fullest stage.
    const rowH = rows.map((r) => {
      if (r.kind === 'feelings') return L.feelH;
      let max = 0;
      stages.forEach((s) => {
        const items = (s.cells[r.key] || []).filter((i) => i.text.trim());
        let h = L.pad * 2;
        if (r.kind === 'actions' && stageTags(s, personas, r.key).length) h += L.tagH + L.gap;
        items.forEach((i) => { h += cardLayout(i, r.kind, personas).h + L.gap; });
        max = Math.max(max, h);
      });
      return Math.max(96, max);
    });

    const bodyTop = L.headerH + L.personaH + L.stageH;
    const totalH = bodyTop + rowH.reduce((a, b) => a + b, 0) + L.footerH;

    const vp = await board.viewport.get();
    // An update rebuilds the map at the same top left corner as the old one.
    const ox = opts.origin ? Math.round(opts.origin.x) : Math.round(vp.x + vp.width / 2 - totalW / 2);
    const oy = opts.origin ? Math.round(opts.origin.y) : Math.round(vp.y + vp.height / 2 - totalH / 2);
    const connectorIds = [];

    say('Creating frame...');
    const frame = await board.createFrame({
      title: S.title || 'Journey map',
      x: ox + totalW / 2, y: oy + totalH / 2,
      width: totalW, height: totalH,
      style: { fillColor: '#ffffff' }
    });

    if (opts.onFrame) opts.onFrame(frame);

    // Every board call goes through safe(): a failure or a call that never answers is
    // recorded and skipped, so one bad item can't stop the whole map.
    const errors = [];
    const safe = (label, fn) => Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, rej) => setTimeout(() => rej(new Error('no response from Miro')), 20000))
    ]).catch((e) => { errors.push(label + ': ' + ((e && e.message) || e)); console.error(label, e); return null; });

    const created = [];
    const groups = [];
    const shape = (x, y, w, h, style, content, kind) => () => safe('shape', () =>
      board.createShape({
        shape: kind || 'rectangle',
        content: content || '',
        x: x + w / 2, y: y + h / 2, width: w, height: h,
        style: Object.assign({ fontFamily: BODY_FONT, fontSize: 12, borderWidth: 1 }, style)
      })).then((it) => { if (it) created.push(it); return it; });
    const text = (x, y, w, content, style) => () => safe('text', () =>
      board.createText({
        content, x: x + w / 2, y, width: w,
        style: Object.assign({ fontFamily: BODY_FONT, fontSize: 12, textAlign: 'left' }, style)
      })).then((it) => { if (it) created.push(it); return it; });
    const connect = (a, b, style, kind) => (a && b) ? safe('line', () => board.createConnector({
      shape: kind,
      start: { item: a.id, position: { x: 1, y: 0.5 } },
      end: { item: b.id, position: { x: 0, y: 0.5 } },
      style
    })).then((c) => { if (c) connectorIds.push(c.id); return c; }) : Promise.resolve(null);
    const noBorder = { borderOpacity: 0, borderColor: '#ffffff' };

    // Phase 1: backgrounds and cells.
    const bg = [];
    bg.push(shape(ox, oy, totalW, L.headerH, Object.assign({ fillColor: NAVY }, noBorder)));
    bg.push(shape(ox, oy + L.headerH, totalW, L.personaH, Object.assign({ fillColor: '#F9DCC7' }, noBorder)));
    bg.push(shape(ox, oy + L.headerH + L.personaH, L.labelW, L.stageH,
      { fillColor: NAVY, borderColor: '#2C4159', color: '#C9D3DE', fontSize: 13, textAlign: 'center', textAlignVertical: 'middle' },
      '<p>Stage</p>'));
    stages.forEach((s, i) => {
      const content = '<p><strong>' + esc(s.name) + '</strong></p>' + (s.subtitle ? '<p>' + esc(s.subtitle.toUpperCase()) + '</p>' : '');
      bg.push(shape(ox + L.labelW + i * L.stageW, oy + L.headerH + L.personaH, L.stageW, L.stageH,
        { fillColor: NAVY, borderColor: '#2C4159', color: '#FFFFFF', fontSize: 15, fontFamily: TITLE_FONT, textAlign: 'center', textAlignVertical: 'middle' },
        content));
    });
    let y = oy + bodyTop;
    const rowTops = [];
    rows.forEach((r, ri) => {
      const k = KIND[r.kind] || KIND.note;
      rowTops.push(y);
      bg.push(shape(ox, y, L.labelW, rowH[ri],
        { fillColor: k.label, borderColor: '#FFFFFF', borderWidth: 2, color: '#2A3442', fontSize: 14, textAlign: 'center', textAlignVertical: 'middle' },
        '<p><strong>' + esc(r.label.toUpperCase()) + '</strong></p>'));
      stages.forEach((s, si) => {
        bg.push(shape(ox + L.labelW + si * L.stageW, y, L.stageW, rowH[ri],
          { fillColor: k.cell, borderColor: '#FFFFFF', borderWidth: 2 }));
      });
      y += rowH[ri];
    });
    bg.push(shape(ox, y, totalW, L.footerH, Object.assign({ fillColor: NAVY }, noBorder)));

    say('Laying out rows...');
    await runAll(bg, 6, (d, t) => say('Laying out rows... ' + d + ' of ' + t));

    // Phase 2: header text, persona legend, cards, emoji scale legend, neutral line anchors.
    const fg = [];
    fg.push(text(ox + 24, oy + 36, totalW - 48, esc(S.title || 'Journey map'),
      { color: '#FFFFFF', fontSize: 30, fontFamily: TITLE_FONT }));
    if (S.subtitle) {
      fg.push(text(ox + 24, oy + 70, totalW - 48, esc(S.subtitle), { color: '#C9D3DE', fontSize: 14 }));
    }
    let tx = ox + 24;
    (S.tags || []).forEach((t) => {
      const w = textW(t, 11);
      fg.push(shape(tx, oy + 88, w, 24,
        { fillColor: NAVY, borderColor: '#8FA1B5', color: '#E4EAF1', fontSize: 11, textAlign: 'center', textAlignVertical: 'middle' },
        esc(t), 'flow_chart_terminator'));
      tx += w + 8;
    });

    const py = oy + L.headerH + L.personaH / 2;
    fg.push(text(ox + 20, py, 100, '<strong>PERSONAS:</strong>', { color: '#5A3A22', fontSize: 11 }));
    let px = ox + 120;
    personas.forEach((p) => {
      fg.push(shape(px, py - 6, 12, 12, { fillColor: p.color, borderColor: p.color }, '', 'circle'));
      const label = esc(p.name) + (p.role ? ' - ' + esc(p.role) : '');
      const w = textW(p.name + ' - ' + (p.role || ''), 13);
      fg.push(text(px + 18, py, w, label, { color: '#2A3442', fontSize: 13 }));
      px += w + 30;
    });

    const footerText = [S.footer, S.project, S.date].filter(Boolean).map(esc).join('     \u2022     ');
    if (footerText) {
      fg.push(text(ox + 24, y + L.footerH / 2, totalW - 48, footerText, { color: '#E4EAF1', fontSize: 12 }));
    }

    const emojis = S.emojis;
    let feel = null;
    rows.forEach((r, ri) => {
      const top = rowTops[ri];
      if (r.kind === 'feelings') {
        const usable = L.feelH - 2 * 40;
        const level = (v) => top + 40 + (5 - v) * (usable / 4);
        feel = { top, level };
        for (let v = 1; v <= 5; v++) {
          fg.push(text(ox + L.labelW - 40, level(v), 32, emojis[v - 1], { fontSize: 16, textAlign: 'center' }));
        }
        return;
      }
      const k = KIND[r.kind] || KIND.note;
      stages.forEach((s, si) => {
        const cx = ox + L.labelW + si * L.stageW + L.pad;
        const cw = L.stageW - 2 * L.pad;
        let cy = top + L.pad;
        if (r.kind === 'actions') {
          const tags = stageTags(s, personas, r.key);
          let tagX = cx;
          tags.forEach((p) => {
            const w = textW(p.name, 11);
            fg.push(shape(tagX, cy, w, 22,
              { fillColor: tint(p.color, 0.85), borderColor: tint(p.color, 0.6), color: p.color, fontSize: 11, textAlign: 'center', textAlignVertical: 'middle' },
              '<strong>' + esc(p.name) + '</strong>', 'flow_chart_terminator'));
            tagX += w + 6;
          });
          if (tags.length) cy += L.tagH + L.gap;
        }
        (s.cells[r.key] || []).filter((i) => i.text.trim()).forEach((item) => {
          const c = cardLayout(item, r.kind, personas);
          const top = cy, mid = cy + c.h / 2;
          fg.push(async () => {
            const parts = [];
            parts.push(await shape(cx, top, c.cw, c.h,
              { fillColor: c.k.card, borderColor: c.k.border }, '', 'round_rectangle')());
            if (c.k.prefix) {
              parts.push(await text(cx + 8, mid, c.symW, esc(c.k.prefix.trim()),
                { color: c.k.text, fontSize: L.font, textAlign: 'center' })());
            }
            parts.push(await text(cx + c.textX, mid, c.textWidth, esc(item.text).replace(/\n/g, '<br>'),
              { color: c.k.text, fontSize: L.font, textAlign: 'left' })());
            if (c.pills.length) {
              const colX = cx + c.cw - 10 - (c.pillCol - 10);
              let py = mid - ((c.pills.length * PILL_H + (c.pills.length - 1) * PILL_GAP) / 2);
              for (const p of c.pills) {
                const w = pillW(p.name);
                parts.push(await shape(colX + (c.pillCol - 10 - w), py, w, PILL_H,
                  { fillColor: tint(p.color, 0.85), borderColor: tint(p.color, 0.6), color: p.color, fontSize: 10, textAlign: 'center', textAlignVertical: 'middle' },
                  '<strong>' + esc(p.name) + '</strong>', 'flow_chart_terminator')());
                py += PILL_H + PILL_GAP;
              }
            }
            const ok = parts.filter(Boolean);
            if (ok.length > 1) groups.push(ok);
            return ok[0];
          });
          cy += c.h + L.gap;
        });
      });
    });

    say('Adding cards...');
    await runAll(fg, 6, (d, t) => say('Adding cards... ' + d + ' of ' + t));

    // Phase 3: feelings markers and lines.
    if (feel) {
      say('Drawing feelings...');
      const midY = feel.level(3);
      const anchorStyle = { fillColor: '#FFFFFF', fillOpacity: 0, borderOpacity: 0, borderColor: '#FFFFFF', borderWidth: 1 };
      const [a1, a2] = await runAll([
        shape(ox + L.labelW + 4, midY - 6, 12, 12, anchorStyle, '', 'circle'),
        shape(ox + totalW - 16, midY - 6, 12, 12, anchorStyle, '', 'circle')
      ], 2);
      await connect(a1, a2, { strokeColor: '#9AA5B4', strokeWidth: 2, strokeStyle: 'dashed', startStrokeCap: 'none', endStrokeCap: 'none' }, 'straight');

      const spread = personas.length > 1 ? 16 : 0;
      for (let pi = 0; pi < personas.length; pi++) {
        const p = personas[pi];
        const r = (S.ratings && S.ratings[p.id]) || {};
        const jobs = [];
        stages.forEach((s, si) => {
          const v = r[s.id];
          if (!v) return;
          const cx = ox + L.labelW + si * L.stageW + L.stageW / 2 + (pi - (personas.length - 1) / 2) * spread;
          const cy = feel.level(v);
          jobs.push(shape(cx - L.emojiD / 2, cy - L.emojiD / 2, L.emojiD, L.emojiD,
            { fillColor: '#FFFFFF', borderColor: p.color, borderWidth: 3, fontSize: 20, textAlign: 'center', textAlignVertical: 'middle' },
            emojis[v - 1], 'circle'));
        });
        const dots = (await runAll(jobs, 6)).filter(Boolean);
        for (let i = 1; i < dots.length; i++) {
          await connect(dots[i - 1], dots[i], { strokeColor: p.color, strokeWidth: 4, startStrokeCap: 'none', endStrokeCap: 'none' }, 'curved');
        }
        say('Drawing feelings... ' + (pi + 1) + ' of ' + personas.length + ' personas');
      }
    }

    // Put everything inside the frame so it moves as one piece.
    say('Grouping into frame...');
    for (let i = 0; i < created.length; i += 20) {
      await Promise.all(created.slice(i, i + 20).map((it) => safe('frame', () => frame.add(it))));
    }

    // Group each card with its persona pills so they move together.
    if (typeof board.group === 'function') {
      for (const parts of groups) {
        await safe('group', () => board.group({ items: parts }));
      }
    }

    await safe('tag', () => frame.setMetadata('jmb', { connectorIds }));
    await safe('zoom', () => board.viewport.zoomTo(frame));
    return { frame, connectorIds, errors };
  };
})();
