const STORAGE_KEY = 'cards_planner_state_v4';

const state = {
    totalCards: 28000, daysInMonth: 31, hoursPerDay: 8, timePerCard: 15,
    breakDuration: 10, lunchDuration: 60, startTime: '09:00',
    baseNorm: 0, carryover: 0, cardsPerDayNorm: 0,
    currentDay: 1, cardsDoneToday: 0, totalCardsDone: 0, totalWorkSecondsToday: 0,
    cardsManualAdjustment: 0,
    status: 'idle', secondsIntoBlock: 0, breakSecondsLeft: 0, currentScheduleIndex: 0,
    schedule: [], history: [], appStarted: false, lastTickAt: null, timerMode: 'elapsed'
};

let tickInterval = null;

const $ = id => document.getElementById(id);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
function formatDuration(sec) { sec = Math.max(0, Math.floor(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` }
function formatTime(min) { return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}` }
function settings() { return { totalCards: +$('totalCards').value || 1, daysInMonth: +$('daysInMonth').value || 1, hoursPerDay: +$('hoursPerDay').value || 8, timePerCard: Math.max(15, +$('timePerCard').value || 15), breakDuration: Math.max(1, +$('breakDuration').value || 10), lunchDuration: Math.max(0, +$('lunchDuration').value || 0), startTime: $('startTime').value || '09:00' } }
function saveState() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) } catch (e) { } }
function loadState() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch (e) { return null } }
function clearState() { localStorage.removeItem(STORAGE_KEY) }
function match(a, b) { return Object.keys(b).every(k => a[k] === b[k]) }
function fillForm() { for (const k of ['totalCards', 'daysInMonth', 'hoursPerDay', 'timePerCard', 'breakDuration', 'lunchDuration', 'startTime']) $(k).value = state[k] }
function showWork() { $('setupScreen').classList.add('hidden'); $('workScreen').classList.remove('hidden') }
function showSetup() { $('workScreen').classList.add('hidden'); $('setupScreen').classList.remove('hidden') }

function recalc() {
    state.baseNorm = Math.ceil(state.totalCards / state.daysInMonth);
    state.cardsPerDayNorm = Math.max(0, state.baseNorm + state.carryover);
    $('dayNumber').textContent = state.currentDay; $('dayTotal').textContent = state.daysInMonth; $('statNorm').textContent = state.cardsPerDayNorm;
    const badge = $('carryBadge');
    if (state.carryover > 0) { badge.textContent = `↗ перенос +${state.carryover}`; badge.classList.remove('hidden') } else badge.classList.add('hidden');
}

function buildSchedule() {
    const schedule = [];
    const [startHour, startMinute] = String(state.startTime || '09:00').split(':').map(Number);
    let current = (Number.isFinite(startHour) ? startHour : 9) * 60 + (Number.isFinite(startMinute) ? startMinute : 0), worked = 0, lunch = false;
    while (worked < state.hoursPerDay * 60) {
        const len = Math.min(90, state.hoursPerDay * 60 - worked);
        schedule.push({ type: 'work', startMin: current, endMin: current + len, duration: len });
        worked += len; current += len;
        if (worked >= state.hoursPerDay * 60) break;
        if (!lunch && worked >= 240 && state.lunchDuration > 0) {
            lunch = true; schedule.push({ type: 'lunch', startMin: current, endMin: current + state.lunchDuration, duration: state.lunchDuration });
            current += state.lunchDuration;
        } else {
            schedule.push({ type: 'break', startMin: current, endMin: current + state.breakDuration, duration: state.breakDuration });
            current += state.breakDuration;
        }
    }
    state.schedule = schedule; state.currentScheduleIndex = clamp(state.currentScheduleIndex, 0, Math.max(0, schedule.length - 1));
}

function renderSchedule() {
    const list = $('scheduleList'); list.innerHTML = '';
    state.schedule.forEach((x, i) => {
        const el = document.createElement('div'); el.className = `schedule-item ${x.type}${i === state.currentScheduleIndex ? ' active' : ''}`;
        const icon = x.type === 'work' ? '💼' : x.type === 'break' ? '☕' : '🍽️';
        const label = x.type === 'work' ? 'Работа' : x.type === 'break' ? 'Перерыв' : 'Обед';
        el.innerHTML = `<span class="schedule-icon">${icon}</span><span><b>${label}</b><br><small>${x.duration} мин.</small></span><span class="schedule-time">${formatTime(x.startMin)} — ${formatTime(x.endMin)}</span>`;
        list.appendChild(el);
    });
    const workBlocks = state.schedule.filter(x => x.type === 'work').length;
    $('scheduleSummary').textContent = `${workBlocks} рабочих блоков`;
}

function currentBlock() { return state.schedule[state.currentScheduleIndex] }
function workSecondsToday() { return state.totalWorkSecondsToday }
function currentRequiredPerHour() {
    const remaining = Math.max(0, state.cardsPerDayNorm - state.cardsDoneToday);
    const remainingSec = Math.max(1, state.hoursPerDay * 3600 - workSecondsToday());
    return Math.ceil(remaining / (remainingSec / 3600));
}
function setCardsDoneToday(value) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    const timerCards = Math.floor(state.totalWorkSecondsToday / state.timePerCard);
    state.cardsManualAdjustment = n - timerCards;
    state.cardsDoneToday = n;
    renderManualCardsControl();
    updateStats();
}

function renderManualCardsControl() {
    const el = $('manualCardsDone');
    if (el && document.activeElement !== el) el.value = state.cardsDoneToday;
}

function updateStats() {
    const done = state.cardsDoneToday, norm = state.cardsPerDayNorm, left = Math.max(0, norm - done);
    const pct = norm ? clamp(done / norm * 100, 0, 100) : 0;
    $('statDone').textContent = done; $('statLeft').textContent = left; $('dayPercent').textContent = pct.toFixed(1) + '%';
    $('progressFill').style.width = pct + '%';
    const hours = workSecondsToday() / 3600;
    const speed = hours > 0 ? Math.floor(done / hours) : 0;
    $('statPerHour').textContent = speed + ' /ч'; $('requiredPerHour').textContent = currentRequiredPerHour() + ' /ч';
    const plannedEnd = state.schedule.length ? state.schedule[state.schedule.length - 1].endMin : null;
    $('finishForecast').textContent = done >= norm ? '✓ Готово' : plannedEnd === null ? '—' : formatTime(plannedEnd);
    const monthLeft = Math.max(0, state.totalCards - state.totalCardsDone - state.cardsDoneToday);
    const monthPct = state.totalCards ? clamp((state.totalCardsDone + state.cardsDoneToday) / state.totalCards * 100, 0, 100) : 0;
    $('monthDone').textContent = state.totalCardsDone + state.cardsDoneToday; $('monthTotal').textContent = state.totalCards;
    $('monthProgressFill').style.width = monthPct + '%'; $('monthDetails').textContent = `Осталось ${monthLeft.toLocaleString('ru-RU')} · ${monthPct.toFixed(1)}%`;
    const balance = (state.cardsDoneToday - state.cardsPerDayNorm);
    $('balanceText').textContent = balance >= 0 ? `+${balance} карточек` : `${balance} карточек`;
    $('balanceText').className = 'balance-value ' + (balance >= 0 ? 'good' : 'warn');
    $('balanceSubtext').textContent = balance >= 0 ? 'Запас относительно нормы' : 'Нужно добрать до нормы';
    renderHistory(); saveState();
}
function renderHistory() {
    const list = $('historyList'); list.innerHTML = '';
    const rows = state.history.slice(-7).reverse();
    if (!rows.length) { list.innerHTML = '<div class="muted">История появится после завершения первого дня.</div>'; return }
    rows.forEach(x => {
        const pct = x.norm ? clamp(x.done / x.norm * 100, 0, 100) : 0;
        const row = document.createElement('div'); row.className = 'history-row';
        row.innerHTML = `<b>День ${x.day}</b><div class="history-bar"><span style="width:${pct}%"></span></div><span>${x.done} / ${x.norm}</span><span class="history-deficit">${x.done >= x.norm ? '✓' : `−${x.norm - x.done}`}</span>`;
        list.appendChild(row);
    });
}

function injectManualCardsControl() {
    const target = $('statDone')?.parentElement;
    if (!target || $('manualCardsDone')) return;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap;';
    wrap.innerHTML = `<label for="manualCardsDone" class="muted" style="font-size:12px">Фактически сделано:</label><input id="manualCardsDone" type="number" min="0" step="1" style="width:110px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit"><button type="button" class="btn secondary" style="min-height:36px;padding:7px 11px;font-size:12px" onclick="applyCardsDone()">Исправить</button>`;
    target.appendChild(wrap);
    renderManualCardsControl();
}

function applyCardsDone() {
    const el = $('manualCardsDone');
    if (!el) return;
    setCardsDoneToday(el.value);
    saveState();
}

function startApp() {
    const s = settings(), saved = loadState();
    if (saved?.appStarted && match(saved, s)) { Object.assign(state, saved) }
    else {
        Object.assign(state, s, { baseNorm: Math.ceil(s.totalCards / s.daysInMonth), carryover: 0, cardsPerDayNorm: Math.ceil(s.totalCards / s.daysInMonth), currentDay: 1, cardsDoneToday: 0, totalCardsDone: 0, totalWorkSecondsToday: 0, cardsManualAdjustment: 0, status: 'idle', secondsIntoBlock: 0, breakSecondsLeft: 0, currentScheduleIndex: 0, schedule: [], history: [], appStarted: true, lastTickAt: null });
    }
    fillForm(); recalc(); buildSchedule(); renderSchedule(); showWork(); injectManualCardsControl(); updateStats(); restoreTimer(); saveState();
}
function setStartTimeNow() {
    const d = new Date();
    $('startTime').value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function resetProgress() {
    if (!confirm('Сбросить весь прогресс?')) return;
    clearInterval(tickInterval); clearState(); Object.assign(state, { ...state, ...settings(), baseNorm: 0, carryover: 0, cardsPerDayNorm: 0, currentDay: 1, cardsDoneToday: 0, totalCardsDone: 0, totalWorkSecondsToday: 0, cardsManualAdjustment: 0, status: 'idle', secondsIntoBlock: 0, breakSecondsLeft: 0, currentScheduleIndex: 0, schedule: [], history: [], appStarted: false, lastTickAt: null });
    showSetup(); alert('Прогресс сброшен.');
}
function backToSettings() { clearInterval(tickInterval); if (['working', 'break', 'lunch'].includes(state.status)) state.status = 'paused'; saveState(); fillForm(); showSetup() }

function renderTimer() {
    const block = currentBlock(); if (!block) return;
    let value = state.status === 'working' ? state.secondsIntoBlock : state.status === 'break' || state.status === 'lunch' ? state.breakSecondsLeft : state.secondsIntoBlock;
    if (state.timerMode === 'remaining' && state.status === 'working') value = block.duration * 60 - state.secondsIntoBlock;
    $('timer').textContent = formatDuration(value); $('timer').className = 'timer ' + (state.status === 'break' ? 'break' : state.status === 'lunch' ? 'lunch' : '');
    $('blockInfo').textContent = `${block.type === 'work' ? 'Рабочий блок' : block.type === 'break' ? 'Перерыв' : 'Обед'} · ${formatTime(block.startMin)} — ${formatTime(block.endMin)}`;
    $('modeElapsed').classList.toggle('active', state.timerMode === 'elapsed'); $('modeRemaining').classList.toggle('active', state.timerMode === 'remaining');
}
function setTimerMode(mode) { state.timerMode = mode; renderTimer(); saveState() }
function updateButtons() {
    $('btnStart').classList.toggle('hidden', state.status === 'working' || state.status === 'break' || state.status === 'lunch');
    $('btnPause').classList.toggle('hidden', state.status !== 'working');
    $('btnSkip').classList.toggle('hidden', !(state.status === 'break' || state.status === 'lunch'));
}
function tick() {
    const now = Date.now(), elapsed = Math.max(1, Math.floor((now - (state.lastTickAt || now)) / 1000));
    state.lastTickAt = now;
    if (state.status === 'working') {
        state.secondsIntoBlock += elapsed; state.totalWorkSecondsToday += elapsed;
        state.cardsDoneToday = Math.max(0, Math.floor(state.totalWorkSecondsToday / state.timePerCard) + (state.cardsManualAdjustment || 0));
        if (state.secondsIntoBlock >= currentBlock().duration * 60) { state.secondsIntoBlock = 0; goNextBlock(); return }
    } else if (state.status === 'break' || state.status === 'lunch') {
        state.breakSecondsLeft -= elapsed; if (state.breakSecondsLeft <= 0) { state.breakSecondsLeft = 0; goNextBlock(); return }
    }
    renderTimer(); updateStats();
}
function startWork() {
    if (!currentBlock() || currentBlock().type !== 'work') return;
    state.status = 'working'; state.lastTickAt = Date.now(); $('statusText').textContent = '💼 Работаем'; updateButtons(); clearInterval(tickInterval); tickInterval = setInterval(tick, 1000); renderTimer(); saveState();
}
function pauseWork() { clearInterval(tickInterval); if (state.status === 'working') { tick(); state.status = 'paused'; state.lastTickAt = null; $('statusText').textContent = '⏸ Пауза'; updateButtons(); saveState() } }
function goNextBlock() {
    clearInterval(tickInterval); state.currentScheduleIndex++;
    if (!state.schedule[state.currentScheduleIndex]) { endDay(); return }
    state.secondsIntoBlock = 0; const b = currentBlock();
    if (b.type === 'work') { state.status = 'idle'; $('statusText').textContent = 'Готов к работе'; updateButtons(); renderSchedule(); saveState() }
    else { state.status = b.type; state.breakSecondsLeft = b.duration * 60; state.lastTickAt = Date.now(); $('statusText').textContent = b.type === 'break' ? '☕ Перерыв' : '🍽 Обед'; updateButtons(); renderTimer(); renderSchedule(); tickInterval = setInterval(tick, 1000); saveState() }
}
function skipBreak() { if (!['break', 'lunch'].includes(state.status)) return; clearInterval(tickInterval); state.breakSecondsLeft = 0; goNextBlock() }
function restoreTimer() {
    clearInterval(tickInterval);
    if (state.status === 'working' || state.status === 'break' || state.status === 'lunch') {
        if (state.lastTickAt) {
            const elapsed = Math.floor((Date.now() - state.lastTickAt) / 1000);
            if (elapsed > 0) {
                if (state.status === 'working') { state.secondsIntoBlock += elapsed; state.totalWorkSecondsToday += elapsed; state.cardsDoneToday = Math.floor(state.totalWorkSecondsToday / state.timePerCard) }
                else state.breakSecondsLeft -= elapsed;
            }
        }
        state.lastTickAt = Date.now();
        if (state.status === 'working' && state.secondsIntoBlock >= currentBlock().duration * 60) { state.secondsIntoBlock = 0; goNextBlock(); return }
        if ((state.status === 'break' || state.status === 'lunch') && state.breakSecondsLeft <= 0) { goNextBlock(); return }
        tickInterval = setInterval(tick, 1000);
    }
    $('statusText').textContent = state.status === 'paused' ? '⏸ Пауза' : state.status === 'working' ? '💼 Работаем' : state.status === 'break' ? '☕ Перерыв' : state.status === 'lunch' ? '🍽 Обед' : 'Готов к работе';
    updateButtons(); renderTimer();
}
function endDay() {
    clearInterval(tickInterval);
    if (state.status === 'working') tick();
    const done = state.cardsDoneToday, norm = state.cardsPerDayNorm, deficit = Math.max(0, norm - done);
    state.history.push({ day: state.currentDay, done, norm });
    state.totalCardsDone += done;
    if (state.currentDay >= state.daysInMonth || state.totalCardsDone >= state.totalCards) {
        alert(`🎉 Месяц завершён!\nВсего сделано: ${state.totalCardsDone} из ${state.totalCards}`);
        clearState(); state.appStarted = false; showSetup(); return;
    }
    state.currentDay++; state.carryover = deficit; state.cardsPerDayNorm = state.baseNorm + deficit;
    state.cardsDoneToday = 0; state.totalWorkSecondsToday = 0; state.cardsManualAdjustment = 0; state.secondsIntoBlock = 0; state.currentScheduleIndex = 0; state.status = 'idle'; state.schedule = []; state.lastTickAt = null;
    recalc(); buildSchedule(); renderSchedule(); renderTimer(); updateButtons(); updateStats(); saveState();
}
function toggleTheme() {
    const root = document.documentElement, next = root.dataset.theme === 'dark' ? 'light' : 'dark'; root.dataset.theme = next; localStorage.setItem('cards_theme', next);
}
function loadTheme() { document.documentElement.dataset.theme = localStorage.getItem('cards_theme') || 'light' }

document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); if (state.status === 'working') pauseWork(); else if (state.status === 'idle' || state.status === 'paused') startWork() }
    if (e.key.toLowerCase() === 's') skipBreak();
    if (e.key.toLowerCase() === 'e') endDay();
});
window.addEventListener('beforeunload', () => { if (state.status === 'working' || state.status === 'break' || state.status === 'lunch') { tick(); } saveState() });
window.addEventListener('load', () => {
    loadTheme();
    const saved = loadState();
    if (saved?.appStarted) {
        Object.assign(state, saved);
        if (!state.startTime) state.startTime = '09:00';
        if (!Number.isFinite(state.cardsManualAdjustment)) state.cardsManualAdjustment = 0;
        fillForm(); recalc();
        if (!state.schedule?.length) buildSchedule();
        renderSchedule(); showWork(); injectManualCardsControl(); restoreTimer(); updateStats();
    } else showSetup();
});
window.startApp = startApp; window.resetProgress = resetProgress; window.backToSettings = backToSettings;
window.applyCardsDone = applyCardsDone; window.startWork = startWork; window.pauseWork = pauseWork; window.skipBreak = skipBreak; window.endDay = endDay;
window.toggleTheme = toggleTheme; window.setTimerMode = setTimerMode; window.setStartTimeNow = setStartTimeNow;
