(() => {
  'use strict';
  const dashboard = document.querySelector('#outcomes');
  if (!dashboard) return;

  // TENS-Task is provisional; the protocol schedules METUX only at weeks 4 and 8.
  // These are planning slots, not enrolled participants. Null is never a score.
  const users = Array.from({ length: 12 }, (_, i) => ({
    id: `user-${i + 1}`, label: `User ${i + 1}`, assessments: { 4: null, 8: null }, responses: { 4: {}, 8: {} }
  }));
  const needs = ['Autonomy', 'Competence', 'Relatedness'];
  const items = globalThis.RECO_TENS_TASK_ITEMS;
  const subscales = needs.flatMap(need => ['Support', 'Frustration'].map(kind => ({
    id: `${need.toLowerCase()}-${kind.toLowerCase()}`, need, kind, label: `${need} ${kind.toLowerCase()}`
  })));
  const weeks = [4, 8];
  const colors = { 4: '#2760ce', 8: '#0d7b72' };
  const tabs = [...dashboard.querySelectorAll('[role="tab"]')];
  const panels = [...dashboard.querySelectorAll('[role="tabpanel"]')];
  const userSelector = dashboard.querySelector('#user-selector');
  const charts = dashboard.querySelector('#user-charts');
  const subscaleSelect = dashboard.querySelector('#subscale-select');
  let selectedUser = users[0];
  // Start this layout empty once; preserve the previous prototype's scores for recovery.
  // A separate key also prevents older open tabs from repopulating this layout.
  const responseKey = 'reco-tens-task-responses-v2';
  const previousKey = `${responseKey}-previous`;
  const restoredKey = `${responseKey}-restored`;
  let previousResponses = null;
  const history = Object.fromEntries(users.map(user => [user.id, []]));
  const horizontalPositions = {};
  const questionnaireState = new Map();
  const ratingText = value => value === null ? '–' : String(value);
  try {
    if (localStorage.getItem(responseKey) === null) {
      const previous = localStorage.getItem('reco-tens-task-responses-v1');
      if (previous !== null && localStorage.getItem(previousKey) === null) localStorage.setItem(previousKey, previous);
      localStorage.setItem(responseKey, '{}');
    }
    const saved = JSON.parse(localStorage.getItem(responseKey) || '{}');
    users.forEach(user => weeks.forEach(week => items.forEach(item => {
      const value = saved?.[user.id]?.[week]?.[item.id];
      if (Number.isInteger(value) && value >= 1 && value <= 7) user.responses[week][item.id] = value;
    })));
  } catch { /* Responses can still be entered if browser storage is unavailable. */ }
  try {
    if (!localStorage.getItem(restoredKey)) {
      const previous = JSON.parse(localStorage.getItem(previousKey) || '{}');
      const hasScores = users.some(user => weeks.some(week => items.some(item => {
        const value = previous?.[user.id]?.[week]?.[item.id];
        return Number.isInteger(value) && value >= 1 && value <= 7;
      })));
      if (hasScores) previousResponses = previous;
    }
  } catch { /* An unavailable or invalid backup does not affect the current answers. */ }
  let movingStatement = null;
  const layoutObservers = [];
  const layoutStatus = html('div', 'sr-only');
  layoutStatus.setAttribute('role', 'status');
  dashboard.append(layoutStatus);
  const dragHelp = html('p', 'sr-only', 'Each statement stays in its week and Support or Frustration area. Unanswered statements start in the Not rated row outside the scale. Drag to a numbered line to enter a score, or back to Not rated to clear it. Select a label to read it. Up and Down move between positions on the graph. Delete clears an entered score. Escape cancels a drag or closes the full sentence.');
  dragHelp.id = 'statement-drag-help';
  dashboard.append(dragHelp);
  let noticeTimer;
  function announce(message) {
    layoutStatus.textContent = message;
    const hint = dashboard.querySelector('#score-hint');
    hint.textContent = message;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { hint.textContent = 'Drag to score · Click to read'; }, 4000);
  }
  function persistResponses() {
    try {
      localStorage.setItem(responseKey, JSON.stringify(Object.fromEntries(users.map(user => [user.id, user.responses]))));
      return true;
    } catch {
      announce('Saved for this session; browser storage is unavailable.');
      return false;
    }
  }
  function setResponse(item, week, value, remember = true) {
    const previous = rating(selectedUser, week, item.id);
    if (previous === value) return false;
    if (remember) history[selectedUser.id].push({ item, week, previous });
    if (value === null) delete selectedUser.responses[week][item.id];
    else selectedUser.responses[week][item.id] = value;
    persistResponses();
    return true;
  }
  function refresh() {
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    renderUser();
    renderCohort();
    const count = users.reduce((total, user) => total + weeks.reduce((sum, week) => sum + Object.keys(user.responses[week]).length, 0), 0);
    dashboard.querySelector('.data-key').textContent = count ? `${count} ${count === 1 ? 'answer' : 'answers'} saved` : 'No answers entered';
    dashboard.querySelector('#undo-response').disabled = history[selectedUser.id].length === 0;
    dashboard.querySelector('#restore-previous-responses').hidden = !previousResponses;
    window.scrollTo(scrollX, scrollY);
  }

  function html(tag, className, text) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function svg(tag, attrs = {}, text) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, String(value)));
    if (text !== undefined) el.textContent = text;
    return el;
  }
  function score(user, week, subscale) {
    const definition = subscales.find(entry => entry.id === subscale);
    const values = items.filter(item => item.need === definition.need && item.kind === definition.kind).map(item => rating(user, week, item.id));
    return values.every(value => value !== null) ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }
  function display(value) { return value === null ? '—' : value.toFixed(1); }
  function addPoint(plot, week, x, y, label) {
    const point = week === 4
      ? svg('circle', { cx: x, cy: y, r: 4.5, fill: colors[week] })
      : svg('rect', { x: x - 4, y: y - 4, width: 8, height: 8, fill: colors[week] });
    point.append(svg('title', {}, label));
    plot.append(point);
  }
  function axes(plot, width, height, left, right, top, bottom, ticks) {
    const y = value => top + (7 - value) / 6 * (height - top - bottom);
    ticks.forEach(tick => {
      plot.append(svg('line', { x1: left, x2: width - right, y1: y(tick), y2: y(tick), class: 'plot-grid' }));
      plot.append(svg('text', { x: left - 10, y: y(tick) + 4, 'text-anchor': 'end', class: 'plot-label' }, tick));
    });
    plot.append(svg('line', { x1: left, x2: width - right, y1: y(1), y2: y(1), class: 'plot-axis' }));
    return y;
  }
  // Item answers remain separate from the legacy across-user subscale view.
  function rating(user, week, itemId) {
    const value = user.responses[week]?.[itemId];
    return Number.isInteger(value) && value >= 1 && value <= 7 ? value : null;
  }

  const statementPopover = html('div', 'statement-popover');
  statementPopover.id = 'statement-popover';
  statementPopover.setAttribute('role', 'tooltip');
  statementPopover.hidden = true;
  document.body.append(statementPopover);
  let activeStatement = null;
  let pinnedStatement = false;
  let suppressStatementUntil = 0;
  let hideTimer;

  function hideStatement() {
    clearTimeout(hideTimer);
    statementPopover.hidden = true;
    if (activeStatement) {
      activeStatement.setAttribute('aria-expanded', 'false');
      if (activeStatement.classList.contains('draggable-chip')) activeStatement.setAttribute('aria-describedby', dragHelp.id);
      else activeStatement.removeAttribute('aria-describedby');
    }
    activeStatement = null;
    pinnedStatement = false;
    charts.querySelectorAll('.statement-match').forEach(node => node.classList.remove('statement-match'));
  }
  function showStatement(button, item) {
    if (movingStatement || Date.now() < suppressStatementUntil) return;
    clearTimeout(hideTimer);
    if (activeStatement && activeStatement !== button) hideStatement();
    activeStatement = button;
    button.setAttribute('aria-expanded', 'true');
    button.setAttribute('aria-describedby', `${button.classList.contains('draggable-chip') ? dragHelp.id + ' ' : ''}${statementPopover.id}`);
    statementPopover.replaceChildren();
    statementPopover.append(
      html('p', 'statement-full', item.full),
      html('span', 'statement-number', button.dataset.currentValue || '–')
    );
    statementPopover.hidden = false;
    statementPopover.style.visibility = 'hidden';
    const anchor = button.getBoundingClientRect();
    const box = statementPopover.getBoundingClientRect();
    const left = Math.max(10, Math.min(anchor.left, window.innerWidth - box.width - 10));
    const below = anchor.bottom + 9;
    const top = below + box.height < window.innerHeight - 10 ? below : Math.max(10, anchor.top - box.height - 9);
    statementPopover.style.left = `${left}px`;
    statementPopover.style.top = `${top}px`;
    statementPopover.style.visibility = 'visible';
    charts.querySelectorAll('[data-item]').forEach(node => node.classList.toggle('statement-match', node.dataset.item === item.id));
  }
  function scheduleHideStatement() {
    if (!pinnedStatement && activeStatement !== document.activeElement && !statementPopover.contains(document.activeElement)) {
      hideTimer = setTimeout(() => {
        if (!pinnedStatement && activeStatement !== document.activeElement && !statementPopover.contains(document.activeElement)) hideStatement();
      }, 160);
    }
  }
  statementPopover.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  statementPopover.addEventListener('pointerleave', scheduleHideStatement);
  document.addEventListener('pointerdown', event => {
    if (activeStatement && !activeStatement.contains(event.target) && !statementPopover.contains(event.target)) hideStatement();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') { const origin = activeStatement; movingStatement?.cancel(); hideStatement(); suppressStatementUntil = Date.now() + 150; if (origin?.isConnected) origin.focus({ preventScroll: true }); } });
  window.addEventListener('resize', () => { movingStatement?.cancel(); hideStatement(); });
  window.addEventListener('scroll', hideStatement, { capture: true, passive: true });

  function statementButton(item, week) {
    const button = html('button', 'statement-chip');
    const currentValue = rating(selectedUser, week, item.id);
    button.append(html('span', 'statement-copy', item.short), html('span', 'statement-number', ratingText(currentValue)));
    button.dataset.currentValue = currentValue === null ? '' : String(currentValue);
    button.type = 'button';
    button.dataset.item = item.id;
    button.dataset.week = week;
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-controls', statementPopover.id);
    button.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Delete');
    const value = rating(selectedUser, week, item.id);
    const responseLabel = value === null ? `week ${week}, not rated` : `week ${week}, rating ${value}`;
    button.setAttribute('aria-label', `${item.need} ${item.kind.toLowerCase()}: ${item.short}, ${responseLabel}`);
    button.addEventListener('pointerenter', () => { if (!pinnedStatement) showStatement(button, item); });
    button.addEventListener('pointerleave', scheduleHideStatement);
    button.addEventListener('focus', () => showStatement(button, item));
    button.addEventListener('blur', event => { if (!pinnedStatement && !statementPopover.contains(event.relatedTarget)) hideStatement(); });
    button.addEventListener('click', event => {
      if (movingStatement || Date.now() < suppressStatementUntil) return;
      if (activeStatement === button && pinnedStatement) hideStatement();
      else { showStatement(button, item); pinnedStatement = true; }
    });
    return button;
  }

  function placeLabel(button, layer, x, y) {
    const maxX = Math.max(0, layer.clientWidth - button.offsetWidth);
    const maxY = Math.max(0, layer.clientHeight - button.offsetHeight);
    const left = Math.max(0, Math.min(x, maxX));
    const top = Math.max(0, Math.min(y, maxY));
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    return { x: maxX ? left / maxX : 0, y: maxY ? top / maxY : 0 };
  }

  function updateStatementNumber(button, value) {
    button.dataset.currentValue = value === null ? '' : String(value);
    button.querySelector('.statement-number').textContent = ratingText(value);
    if (activeStatement === button && !statementPopover.hidden) statementPopover.querySelector('.statement-number').textContent = ratingText(value);
  }
  function nearestRating(button, item, plot) {
    const chipBounds = button.getBoundingClientRect();
    const centreY = chipBounds.top + chipBounds.height / 2;
    const rows = [...plot.querySelectorAll(`.${item.kind.toLowerCase()}-half .rating-row, .unrated-row[data-kind="${item.kind}"]`)];
    const middle = node => { const rect = node.getBoundingClientRect(); return rect.top + rect.height / 2; };
    const row = rows.reduce((closest, candidate) => Math.abs(middle(candidate) - centreY) < Math.abs(middle(closest) - centreY) ? candidate : closest);
    return row.classList.contains('unrated-row') ? null : Number(row.dataset.rating);
  }

  function makeDraggable(button, item, layer, plot) {
    let gesture = null;
    let suppressClick = false;
    let suppressionTimer;
    function endGesture(cancelled = false, event = null) {
      if (!gesture) return;
      const current = gesture;
      gesture = null;
      movingStatement = null;
      button.classList.remove('is-dragging');
      if (button.hasPointerCapture(current.id)) button.releasePointerCapture(current.id);
      if (!current.moved) return;
      suppressStatementUntil = Date.now() + 400;
      suppressClick = true;
      clearTimeout(suppressionTimer);
      suppressionTimer = setTimeout(() => { suppressClick = false; }, 350);
      if (cancelled || !event) { placeLabel(button, layer, current.left, current.top); updateStatementNumber(button, current.value); return; }
      const week = Number(button.dataset.week);
      const value = nearestRating(button, item, plot);
      const columnWidth = layer.clientWidth / 2;
      const columnStart = week === 4 ? 0 : columnWidth;
      horizontalPositions[`${selectedUser.id}:${week}:${item.id}`] = Math.max(0, Math.min(1, (button.offsetLeft - columnStart) / Math.max(1, columnWidth - button.offsetWidth)));
      setResponse(item, week, value);
      refresh();
      announce(`${item.short} · Week ${week}: ${value === null ? 'cleared' : value}`);
    }
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0 || !event.isPrimary) return;
      clearTimeout(suppressionTimer);
      suppressClick = false;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, left: button.offsetLeft, top: button.offsetTop, value: rating(selectedUser, Number(button.dataset.week), item.id), moved: false };
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove', event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const dx = event.clientX - gesture.x;
      const dy = event.clientY - gesture.y;
      if (!gesture.moved && Math.hypot(dx, dy) < 5) return;
      if (!gesture.moved) {
        gesture.moved = true;
        movingStatement = { cancel: () => endGesture(true) };
        hideStatement();
        button.classList.add('is-dragging');
      }
      event.preventDefault();
      const half = plot.querySelector(`.${item.kind.toLowerCase()}-half`).getBoundingClientRect();
      const unrated = plot.querySelector(`.unrated-row[data-kind="${item.kind}"]`).getBoundingClientRect();
      const layerBox = layer.getBoundingClientRect();
      const columnWidth = layer.clientWidth / 2;
      const columnStart = Number(button.dataset.week) === 4 ? 0 : columnWidth;
      const left = Math.max(columnStart + 8, Math.min(gesture.left + dx, columnStart + columnWidth - button.offsetWidth - 8));
      const top = Math.max(Math.min(half.top, unrated.top) - layerBox.top, Math.min(gesture.top + dy, Math.max(half.bottom, unrated.bottom) - layerBox.top - button.offsetHeight));
      placeLabel(button, layer, left, top);
      updateStatementNumber(button, nearestRating(button, item, plot));
    });
    button.addEventListener('pointerup', event => { if (gesture?.id === event.pointerId) endGesture(false, event); });
    button.addEventListener('pointercancel', () => endGesture(true));
    button.addEventListener('lostpointercapture', () => { if (gesture) endGesture(true); });
    button.addEventListener('click', event => {
      if (suppressClick) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
    }, true);
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape' && gesture) { event.preventDefault(); endGesture(true); return; }
      if (gesture) return;
      const arrow = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0;
      const clear = event.key === 'Delete' || event.key === 'Backspace';
      if (!arrow && !clear) return;
      event.preventDefault();
      const week = Number(button.dataset.week);
      const positions = item.kind === 'Support' ? [null, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, null];
      const index = positions.indexOf(rating(selectedUser, week, item.id));
      const value = clear ? null : positions[Math.max(0, Math.min(positions.length - 1, index - arrow))];
      setResponse(item, week, value);
      refresh();
      const replacement = [...charts.querySelectorAll('[data-item]')].find(node => node.dataset.item === item.id && Number(node.dataset.week) === week);
      replacement?.focus({ preventScroll: true });
      announce(`${item.short} · Week ${week}: ${value === null ? 'cleared' : value}`);
    });
  }

  function questionnaire(need) {
    const needId = need.toLowerCase();
    const userKey = `${selectedUser.id}:${needId}`;
    const details = html('details', 'questionnaire');
    details.dataset.disclosureKey = userKey;
    details.open = questionnaireState.get(userKey) ?? false;
    const summary = html('summary', '', 'Questionnaire');
    summary.setAttribute('aria-label', `${need} questionnaire`);
    details.append(summary);
    weeks.forEach(week => {
      const weekKey = `${userKey}:${week}`;
      const assessment = html('details', 'questionnaire-week');
      assessment.dataset.disclosureKey = weekKey;
      assessment.dataset.week = week;
      assessment.open = questionnaireState.get(weekKey) ?? week === 4;
      const weekSummary = html('summary', '', `Week ${week}`);
      weekSummary.setAttribute('aria-label', `${need} questionnaire, Week ${week}`);
      assessment.append(weekSummary);
      const matrixScroll = html('div', 'questionnaire-matrix-scroll');
      matrixScroll.dataset.scrollKey = weekKey;
      const matrix = html('div', 'questionnaire-matrix');
      const scaleHeader = html('div', 'questionnaire-scale-header');
      const scaleHeading = html('div', 'questionnaire-scale-heading');
      const anchors = html('div', 'questionnaire-anchors');
      anchors.append(html('span', '', 'Strongly disagree'), html('span', '', 'Strongly agree'));
      const values = html('div', 'questionnaire-values');
      for (let value = 1; value <= 7; value++) values.append(html('span', '', String(value)));
      scaleHeading.append(anchors, values);
      scaleHeader.append(scaleHeading);
      matrix.append(scaleHeader);
      ['Support', 'Frustration'].forEach(kind => {
        const group = html('section', 'questionnaire-subscale');
        group.dataset.kind = kind;
        const heading = html('h3', '', kind);
        heading.id = `questions-${needId}-${week}-${kind.toLowerCase()}`;
        group.setAttribute('aria-labelledby', heading.id);
        group.append(heading);
        items.filter(item => item.need === need && item.kind === kind).forEach(item => {
          const question = html('div', 'questionnaire-item');
          question.setAttribute('role', 'group');
          question.dataset.responseItem = item.id;
          question.dataset.responseWeek = week;
          const statement = html('p', 'questionnaire-statement', item.full);
          statement.id = `question-${item.id}-${week}`;
          question.setAttribute('aria-labelledby', statement.id);
          const scale = html('div', 'questionnaire-scale');
          const choices = html('div', 'questionnaire-choices');
          for (let value = 1; value <= 7; value++) {
            const choice = html('button', 'questionnaire-choice');
            choice.type = 'button';
            choice.dataset.responseValue = value;
            choice.setAttribute('aria-label', `${value}${value === 1 ? ' — strongly disagree' : value === 7 ? ' — strongly agree' : ''}`);
            choice.setAttribute('aria-pressed', String(rating(selectedUser, week, item.id) === value));
            choice.addEventListener('click', () => {
              const nextValue = rating(selectedUser, week, item.id) === value ? null : value;
              setResponse(item, week, nextValue);
              refresh();
              const replacement = charts.querySelector(`[data-response-item="${item.id}"][data-response-week="${week}"] [data-response-value="${value}"]`);
              replacement?.focus({ preventScroll: true });
              announce(`${item.short} · Week ${week}: ${nextValue === null ? 'cleared' : nextValue}`);
            });
            choices.append(choice);
          }
          scale.append(choices);
          question.append(statement, scale);
          group.append(question);
        });
        matrix.append(group);
      });
      matrixScroll.append(matrix);
      assessment.append(matrixScroll);
      details.append(assessment);
    });
    return details;
  }

  function renderUser() {
    if (movingStatement) movingStatement.cancel();
    layoutObservers.splice(0).forEach(observer => observer.disconnect());
    hideStatement();
    charts.querySelectorAll('details[data-disclosure-key]').forEach(details => questionnaireState.set(details.dataset.disclosureKey, details.open));
    const scrollPositions = new Map([...charts.querySelectorAll('.mirror-scroll,.questionnaire-matrix-scroll')].map(scroll => [scroll.dataset.need || scroll.dataset.scrollKey, scroll.scrollLeft]));
    dashboard.querySelector('#selected-user').textContent = selectedUser.label;
    userSelector.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.user === selectedUser.id)));
    charts.replaceChildren();
    needs.forEach(need => {
      const section = html('section', 'need-detail');
      const heading = html('h2', '', need);
      heading.id = `need-${need.toLowerCase()}`;
      section.setAttribute('aria-labelledby', heading.id);
      section.append(heading);
      const scroll = html('div', 'mirror-scroll');
      scroll.dataset.need = need;
      const plot = html('div', 'mirror-plot');
      plot.setAttribute('role', 'group');
      plot.setAttribute('aria-label', `${selectedUser.label}, ${need}, individual responses at weeks 4 and 8`);
      const needItems = items.filter(item => item.need === need);
      const axis = html('div', 'week-axis');
      axis.append(html('span'));
      weeks.forEach(week => axis.append(html('span', `week-label week-label-${week}`, `Week ${week}`)));
      plot.append(axis);
      ['Support', 'Frustration'].forEach(kind => {
        const unrated = html('div', 'unrated-row');
        unrated.dataset.kind = kind;
        unrated.append(html('span', 'unrated-label', 'Not rated'));
        weeks.forEach(() => unrated.append(html('div', 'unrated-cell')));
        if (kind === 'Support') plot.append(unrated);
        if (kind === 'Frustration') {
          const divider = html('div', 'centre-divider');
          const anchor = html('span', 'disagree-anchor');
          anchor.append(html('span', 'disagree-label', 'strongly disagree'));
          divider.append(anchor);
          plot.append(divider);
        }
        const half = html('div', `mirror-half ${kind.toLowerCase()}-half`);
        half.setAttribute('role', 'group');
        const halfLabel = `ReCo ${kind === 'Support' ? 'supports' : 'frustrates'} my need for ${need.toLowerCase()}`;
        half.setAttribute('aria-label', halfLabel);
        half.append(html('span', 'half-name', halfLabel));
        // Two independent positive scales: frustration is mirrored, never recoded.
        const ticks = kind === 'Support' ? [7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7];
        ticks.forEach(tick => {
          const row = html('div', 'rating-row');
          row.dataset.rating = tick;
          row.dataset.kind = kind;
          const label = html('span', 'rating-tick', String(tick));
          label.setAttribute('aria-hidden', 'true');
          row.append(label);
          weeks.forEach(week => {
            const cell = html('div', 'rating-cell');
            cell.dataset.week = week;
            row.append(cell);
          });
          if (tick === 7) row.append(html('span', 'agree-anchor', 'strongly agree'));
          half.append(row);
        });
        plot.append(half);
        if (kind === 'Frustration') plot.append(unrated);
      });
      scroll.append(plot);
      section.append(scroll);

      const layer = html('div', 'chip-layer');
      layer.setAttribute('aria-label', `${need} draggable responses`);
      plot.append(layer);
      needItems.forEach(item => weeks.forEach(week => {
        const button = statementButton(item, week);
        button.classList.add('draggable-chip');
        button.dataset.kind = item.kind;
        button.setAttribute('aria-describedby', dragHelp.id);
        layer.append(button);
        makeDraggable(button, item, layer, plot);
      }));
      const positionLabels = () => {
        ['Support', 'Frustration'].forEach(kind => {
          weeks.forEach(week => {
            const allButtons = [...layer.querySelectorAll('.draggable-chip')].filter(button => button.dataset.kind === kind && Number(button.dataset.week) === week);
            for (const value of [null, 1, 2, 3, 4, 5, 6, 7]) {
              const group = allButtons.filter(button => rating(selectedUser, week, button.dataset.item) === value);
              if (!group.length) continue;
              const columnWidth = layer.clientWidth / 2;
              const start = week === 4 ? 0 : columnWidth;
              const end = start + columnWidth - 8;
              let slotLeft = start + 8;
              const startingSlots = new Map(allButtons.map(button => {
                const entry = [button, slotLeft];
                slotLeft += button.offsetWidth + 8;
                return entry;
              }));
              const positioned = group.map((button, index) => {
                const saved = horizontalPositions[`${selectedUser.id}:${week}:${button.dataset.item}`];
                const fraction = saved ?? (index + 0.5) / group.length;
                const left = value === null ? startingSlots.get(button) : start + 8 + fraction * Math.max(0, columnWidth - 16 - button.offsetWidth);
                return { button, width: button.offsetWidth, left };
              }).sort((first, second) => first.left - second.left);
              let next = start + 8;
              positioned.forEach(entry => { entry.left = Math.max(entry.left, next); next = entry.left + entry.width + 8; });
              let limit = end;
              [...positioned].reverse().forEach(entry => { entry.left = Math.min(entry.left, limit - entry.width); limit = entry.left - 8; });
              const row = plot.querySelector(value === null ? `.unrated-row[data-kind="${kind}"]` : `.${kind.toLowerCase()}-half .rating-row[data-rating="${value}"]`);
              const rowRect = row.getBoundingClientRect();
              const layerRect = layer.getBoundingClientRect();
              positioned.forEach(entry => placeLabel(entry.button, layer, entry.left, rowRect.top - layerRect.top + (rowRect.height - entry.button.offsetHeight) / 2));
            }
          });
        });
      };
      const observer = new ResizeObserver(() => { if (!movingStatement) positionLabels(); });
      observer.observe(layer);
      layoutObservers.push(observer);
      section.append(questionnaire(need));
      charts.append(section);
      positionLabels();
      scroll.scrollLeft = scrollPositions.get(need) ?? 0;
      section.querySelectorAll('.questionnaire-matrix-scroll').forEach(matrixScroll => {
        matrixScroll.scrollLeft = scrollPositions.get(matrixScroll.dataset.scrollKey) ?? 0;
      });
    });
  }
  function renderCohort() {
    const scale = subscales.find(item => item.id === subscaleSelect.value);
    const plot = svg('svg', { viewBox: '0 0 1080 330', class: 'cohort-chart', role: 'img', 'aria-label': `${scale.label}, weeks 4 and 8 for User 1 to User 12. Scores are listed in the table below.` });
    const y = axes(plot, 1080, 330, 35, 15, 15, 38, [1, 2, 3, 4, 5, 6, 7]);
    users.forEach((user, i) => {
      const x = 76 + i * 86;
      plot.append(svg('text', { x, y: 318, 'text-anchor': 'middle', class: 'plot-label' }, user.label));
      weeks.forEach(week => {
        const value = score(user, week, scale.id);
        if (value !== null) addPoint(plot, week, x + (week === 4 ? -7 : 7), y(value), `${user.label}, week ${week}: ${value.toFixed(1)}`);
      });
    });
    dashboard.querySelector('#cohort-chart').replaceChildren(plot);
    const table = html('table', 'score-table');
    const caption = html('caption', 'sr-only', `${scale.label} scores`);
    const thead = html('thead');
    const tableHead = html('tr');
    ['Assessment', ...users.map(user => user.label)].forEach(label => {
      const cell = html('th', '', label);
      cell.scope = 'col';
      tableHead.append(cell);
    });
    thead.append(tableHead);
    const tableBody = html('tbody');
    weeks.forEach(week => {
      const row = html('tr');
      const heading = html('th', '', `Week ${week}`);
      heading.scope = 'row';
      row.append(heading);
      users.forEach(user => {
        const value = score(user, week, scale.id);
        const cell = html('td', '', display(value));
        if (value === null) cell.setAttribute('aria-label', 'No data');
        row.append(cell);
      });
      tableBody.append(row);
    });
    table.append(caption, thead, tableBody);
    dashboard.querySelector('#cohort-score-table').replaceChildren(table);
  }
  function setView(tab, focus = false) {
    if (movingStatement) movingStatement.cancel();
    hideStatement();
    tabs.forEach(item => {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.id !== tab.getAttribute('aria-controls'); });
    if (focus) tab.focus();
  }
  users.forEach(user => {
    const button = html('button', '', user.label);
    button.type = 'button';
    button.dataset.user = user.id;
    button.addEventListener('click', () => { selectedUser = user; refresh(); });
    userSelector.append(button);
  });
  subscales.forEach(scale => {
    const option = html('option', '', scale.label);
    option.value = scale.id;
    subscaleSelect.append(option);
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => setView(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = tabs[(index + 1) % tabs.length];
      if (event.key === 'Home') next = tabs[0];
      if (event.key === 'End') next = tabs[tabs.length - 1];
      if (next) { event.preventDefault(); setView(next, true); }
    });
  });
  dashboard.querySelector('#undo-response').addEventListener('click', () => {
    const last = history[selectedUser.id].pop();
    if (!last) return;
    setResponse(last.item, last.week, last.previous, false);
    refresh();
    announce('Last score change undone.');
  });
  dashboard.querySelector('#restore-previous-responses').addEventListener('click', () => {
    if (!previousResponses) return;
    if (movingStatement) movingStatement.cancel();
    hideStatement();
    users.forEach(user => weeks.forEach(week => items.forEach(item => {
      const value = previousResponses?.[user.id]?.[week]?.[item.id];
      if (rating(user, week, item.id) === null && Number.isInteger(value) && value >= 1 && value <= 7) {
        user.responses[week][item.id] = value;
      }
    })));
    users.forEach(user => { history[user.id] = []; });
    const saved = persistResponses();
    if (saved) {
      previousResponses = null;
      try { localStorage.setItem(restoredKey, '1'); } catch { /* The backup remains available. */ }
    }
    refresh();
    announce(saved ? 'Previous scores restored; newer answers kept.' : 'Scores restored for this session; backup kept because browser storage is unavailable.');
  });
  subscaleSelect.addEventListener('change', renderCohort);
  refresh();
})();
