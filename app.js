//  СОСТОЯНИЕ 
const state = {
    // Настройки
    totalCards: 28000,
    daysInMonth: 31,
    hoursPerDay: 8,
    timePerCard: 15,
    breakDuration: 10,
    lunchDuration: 60,

    // Текущий день
    currentDay: 1,
    cardsDoneToday: 0,
    cardsPerDayNorm: 0,
    remainingCards: 28000,

    // Таймер
    status: 'idle',
    secondsElapsed: 0,
    breakSecondsLeft: 0,
    currentScheduleIndex: 0,
    schedule: [],
    totalWorkSecondsToday: 0,
    targetWorkSecondsToday: 0,
    extraWorkSeconds: 0
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

function $(id) {
    return document.getElementById(id);
}

//  СТАРТ ПРИЛОЖЕНИЯ 
function startApp() {
    state.totalCards = +$('totalCards').value || 1;
    state.daysInMonth = +$('daysInMonth').value || 1;
    state.hoursPerDay = +$('hoursPerDay').value || 8;
    state.timePerCard = Math.max(15, +$('timePerCard').value || 15);
    state.breakDuration = +$('breakDuration').value || 10;
    state.lunchDuration = +$('lunchDuration').value || 0;

    state.remainingCards = state.totalCards;
    state.currentDay = 1;
    state.cardsDoneToday = 0;

    $('setupScreen').classList.add('hidden');
    $('workScreen').classList.remove('hidden');

    recalculateNorm();
    buildSchedule();
    renderSchedule();
    updateStats();
    resetTimer();
}

function resetApp() {
    clearInterval(tickInterval);
    state.status = 'idle';
    $('setupScreen').classList.remove('hidden');
    $('workScreen').classList.add('hidden');
}

//  ПЕРЕСЧЁТ НОРМЫ 
function recalculateNorm() {
    const daysLeft = state.daysInMonth - state.currentDay + 1;
    state.cardsPerDayNorm = Math.ceil(state.remainingCards / daysLeft);
    state.targetWorkSecondsToday = state.cardsPerDayNorm * state.timePerCard;

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
    state.secondsElapsed = 0;
    state.totalWorkSecondsToday = 0;
    $('timer').textContent = '00:00';
    $('timer').className = 'timer';
    $('statusText').textContent = 'Готов к работе';
    $('btnStart').classList.remove('hidden');
    $('btnPause').classList.add('hidden');
    $('btnSkip').classList.add('hidden');
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
        state.secondsElapsed++;
        state.totalWorkSecondsToday++;

        state.cardsDoneToday = Math.floor(state.totalWorkSecondsToday / state.timePerCard);

        const blockSeconds = getCurrentBlockSeconds();
        const secondsIntoBlock = state.secondsElapsed % blockSeconds;
        $('timer').textContent = formatDuration(secondsIntoBlock);

        updateStats();

        if (secondsIntoBlock >= blockSeconds - 1) {
            state.secondsElapsed = 0;
            goToNextBlock();
        }
    }, 1000);
}

function getCurrentBlockSeconds() {
    const item = state.schedule[state.currentScheduleIndex];
    if (!item) return 90 * 60;
    return item.duration * 60;
}

function goToNextBlock() {
    clearInterval(tickInterval);

    const next = state.schedule[state.currentScheduleIndex + 1];

    if (!next) {
        endDay();
        return;
    }

    state.currentScheduleIndex++;

    if (next.type === 'break' || next.type === 'lunch') {
        goToBreak(next);
    } else {
        startWork();
    }
}

function goToBreak(block) {
    state.status = block.type;
    state.breakSecondsLeft = block.duration * 60;

    $('statusText').textContent = block.type === 'break' ? '☕ Перерыв' : '🍽 Обед';
    $('timer').className = 'timer ' + block.type;
    $('btnSkip').classList.remove('hidden');
    $('btnPause').classList.add('hidden');

    clearInterval(tickInterval);
    tickInterval = setInterval(() => {
        state.breakSecondsLeft--;
        $('timer').textContent = formatDuration(state.breakSecondsLeft);

        if (state.breakSecondsLeft <= 0) {
            // Пользователь не пропустил перерыв — добавляем к работе
            state.extraWorkSeconds += block.duration * 60;
            state.targetWorkSecondsToday += block.duration * 60;
            goToNextBlock();
        }
    }, 1000);

    renderSchedule();
}

function skipBreak() {
    clearInterval(tickInterval);
    state.breakSecondsLeft = 0;
    goToNextBlock();
}

function pauseWork() {
    clearInterval(tickInterval);
    state.status = 'paused';
    $('statusText').textContent = '⏸ Пауза';
    $('btnStart').classList.remove('hidden');
    $('btnPause').classList.add('hidden');
}

//  ОБНОВЛЕНИЕ UI 
function updateStats() {
    $('statDone').textContent = state.cardsDoneToday;
    const left = Math.max(0, state.cardsPerDayNorm - state.cardsDoneToday);
    $('statLeft').textContent = left;
    $('statPerHour').textContent = Math.ceil(state.cardsPerDayNorm / state.hoursPerDay);

    const pct = Math.min(100, (state.cardsDoneToday / state.cardsPerDayNorm) * 100);
    $('progressFill').style.width = pct + '%';

    renderSchedule();
}

//  ЗАВЕРШЕНИЕ ДНЯ 
function endDay() {
    clearInterval(tickInterval);

    const done = state.cardsDoneToday;
    const norm = state.cardsPerDayNorm;

    if (done >= norm) {
        alert(`✅ День ${state.currentDay} выполнен!\nСделано: ${done} из ${norm}`);
    } else {
        const left = norm - done;
        alert(`⚠️ День ${state.currentDay} не выполнен.\nСделано: ${done} из ${norm}\nОстаток ${left} карточек переносится на следующий день.`);
    }

    state.remainingCards -= done;
    state.currentDay++;

    if (state.currentDay > state.daysInMonth || state.remainingCards <= 0) {
        alert('🎉 Месяц завершён! Все карточки выполнены.');
        resetApp();
        return;
    }

    state.cardsDoneToday = 0;
    state.extraWorkSeconds = 0;

    recalculateNorm();
    buildSchedule();
    renderSchedule();
    resetTimer();
    updateStats();
}

//  ЭКСПОРТ ФУНКЦИЙ В HTML 
window.startApp = startApp;
window.resetApp = resetApp;
window.startWork = startWork;
window.pauseWork = pauseWork;
window.skipBreak = skipBreak;
window.endDay = endDay;

// Автозапуск
window.addEventListener('load', () => {
    $('setupScreen').classList.remove('hidden');
    $('workScreen').classList.add('hidden');
});