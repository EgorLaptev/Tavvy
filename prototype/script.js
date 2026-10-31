const recentTabs = [];
const examples = {
  'Глубокое обучение': ['Нейронные сети'],
  'Инфобез': ['Материалы курса', 'Практические задания', 'Документация'],
  'Проектная документация': ['Документация проекта', 'Требования'],
  'РЧОИ': ['Материалы курса', 'Лекции', 'Практика', 'Задания', 'Конспект', 'Документация', 'Ресурсы', 'Расписание'],
  'РекСис': ['Материалы курса', 'Лекции', 'Практика', 'Задания', 'Статьи', 'Документация'],
  'Тестирование': ['Материалы курса', 'Тест-план', 'Тест-кейсы', 'Отчёт об ошибках', 'Документация', 'Практика', 'Задания', 'Ресурсы', 'Расписание'],
  'Personal': ['Личное'], 'Волчистость': ['Материалы'],
  'Мага': ['Материалы', 'Документы', 'Заметки', 'Задания', 'Ресурсы', 'Расписание']
};
document.querySelectorAll('.group').forEach(group => {
  const header = group.querySelector('.group-header');
  const name = header.querySelector('strong').textContent;
  const button = document.createElement('button');
  button.className = header.className;
  button.type = 'button';
  button.setAttribute('aria-expanded', 'false');
  button.innerHTML = header.innerHTML;
  const toggle = document.createElement("button");
  toggle.type = "button"; toggle.className = "group-toggle"; toggle.setAttribute("aria-label", "Показать вкладки группы " + name); toggle.setAttribute("aria-expanded", "false");
  toggle.append(button.querySelector(".count"), button.querySelector(".arrow"));
  const wrapper = document.createElement("div"); wrapper.className = "group-controls"; wrapper.append(button, toggle); header.replaceWith(wrapper);
  const tabs = document.createElement('div');
  tabs.className = 'tabs';
  tabs.classList.add("is-closed");
  const entries = examples[name] || [];
  if (entries.length) entries.forEach(title => { const row = document.createElement('div'); row.className = "tab-row"; const icon = document.createElement("span"); icon.className = "tab-favicon"; icon.textContent = title.charAt(0).toUpperCase(); const label = document.createElement("span"); label.textContent = title; const close = document.createElement("button"); close.className = "tab-close"; close.type = "button"; close.setAttribute("aria-label", "Закрыть вкладку " + title); close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>'; close.addEventListener("click", () => { recentTabs.unshift({ title, closedAt: new Date(), row, source: row.closest(".group") }); renderRecent(); row.remove(); const count = toggle.querySelector(".count"); count.textContent = String(Math.max(0, Number(count.textContent) - 1)); if (Number(count.textContent) === 0 && toggle.getAttribute("aria-expanded") === "true") toggle.click(); else tabs.style.height = tabs.querySelector(".tabs-inner").scrollHeight + "px"; }); row.append(icon, label, close); tabs.append(row); });
  else { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'Нет вкладок'; tabs.append(empty); }
  const inner = document.createElement("div"); inner.className = "tabs-inner"; inner.append(...tabs.childNodes); tabs.append(inner);
  group.append(tabs);
  button.removeAttribute("aria-expanded");
  button.addEventListener("click", () => { document.querySelectorAll(".group.active").forEach(item => item.classList.remove("active")); group.classList.add("active"); });
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    if (open) {
      tabs.style.height = tabs.scrollHeight + "px";
      requestAnimationFrame(() => { tabs.style.height = "0px"; tabs.classList.add("is-closed"); });
    } else {
      document.querySelectorAll('.group-toggle[aria-expanded="true"]').forEach(other => { if (other !== toggle) other.click(); });
      tabs.classList.remove("is-closed");
      tabs.style.height = tabs.scrollHeight + "px";
    }
  });
});









const searchInput = document.querySelector('.search input');
let searchTimer;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(updateSearch, 180);
});
function updateSearch() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const groups = [...document.querySelectorAll('.group')];
  const matchingGroups = groups.filter(group => group.querySelector('.group-header strong').textContent.toLocaleLowerCase().includes(query) || [...group.querySelectorAll('.tab-row')].some(row => row.querySelector('span:nth-child(2)').textContent.toLocaleLowerCase().includes(query)));
  groups.forEach(group => {
    const name = group.querySelector('.group-header strong').textContent.toLocaleLowerCase();
    const rows = [...group.querySelectorAll('.tab-row')];
    const groupMatch = name.includes(query);
    const noMatches = query && matchingGroups.length === 0;
    let matches = 0;
    rows.forEach(row => {
      const match = !query || noMatches || groupMatch || row.querySelector('span:nth-child(2)').textContent.toLocaleLowerCase().includes(query);
      row.hidden = !match;
      if (match) matches++;
    });
    const visible = !query || noMatches || groupMatch || matches > 0;
    group.classList.toggle('search-hidden', !visible);
    const toggle = group.querySelector('.group-toggle');
    const open = toggle.getAttribute('aria-expanded') === 'true';
    if (query && matchingGroups.length === 1 && visible && matches && !open) {
      toggle.setAttribute('aria-expanded', 'true');
      const tabs = group.querySelector('.tabs');
      tabs.classList.remove('is-closed');
      tabs.style.height = tabs.querySelector('.tabs-inner').scrollHeight + 'px';
    } else if (open) {
      const tabs = group.querySelector('.tabs');
      tabs.style.height = tabs.querySelector('.tabs-inner').scrollHeight + 'px';
    }
  });
}

let draggedTab = null;
document.querySelectorAll('.group').forEach(group => {
  group.addEventListener('dragover', event => {
    if (!draggedTab) return;
    event.preventDefault(); event.stopPropagation();
    group.classList.add('drop-target');
  });
  group.addEventListener('dragleave', event => { if (!group.contains(event.relatedTarget)) group.classList.remove('drop-target'); });
  group.addEventListener('drop', event => {
    if (!draggedTab) return;
    event.preventDefault(); event.stopPropagation(); group.classList.remove('drop-target');
    const source = draggedTab.closest('.group');
    const destination = group.querySelector(':scope > .tabs .tabs-inner');
    destination.querySelector('.empty')?.remove(); destination.append(draggedTab);
    if (source !== group) {
      const from = source.querySelector(':scope > .group-controls .count');
      const to = group.querySelector(':scope > .group-controls .count');
      from.textContent = Math.max(0, Number(from.textContent) - 1);
      to.textContent = Number(to.textContent) + 1;
    }
    [source, group].forEach(item => { const tabs = item.querySelector(':scope > .tabs'); if (!tabs.classList.contains('is-closed')) tabs.style.height = tabs.querySelector('.tabs-inner').scrollHeight + 'px'; });
  });
});

// Pointer-based dragging keeps the lifted card under the cursor and shows its destination.
let groupDrag = null;
let suppressGroupClick = false;
document.querySelectorAll('.group-header').forEach(header => {
  header.draggable = false;
  header.addEventListener('click', event => { if (suppressGroupClick) { event.stopImmediatePropagation(); event.preventDefault(); } }, true);
  header.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const group = header.closest('.group');
    groupDrag = { group, header, x: event.clientX, y: event.clientY, active: false };
    header.setPointerCapture(event.pointerId);
  });
  header.addEventListener('pointermove', event => {
    if (!groupDrag || groupDrag.header !== header) return;
    const d = groupDrag;
    if (!d.active && Math.hypot(event.clientX - d.x, event.clientY - d.y) > 6) {
      d.active = true;
      const rect = d.group.getBoundingClientRect();
      d.offsetX = d.x - rect.left; d.offsetY = d.y - rect.top;
      d.placeholder = document.createElement('div'); d.placeholder.className = 'group-placeholder';
      d.placeholder.style.height = rect.height + 'px';
      d.group.before(d.placeholder);
      d.ghost = d.group.querySelector(':scope > .group-controls').cloneNode(true);
      d.ghost.classList.add('group-drag-ghost');
      d.ghost.style.width = rect.width + 'px'; document.body.append(d.ghost);
      d.group.classList.add('group-drag-source');
      document.body.classList.add('group-dragging'); document.querySelector('.group-trash').classList.add('visible');
    }
    if (!d.active) return;
    d.ghost.style.transform = `translate3d(${event.clientX - d.offsetX}px, ${event.clientY - d.offsetY}px, 0) rotate(1deg)`;
    const trash = document.querySelector('.group-trash');
    const trashRect = trash.getBoundingClientRect();
    const overTrash = event.clientX >= trashRect.left && event.clientX <= trashRect.right && event.clientY >= trashRect.top && event.clientY <= trashRect.bottom;
    if (overTrash && !d.trashTimer) {
      trash.classList.add('holding');
      d.trashTimer = setTimeout(() => { d.trashReady = true; trash.classList.add('ready'); }, 500);
    } else if (!overTrash && d.trashTimer) { clearTimeout(d.trashTimer); d.trashTimer = null; d.trashReady = false; trash.classList.remove('holding', 'ready'); }
    if (overTrash) { document.querySelectorAll('.group-nest-target').forEach(el => el.classList.remove('group-nest-target')); d.nest = null; return; }
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.group');
    document.querySelectorAll('.group-nest-target').forEach(el => el.classList.remove('group-nest-target'));
    d.nest = null;
    if (!target || target === d.group || d.group.contains(target) || target.classList.contains('group-drag-source')) return;
    const rect = target.getBoundingClientRect();
    const headerRect = target.querySelector(':scope > .group-controls').getBoundingClientRect();
    const nearEdge = event.clientY < headerRect.top + 8 || event.clientY > rect.bottom - 8;
    if (!nearEdge) { d.nest = target; target.classList.add('group-nest-target'); }
    else {
      const after = event.clientY > rect.top + rect.height / 2;
      const siblings = [...document.querySelectorAll('.group')].filter(el => el !== d.group && !d.group.contains(el));
      const before = new Map(siblings.map(el => [el, el.getBoundingClientRect().top]));
      target.parentElement.insertBefore(d.placeholder, after ? target.nextSibling : target);
      siblings.forEach(el => { const delta = before.get(el) - el.getBoundingClientRect().top; if (delta) el.animate([{transform:`translateY(${delta}px)`},{transform:'translateY(0)'}], {duration:180,easing:'ease-out'}); });
    }
    const scroller = document.querySelector('.groups'); const bounds = scroller.getBoundingClientRect();
    if (event.clientY < bounds.top + 30) scroller.scrollTop -= 10;
    if (event.clientY > bounds.bottom - 30) scroller.scrollTop += 10;
  });
  function finish(event, cancel = false) {
    if (!groupDrag || groupDrag.header !== header) return;
    const d = groupDrag; groupDrag = null;
    if (!d.active) return;
    suppressGroupClick = true; setTimeout(() => { suppressGroupClick = false; }, 0);
    if (!cancel && d.trashReady) { clearTimeout(d.trashTimer); d.group.remove(); d.placeholder.remove(); d.ghost.remove(); document.querySelector('.group-trash').classList.remove('visible', 'holding', 'ready'); document.body.classList.remove('group-dragging'); return; }
    if (!cancel && d.nest) {
      let children = d.nest.querySelector(':scope > .subgroups');
      if (!children) { children = document.createElement('div'); children.className = 'subgroups'; d.nest.append(children); }
      children.append(d.group);
    } else if (!cancel) d.placeholder.before(d.group);
    d.group.classList.remove('group-drag-source'); d.placeholder.remove();
    document.querySelectorAll('.group-nest-target').forEach(el => el.classList.remove('group-nest-target'));
    clearTimeout(d.trashTimer); document.querySelector('.group-trash').classList.remove('visible', 'holding', 'ready');
    document.body.classList.remove('group-dragging');
    const end = d.group.querySelector(':scope > .group-controls').getBoundingClientRect();
    d.ghost.animate([{transform:d.ghost.style.transform,opacity:1},{transform:`translate3d(${end.left}px, ${end.top}px, 0) rotate(0deg)`,opacity:0}], {duration:180,easing:'ease-out'}).finished.finally(() => d.ghost.remove());
  }
  header.addEventListener('pointerup', finish);
  header.addEventListener('pointercancel', event => finish(event, true));
});
document.querySelectorAll('.tab-row').forEach(row => {
  row.draggable = true;
  row.addEventListener('dragstart', event => { event.stopPropagation(); draggedTab = row; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', 'tab'); requestAnimationFrame(() => row.classList.add('dragging')); });
  row.addEventListener('dragend', () => { row.classList.remove('dragging'); draggedTab = null; document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target')); });
  row.addEventListener('dragover', event => { if (!draggedTab || draggedTab === row) return; event.preventDefault(); event.stopPropagation(); const after = event.clientY > row.getBoundingClientRect().top + row.offsetHeight / 2; row.parentElement.insertBefore(draggedTab, after ? row.nextSibling : row); });
});

const recentButton = document.querySelector('.recent-button');
const recentList = document.querySelector('.recent-list');
function renderRecent() {
  recentList.replaceChildren();
  recentButton.classList.toggle('is-visible', recentTabs.length > 0);
  recentButton.setAttribute('aria-hidden', String(recentTabs.length === 0));
  recentButton.tabIndex = recentTabs.length ? 0 : -1;
  if (!recentTabs.length) { const empty = document.createElement('div'); empty.textContent = 'Нет недавно закрытых вкладок'; recentList.append(empty); return; }
  recentTabs.forEach((entry, index) => { const { title, closedAt, row, source } = entry; const item = document.createElement('div'); item.className = 'recent-row'; const icon = document.createElement('span'); icon.className = 'tab-favicon'; icon.textContent = title.charAt(0).toUpperCase(); const label = document.createElement('span'); label.className = 'recent-title'; label.textContent = title; const date = document.createElement('time'); date.dateTime = closedAt.toISOString(); const minutes = Math.floor((Date.now() - closedAt.getTime()) / 60000); date.textContent = minutes < 1 ? 'только что' : minutes < 60 ? minutes + ' мин назад' : closedAt.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'restore-button'; restore.setAttribute('aria-label', 'Вернуть вкладку ' + title); restore.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 7a5 5 0 1 1 1.2 4M3 3v4h4"/></svg>'; restore.addEventListener('click', () => { if (item.classList.contains('restoring')) return; animatePanelResize(); item.classList.add('restoring'); setTimeout(() => { const destination = source.querySelector('.tabs-inner'); destination.querySelector('.empty')?.remove(); destination.append(row); const count = source.querySelector('.count'); count.textContent = String(Number(count.textContent) + 1); const tabs = source.querySelector('.tabs'); if (!tabs.classList.contains('is-closed')) tabs.style.height = destination.scrollHeight + 'px'; recentTabs.splice(recentTabs.indexOf(entry), 1); if (!recentTabs.length && recentButton.getAttribute('aria-expanded') === 'true') { recentButton.setAttribute('aria-expanded', 'false'); recentList.hidden = true; document.querySelector('.groups').hidden = false; document.querySelector('.bottom-bar').hidden = false; document.querySelector('.archive-bar').hidden = true; } renderRecent(); }, 200); }); item.append(icon, label, date, restore); recentList.append(item); });
}
recentButton.addEventListener('click', () => { animatePanelResize(); document.querySelectorAll('.group-toggle[aria-expanded="true"]').forEach(toggle => toggle.click()); const open = recentButton.getAttribute('aria-expanded') === 'true'; recentButton.setAttribute('aria-expanded', String(!open)); document.querySelector('.bottom-bar').hidden = !open; document.querySelector('.archive-bar').hidden = open; const groups = document.querySelector('.groups'); const outgoing = open ? recentList : groups; const incoming = open ? groups : recentList; outgoing.classList.add('view-leaving'); setTimeout(() => { outgoing.hidden = true; outgoing.classList.remove('view-leaving'); incoming.hidden = false; incoming.classList.add('view-entering'); if (!open) renderRecent(); requestAnimationFrame(() => requestAnimationFrame(() => incoming.classList.remove('view-entering'))); }, 120); });





renderRecent();




document.querySelectorAll('.group').forEach(group => {
  const controls = group.querySelector('.group-controls');
  const add = document.createElement('button');
  add.type = 'button'; add.className = 'add-subgroup'; add.textContent = '+';
  add.setAttribute('aria-label', 'Новая вкладка в группе');
  controls.insertBefore(add, controls.querySelector('.group-toggle'));
  add.addEventListener('click', () => {
    document.querySelectorAll('.group.active').forEach(item => item.classList.remove('active'));
    group.classList.add('active');
    const row = document.createElement('div'); row.className = 'tab-row';
    const icon = document.createElement('span'); icon.className = 'tab-favicon'; icon.textContent = 'Н';
    const label = document.createElement('span'); label.textContent = 'Новая вкладка';
    const close = document.createElement('button'); close.className = 'tab-close'; close.type = 'button'; close.setAttribute('aria-label', 'Закрыть вкладку Новая вкладка'); close.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>';
    close.addEventListener('click', () => { recentTabs.unshift({title: 'Новая вкладка', closedAt: new Date(), row, source: row.closest('.group')}); row.remove(); const count = group.querySelector('.count'); count.textContent = Math.max(0, Number(count.textContent) - 1); renderRecent(); const tabs = group.querySelector(':scope > .tabs'); const toggle = group.querySelector(':scope > .group-controls .group-toggle'); if (Number(count.textContent) === 0 && toggle.getAttribute('aria-expanded') === 'true') toggle.click(); else tabs.style.height = tabs.querySelector('.tabs-inner').scrollHeight + 'px'; });
    row.append(icon, label, close); const list = group.querySelector('.tabs-inner'); list.querySelector('.empty')?.remove(); list.append(row);
    group.querySelector('.count').textContent = Number(group.querySelector('.count').textContent) + 1;
    const tabs = group.querySelector('.tabs'); if (!tabs.classList.contains('is-closed')) tabs.style.height = tabs.querySelector('.tabs-inner').scrollHeight + 'px';
  });
});



const archiveBack = document.querySelector('.archive-back');
const archiveClear = document.querySelector('.archive-clear');
archiveBack.addEventListener('click', () => recentButton.click());
let clearTimer;
function cancelClear() { clearTimeout(clearTimer); archiveClear.classList.remove('holding'); }
archiveClear.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  archiveClear.setPointerCapture(event.pointerId);
  archiveClear.classList.add('holding');
  clearTimer = setTimeout(() => {
    recentTabs.length = 0;
    recentButton.setAttribute('aria-expanded', 'false');
    recentList.hidden = true; document.querySelector('.groups').hidden = false;
    document.querySelector('.bottom-bar').hidden = false; document.querySelector('.archive-bar').hidden = true;
    cancelClear(); renderRecent();
  }, 500);
});
archiveClear.addEventListener('pointerup', cancelClear);
archiveClear.addEventListener('pointercancel', cancelClear);
archiveClear.addEventListener('lostpointercapture', cancelClear);
document.querySelectorAll('.group > .group-controls .marker').forEach(marker => {
  const shapes = ['70% 30% 64% 36% / 35% 68% 32% 65%', '35% 65% 30% 70% / 68% 38% 62% 32%', '65% 35% 72% 28% / 30% 62% 38% 70%', '32% 68% 55% 45% / 65% 30% 70% 35%'];
  marker.style.clipPath = "none"; marker.style.borderRadius = shapes[Math.floor(Math.random() * shapes.length)];
  marker.style.rotate = `${Math.floor(Math.random() * 90)}deg`;
});







function animatePanelResize() {
  const panel = document.querySelector('.popup');
  const initial = panel.getBoundingClientRect().height;
  panel.style.height = initial + 'px';
  setTimeout(() => {
    panel.style.height = 'auto';
    const target = panel.getBoundingClientRect().height;
    panel.style.height = initial + 'px';
    requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.height = target + 'px'; }));
    setTimeout(() => { panel.style.height = ''; }, 260);
  }, 130);
}




const settingsView = document.querySelector('.settings-view');
const settingsBar = document.querySelector('.settings-bar');
function showSettings(show) {
  const panel = document.querySelector('.popup');
  const start = panel.getBoundingClientRect().height;
  panel.style.height = '';
  document.querySelectorAll('.group-toggle[aria-expanded="true"]').forEach(toggle => toggle.click());
  document.querySelector('.groups').hidden = show;
  document.querySelector('.bottom-bar').hidden = show;
  settingsView.hidden = !show; settingsBar.hidden = !show;
  const end = panel.getBoundingClientRect().height;
  panel.style.height = start + 'px';
  requestAnimationFrame(() => requestAnimationFrame(() => { panel.style.height = end + 'px'; }));
  setTimeout(() => { panel.style.height = ''; }, 270);
}
document.querySelector('.settings-button').addEventListener('click', () => showSettings(true));
const themeView = document.querySelector('.theme-view');
function switchThemeView(show) {
  const panel = document.querySelector('.popup'); const start = panel.getBoundingClientRect().height;
  settingsView.hidden = show; themeView.hidden = !show;
  panel.style.height = ''; const end = panel.getBoundingClientRect().height;
  panel.style.height = start + 'px'; requestAnimationFrame(() => requestAnimationFrame(() => panel.style.height = end + 'px'));
  setTimeout(() => panel.style.height = '', 270);
}
const layoutView = document.querySelector('.layout-view');
function switchLayoutView(show) { const panel = document.querySelector('.popup'); const start = panel.getBoundingClientRect().height; settingsView.hidden = show; layoutView.hidden = !show; panel.style.height = ''; const end = panel.getBoundingClientRect().height; panel.style.height = start + 'px'; requestAnimationFrame(() => requestAnimationFrame(() => panel.style.height = end + 'px')); setTimeout(() => panel.style.height = '', 270); }
document.querySelector('.layout-open').addEventListener('click', () => switchLayoutView(true));
document.querySelector('.theme-open').addEventListener('click', () => switchThemeView(true));
document.querySelector('.settings-back').addEventListener('click', () => { if (!layoutView.hidden) switchLayoutView(false); else if (!themeView.hidden) switchThemeView(false); else showSettings(false); });

const settingsKey = 'tavvy-mock-settings';
const animationInput = document.querySelector('input[aria-label="Анимации"]');
const themeInputs = [...themeView.querySelectorAll('input[name=theme]')];
const panelWidth = document.querySelector('#panel-width');
const panelHeight = document.querySelector('#panel-height');
const panelPosition = document.querySelector('#panel-position');
const systemTheme = matchMedia('(prefers-color-scheme: light)');
let savedSettings = { theme: 'Чёрная', animations: true };
try { const saved = JSON.parse(localStorage.getItem(settingsKey)); if (saved && typeof saved === 'object') savedSettings = { ...savedSettings, ...saved }; } catch (_) {}
function applySettings() {
  if (!['Чёрная', 'Тёмная', 'Светлая', 'Как в системе'].includes(savedSettings.theme)) savedSettings.theme = 'Чёрная';
  const light = savedSettings.theme === 'Светлая' || (savedSettings.theme === 'Как в системе' && systemTheme.matches);
  document.documentElement.classList.toggle('light-theme', light);
  document.documentElement.classList.toggle('dark-theme', savedSettings.theme === 'Тёмная');
  document.documentElement.classList.toggle('animations-off', !savedSettings.animations);
  animationInput.checked = Boolean(savedSettings.animations);
  panelWidth.value = Math.max(320, Math.min(600, Number(savedSettings.width) || 440));
  panelHeight.value = Math.max(200, Math.min(800, Number(savedSettings.height) || 300));
  panelPosition.value = ['left','center','right'].includes(savedSettings.position) ? savedSettings.position : 'right';
  document.documentElement.style.setProperty('--panel-width', panelWidth.value + 'px');
  document.documentElement.style.setProperty('--panel-height', panelHeight.value + 'px');
  document.documentElement.dataset.panelPosition = panelPosition.value;
  themeInputs.forEach(input => { input.checked = input.value === savedSettings.theme; });
  document.querySelector('.theme-current').textContent = savedSettings.theme;
}
function saveSettings() { try { localStorage.setItem(settingsKey, JSON.stringify(savedSettings)); } catch (_) {} }
animationInput.addEventListener('change', () => { savedSettings.animations = animationInput.checked; applySettings(); saveSettings(); });
themeInputs.forEach(input => input.addEventListener('change', () => { document.documentElement.classList.add('theme-changing'); savedSettings.theme = input.value; delete savedSettings.brightness; applySettings(); saveSettings(); setTimeout(() => document.documentElement.classList.remove('theme-changing'), 300); }));
[panelWidth, panelHeight, panelPosition].forEach(input => input.addEventListener('input', () => { savedSettings.width = Number(panelWidth.value); savedSettings.height = Number(panelHeight.value); savedSettings.position = panelPosition.value; applySettings(); saveSettings(); }));
systemTheme.addEventListener('change', applySettings);
applySettings();
const exportButton = document.querySelector('[aria-label="Экспортировать"]');
const importButton = document.querySelector('[aria-label="Импортировать"]');
exportButton.addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, settings: savedSettings }, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'tavvy-settings.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
const importInput = document.createElement('input'); importInput.type = 'file'; importInput.accept = '.json,application/json'; importInput.hidden = true; document.body.append(importInput);
importButton.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  try {
    const data = JSON.parse(await importInput.files[0].text());
    if (data.version !== 1 || !data.settings || !['Чёрная', 'Тёмная', 'Светлая', 'Как в системе'].includes(data.settings.theme) || typeof data.settings.animations !== 'boolean') throw new Error();
    savedSettings = { ...data.settings, theme: data.settings.theme, animations: data.settings.animations }; applySettings(); saveSettings();
  } catch (_) { alert('Не удалось загрузить настройки: файл имеет неверный формат.'); }
  importInput.value = '';
});
const sizeSliders = [panelWidth, panelHeight];
function updateSliderFill(slider) { slider.style.setProperty('--progress', `${(slider.value - slider.min) / (slider.max - slider.min) * 100}%`); }
sizeSliders.forEach(slider => { updateSliderFill(slider); slider.addEventListener('input', () => updateSliderFill(slider)); });
