//  КЛЮЧ ХРАНИЛИЩА 
// v3 — новая логика, старый стейт не помешает
const STORAGE_KEY = 'cards_planner_state_v3';

//  СОСТОЯНИЕ 
const state = {
    // Настройки
    totalCards: 28000,
    daysInMonth: 31,
    hoursPerDay: 8,
    timePerCard: 15,
    breakDuration: 10,
    lunchDuration: 60,

    // План
    baseNorm: 0,          // фиксированная дневная норма = totalCards / daysInMonth
    carryover: 0,         // дефицит, перенесённый с прошлого дня
    cardsPerDayNorm: 0,   // baseNorm + carryover

    // Прогресс
    currentDay: 1,
    cardsDoneToday: 0,
    totalCardsDone: 0,    // всего сделано за месяц

    // Таймер
    status: 'idle',
    secondsIntoBlock: 0,
    totalWorkSecondsToday: 0,
    breakSecondsLeft: 0,
    currentScheduleIndex: 0,
    schedule: [],

    appStarted: false
};

let tickInterval = null;

//  УТИЛИТЫ 
function formatTime(totalMinutes) {
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function $(id) { return document.getElementById(id); }

//  СОХРАНЕНИЕ / ЗАГРУЗКА 
function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Не удалось сохранить:', e);
    }
}

function loadRawState() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function clearState() {
    localStorage.removeItem(STORAGE_KEY);
}

//  ФОРМА 
function readSettingsFromForm() {
    return {
        totalCards: +$('totalCards').value || 1,
        daysInMonth: +$('daysInMonth').value || 1,
        hoursPerDay: +$('hoursPerDay').value || 8,
        timePerCard: Math.max(15, +$('timePerCard').value || 15),
        breakDuration: +$('breakDuration').value || 10,
        lunchDuration: +$('lunchDuration').value || 0
    };
}

function fillFormFromState() {
    $('totalCards').value = state.totalCards;
    $('daysInMonth').value = state.daysInMonth;
    $('hoursPerDay').value = state.hoursPerDay;
    $('timePerCard').value = state.timePerCard;
    $('breakDuration').value = state.breakDuration;
    $('lunchDuration').value = state.lunchDuration;
}

function settingsMatch(a, b) {
    return a.totalCards === b.totalCards &&
        a.daysInMonth === b.daysInMonth &&
        a.hoursPerDay === b.hoursPerDay &&
        a.timePerCard === b.timePerCard &&
        a.breakDuration === b.breakDuration &&
        a.lunchDuration === b.lunchDuration;
}

//  ЭКРАНЫ 
function showWorkScreen() {
    $('setupScreen').classList.add('hidden');
    $('workScreen').classList.remove('hidden');
}

function showSetupScreen() {
    $('setupScreen').classList.remove('hidden');
    $('workScreen').classList.add('hidden');
}

//  СТАРТ / НАЗАД / СБРОС 
function startApp() {
    const settings = readSettingsFromForm();
    const saved = loadRawState();

    // Если есть сохранённая сессия с теми же настройками — восстанавливаем
    if (saved && saved.appStarted && settingsMatch(saved, settings)) {
        Object.assign(state, saved);

        // На всякий случай пересчитываем (на случай, если формат изменился)
        if (!state.baseNorm) {
            state.baseNorm = Math.ceil(state.totalCards / state.daysInMonth);
        }
        state.cardsPerDayNorm = state.baseNorm + state.carryover;

        showWorkScreen();
        recalculateNorm();
        if (!state.schedule || state.schedule.length === 0) {
            buildSchedule();
        }
        renderSchedule();
        updateStats();
        resetTimer();
        return;
    }

    // Иначе — новая сессия
    Object.assign(state, settings);
    state.baseNorm = Math.ceil(state.totalCards / state.daysInMonth);
    state.carryover = 0;
    state.cardsPerDayNorm = state.baseNorm;
    state.currentDay = 1;
    state.cardsDoneToday = 0;
    state.totalCardsDone = 0;
    state.status = 'idle';
    state.secondsIntoBlock = 0;
    state.totalWorkSecondsToday = 0;
    state.breakSecondsLeft = 0;
    state.currentScheduleIndex = 0;
    state.schedule = [];
    state.appStarted = true;

    recalculateNorm();
    buildSchedule();
    renderSchedule();
    updateStats();
    resetTimer();
    saveState();
    showWorkScreen();
}

// Возврат к настройкам БЕЗ потери прогресса
function backToSettings() {
    clearInterval(tickInterval);
    if (state.status === 'working' || state.status === 'break' || state.status === 'lunch') {
        state.status = 'paused';
    }
    saveState();
    fillFormFromState();
    showSetupScreen();
}

// Полный сброс прогресса (кнопка в настройках)
function resetProgress() {
    if (!confirm('Сбросить весь прогресс? Настройки останутся, но прогресс обнулится.')) return;
    clearInterval(tickInterval);

    const settings = readSettingsFromForm();
    Object.assign(state, settings);
    state.baseNorm = Math.ceil(state.totalCards / state.daysInMonth);
    state.carryover = 0;
    state.cardsPerDayNorm = state.baseNorm;
    state.currentDay = 1;
    state.cardsDoneToday = 0;
    state.totalCardsDone = 0;
    state.status = 'idle';
    state.secondsIntoBlock = 0;
    state.totalWorkSecondsToday = 0;
    state.breakSecondsLeft = 0;
    state.currentScheduleIndex = 0;
    state.schedule = [];
    state.appStarted = false;

    clearState();
    alert('Прогресс сброшен.');
}

//  НОРМА 
function recalculateNorm() {
    state.baseNorm = Math.ceil(state.totalCards / state.daysInMonth);
    state.cardsPerDayNorm = state.baseNorm + state.carryover;

    $('dayNumber').textContent = state.currentDay;
    $('dayTotal').textContent = state.daysInMonth;
    $('statNorm').textContent = state.cardsPerDayNorm;
}

//  ГРАФИК ДНЯ 
function buildSchedule() {
    const schedule = [];
    const totalWorkMinutes = state.hoursPerDay * 60;
    let currentMinute = 9 * 60;
    let workedMinutes = 0;
    let lunchUsed = false;

    const workBlock = 90;
    const shortBreak = state.breakDuration;

    while (workedMinutes < totalWorkMinutes) {
        const blockLength = Math.min(workBlock, totalWorkMinutes - workedMinutes);
        schedule.push({
            type: 'work',
            startMin: currentMinute,
            endMin: currentMinute + blockLength,
            duration: blockLength
        });
        workedMinutes += blockLength;
        currentMinute += blockLength;

        if (workedMinutes >= totalWorkMinutes) break;

        if (!lunchUsed && workedMinutes >= 4 * 60 && state.lunchDuration > 0) {
            lunchUsed = true;
            schedule.push({
                type: 'lunch',
                startMin: currentMinute,
                endMin: currentMinute + state.lunchDuration,
                duration: state.lunchDuration
            });
            currentMinute += state.lunchDuration;
        } else {
            schedule.push({
                type: 'break',
                startMin: currentMinute,
                endMin: currentMinute + shortBreak,
                duration: shortBreak
            });
            currentMinute += shortBreak;
        }
    }

    state.schedule = schedule;
    state.currentScheduleIndex = 0;
}

function renderSchedule() {
    const list = $('scheduleList');
    list.innerHTML = '';

    state.schedule.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'schedule-item ' + item.type;
        if (i === state.currentScheduleIndex) div.classList.add('active');

        let label = '💼 Работа';
        if (item.type === 'break') label = '☕ Перерыв';
        if (item.type === 'lunch') label = '🍽 Обед';

        div.innerHTML = `
      <span>${label}</span>
      <span>${formatTime(item.startMin)} — ${formatTime(item.endMin)}</span>
    `;
        list.appendChild(div);
    });
}

//  ТАЙМЕР 
function resetTimer() {
    clearInterval(tickInterval);

    $('timer').textContent = formatDuration(state.secondsIntoBlock || 0);
    $('timer').className = 'timer';
    $('statusText').textContent = state.totalWorkSecondsToday > 0
        ? 'Продолжить работу'
        : 'Готов к работе';

    $('btnStart').classList.remove('hidden');
    $('btnPause').classList.add('hidden');
    $('btnSkip').classList.add('hidden');
}

function getCurrentBlockSeconds() {
    const item = state.schedule[state.currentScheduleIndex];
    if (!item) return 90 * 60;
    return item.duration * 60;
}

function startWork() {
    state.status = 'working';
    $('statusText').textContent = '💼 Работаем';
    $('timer').className = 'timer';
    $('btnStart').classList.add('hidden');
    $('btnPause').classList.remove('hidden');
    $('btnSkip').classList.add('hidden');

    clearInterval(tickInterval);
    tickInterval = setInterval(() => {
        state.secondsIntoBlock++;
        state.totalWorkSecondsToday++;

        state.cardsDoneToday = Math.floor(state.totalWorkSecondsToday / state.timePerCard);

        $('timer').textContent = formatDuration(state.secondsIntoBlock);
        updateStats();

        if (state.secondsIntoBlock >= getCurrentBlockSeconds()) {
            state.secondsIntoBlock = 0;
            goToNextBlock();
        }
    }, 1000);

    saveState();
}

function goToNextBlock() {
    clearInterval(tickInterval);

    const next = state.schedule[state.currentScheduleIndex + 1];

    if (!next) {
        endDay();
        return;
    }

    state.currentScheduleIndex++;
    state.secondsIntoBlock = 0;

    if (next.type === 'break' || next.type === 'lunch') {
        goToBreak(next);
    } else {
        startWork();
    }

    saveState();
}

function goToBreak(block) {
    state.status = block.type;
    state.breakSecondsLeft = block.duration * 60;

    $('statusText').textContent = block.type === 'break' ? '☕ Перерыв' : '🍽 Обед';
    $('timer').className = 'timer ' + block.type;
    $('timer').textContent = formatDuration(state.breakSecondsLeft);
    $('btnSkip').classList.remove('hidden');
    $('btnPause').classList.add('hidden');
    $('btnStart').classList.add('hidden');

    clearInterval(tickInterval);
    tickInterval = setInterval(() => {
        state.breakSecondsLeft--;
        $('timer').textContent = formatDuration(state.breakSecondsLeft);

        if (state.breakSecondsLeft <= 0) {
            goToNextBlock();
        }
    }, 1000);

    renderSchedule();
    saveState();
}

function skipBreak() {
    clearInterval(tickInterval);
    state.breakSecondsLeft = 0;
    goToNextBlock();
    saveState();
}

function pauseWork() {
    clearInterval(tickInterval);
    state.status = 'paused';
    $('statusText').textContent = '⏸ Пауза';
    $('btnStart').classList.remove('hidden');
    $('btnPause').classList.add('hidden');
    saveState();
}

//  СТАТИСТИКА 
function updateStats() {
    $('statDone').textContent = state.cardsDoneToday;

    const left = Math.max(0, state.cardsPerDayNorm - state.cardsDoneToday);
    $('statLeft').textContent = left;

    $('statPerHour').textContent = Math.ceil(state.cardsPerDayNorm / state.hoursPerDay);

    const pct = state.cardsPerDayNorm > 0
        ? Math.min(100, (state.cardsDoneToday / state.cardsPerDayNorm) * 100)
        : 0;
    $('progressFill').style.width = pct + '%';

    renderSchedule();
    saveState();
}

//  ЗАВЕРШЕНИЕ ДНЯ 
function endDay() {
    clearInterval(tickInterval);

    const done = state.cardsDoneToday;
    const norm = state.cardsPerDayNorm;

    if (done >= norm) {
        alert(`✅ День ${state.currentDay} выполнен!\nСделано: ${done} из ${norm}`);
    } else {
        const deficit = norm - done;
        alert(`⚠️ День ${state.currentDay} не выполнен.\nСделано: ${done} из ${norm}\nДефицит ${deficit} перенесён на следующий день.`);
    }

    // Обновляем общий прогресс
    state.totalCardsDone += done;

    // Проверка окончания месяца
    if (state.currentDay >= state.daysInMonth || state.totalCardsDone >= state.totalCards) {
        alert(`🎉 Месяц завершён!\nВсего сделано: ${state.totalCardsDone} из ${state.totalCards}`);
        clearState();
        state.appStarted = false;
        showSetupScreen();
        return;
    }

    // Дефицит = что не успел сделать
    const deficit = Math.max(0, norm - done);

    // Переходим на следующий день
    state.currentDay++;
    state.carryover = deficit;
    state.cardsPerDayNorm = state.baseNorm + state.carryover;

    // Сбрасываем дневные счётчики
    state.cardsDoneToday = 0;
    state.totalWorkSecondsToday = 0;
    state.secondsIntoBlock = 0;
    state.currentScheduleIndex = 0;
    state.status = 'idle';
    state.schedule = []; // перегенерируем график

    recalculateNorm();
    buildSchedule();
    renderSchedule();
    resetTimer();
    updateStats();
    saveState();
}

//  ЭКСПОРТ В HTML 
window.startApp = startApp;
window.backToSettings = backToSettings;
window.resetProgress = resetProgress;
window.startWork = startWork;
window.pauseWork = pauseWork;
window.skipBreak = skipBreak;
window.endDay = endDay;

//  ВОССТАНОВЛЕНИЕ ПРИ ЗАГРУЗКЕ 
window.addEventListener('load', () => {
    const saved = loadRawState();

    if (saved && saved.appStarted) {
        Object.assign(state, saved);

        // Миграция со старых версий
        if (!state.baseNorm) {
            state.baseNorm = Math.ceil(state.totalCards / state.daysInMonth);
        }
        if (state.carryover === undefined) state.carryover = 0;
        if (state.totalCardsDone === undefined) state.totalCardsDone = 0;
        state.cardsPerDayNorm = state.baseNorm + state.carryover;

        fillFormFromState();
        showWorkScreen();
        recalculateNorm(); // <-- фикс: обновляем номер дня и норму в UI
        if (!state.schedule || state.schedule.length === 0) {
            buildSchedule();
        }
        renderSchedule();
        updateStats();
        resetTimer();
    } else {
        showSetupScreen();
    }
});