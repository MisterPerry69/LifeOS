// ============================================
// LIFT — script.js
// ============================================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxDmRkeFLKSTTRlkPhOhTaPDR8zKxZ9hqqu9hRUbusustTTFjZXOiPHD3XZz1ClqVzh/exec";

// ============================================
// STATE
// ============================================
let appData = {
  workouts: [],       // template dal GAS
  exercises: [],      // libreria esercizi dal GAS
  history: []         // sessioni passate dal GAS
};

let session = {
  workoutId: null,
  workoutName: "",
  exercises: [],      // copia del template, modificabile
  currentExIdx: 0,    // indice esercizio corrente
  currentSerIdx: 0,   // indice serie corrente
  completedSeries: [], // { exName, weight, reps, unit }
  startTime: null,
  timerInterval: null,
  restTimeout: null,
  restInterval: null,
  restTotal: 0,
  restRemaining: 0
};

let weightModalValue = 0;
let weightModalSign = 1; // +1 o -1
let repsModalValue = 0;
let selectedMood = null;
let selectedEnergy = null;
let editingWorkoutId = null;

// ============================================
// INIT
// ============================================
window.onload = async () => {
  showPage('page-home');
  await loadAppData();
};

async function loadAppData() {
  try {
    const res = await fetch(`${SCRIPT_URL}?action=get_lift_data&t=${Date.now()}`);
    const data = await res.json();
    if (data.status === "OK") {
      appData = data;
      renderHome();
      renderConfigList();
      renderExerciseLibrary();
      renderHistoryList();
    }
  } catch(e) {
    console.error("LIFT_LOAD_ERR:", e);
    renderHome();
  }
}

// ============================================
// NAVIGATION
// ============================================
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

// ============================================
// HOME
// ============================================
function renderHome() {
  renderWeekBar();
  renderWorkoutList();
}

function renderWeekBar() {
  const history = appData.history || [];
  const now = new Date();
  const days = document.querySelectorAll('.week-fill');
  const labels = ['L','M','M','G','V','S','D'];

  // Lunedi di questa settimana
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0,0,0,0);

  days.forEach((fill, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    const dayStr = day.toISOString().split('T')[0];
    const trained = history.some(s => s.date === dayStr);
    fill.classList.toggle('trained', trained);
  });

  // Streak
  const streakEl = document.getElementById('streak-label');
  if (streakEl) {
    const streak = calculateStreak(history);
    streakEl.textContent = `🔥 ${streak} settiman${streak === 1 ? 'a' : 'e'} consecutive`;
  }
}

function calculateStreak(history) {
  if (!history || history.length === 0) return 0;
  const dates = [...new Set(history.map(s => s.date))].sort().reverse();
  let streak = 0;
  const now = new Date();
  now.setHours(0,0,0,0);

  for (let w = 0; w < 52; w++) {
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7) - w * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStr = (d) => d.toISOString().split('T')[0];
    const hasSession = dates.some(d => d >= weekStr(weekStart) && d <= weekStr(weekEnd));
    if (hasSession) streak++;
    else if (w > 0) break;
  }
  return streak;
}

function renderWorkoutList() {
  const container = document.getElementById('workout-list');
  const workouts = appData.workouts || [];
  if (workouts.length === 0) {
    container.innerHTML = '<div class="empty-state">Nessun workout — vai su Config per crearne uno</div>';
    return;
  }

  // Suggerisci il workout più adatto (quello fatto meno di recente)
  const history = appData.history || [];
  const lastDone = {};
  history.forEach(s => {
    if (!lastDone[s.workoutId] || s.date > lastDone[s.workoutId]) {
      lastDone[s.workoutId] = s.date;
    }
  });

  const sorted = [...workouts].sort((a, b) => {
    const dA = lastDone[a.id] || '0';
    const dB = lastDone[b.id] || '0';
    return dA.localeCompare(dB);
  });

  container.innerHTML = sorted.map((w, i) => {
    const last = lastDone[w.id];
    const lastStr = last ? `${daysSince(last)}g fa` : 'mai';
    const exCount = (w.exercises || []).length;
    const isSuggested = i === 0;
    return `
      <div class="workout-card ${isSuggested ? 'suggested' : ''}" onclick="startWorkout('${w.id}')">
        <div>
          <div class="workout-card-name">${w.name}</div>
          <div class="workout-card-meta">${exCount} esercizi${w.estimatedDuration ? ' · ~' + w.estimatedDuration + ' min' : ''}</div>
        </div>
        <div class="workout-card-tag">${isSuggested ? 'oggi →' : lastStr}</div>
      </div>`;
  }).join('');
}

function daysSince(dateStr) {
  const d = new Date(dateStr);
  const now = new Date();
  now.setHours(0,0,0,0); d.setHours(0,0,0,0);
  return Math.round((now - d) / 86400000);
}

// ============================================
// START WORKOUT
// ============================================
function startWorkout(workoutId) {
  const workout = appData.workouts.find(w => w.id === workoutId);
  if (!workout || !workout.exercises || workout.exercises.length === 0) {
    alert('Workout senza esercizi — configuralo prima');
    return;
  }

  // Deep copy degli esercizi per non modificare il template
  session = {
    workoutId,
    workoutName: workout.name,
    exercises: JSON.parse(JSON.stringify(workout.exercises)),
    currentExIdx: 0,
    currentSerIdx: 0,
    completedSeries: [],
    startTime: Date.now(),
    timerInterval: null,
    restTimeout: null,
    restInterval: null,
    restTotal: 0,
    restRemaining: 0
  };

  startSessionTimer();
  renderWorkoutExercise();
  showPage('page-workout');
}

function startSessionTimer() {
  const timerEl = document.getElementById('workout-timer');
  session.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
    const m = Math.floor(elapsed / 60).toString().padStart(2,'0');
    const s = (elapsed % 60).toString().padStart(2,'0');
    timerEl.textContent = `${m}:${s}`;
  }, 1000);
}

// ============================================
// WORKOUT EXERCISE RENDER
// ============================================
function renderWorkoutExercise() {
  const ex = currentExercise();
  const ser = currentSeries();
  if (!ex || !ser) return;

  const exCount = session.exercises.length;
  const serCount = ex.series.length;

  document.getElementById('exercise-counter').textContent =
    `ESERCIZIO ${session.currentExIdx + 1} / ${exCount}`;
  document.getElementById('exercise-name').textContent = ex.name;

  // Nota precedente
  const noteEl = document.getElementById('exercise-note');
  if (ex.note && ex.note.trim()) {
    noteEl.textContent = ex.note;
    noteEl.style.display = 'block';
  } else {
    noteEl.style.display = 'none';
  }

  document.getElementById('series-counter').textContent =
    `SERIE ${session.currentSerIdx + 1} / ${serCount}`;

  // Peso e reps dalla serie template
  document.getElementById('current-weight').textContent =
    ser.weight !== undefined ? ser.weight : '—';
  document.getElementById('weight-unit').textContent =
    ser.unit || 'kg';
  document.getElementById('current-reps').textContent =
    ser.reps !== undefined ? ser.reps : '—';
  document.getElementById('reps-unit').textContent =
    ser.repsUnit || 'reps';
  document.getElementById('rest-display').textContent =
    formatTime(ser.rest || 120);

  // Salta: solo se prima serie e esercizio non ancora iniziato
  const skipBtn = document.getElementById('btn-skip');
  const isFirstSeries = session.currentSerIdx === 0;
  const alreadyStarted = session.completedSeries.some(s => s.exIdx === session.currentExIdx);
  skipBtn.style.display = (isFirstSeries && !alreadyStarted) ? 'block' : 'none';
}

function currentExercise() {
  return session.exercises[session.currentExIdx] || null;
}

function currentSeries() {
  const ex = currentExercise();
  if (!ex) return null;
  return ex.series[session.currentSerIdx] || null;
}

// ============================================
// COMPLETE SERIES
// ============================================
function completeSeries() {
  const ex = currentExercise();
  const ser = currentSeries();
  if (!ex || !ser) return;

  // Salva la serie completata
  session.completedSeries.push({
    exIdx: session.currentExIdx,
    exName: ex.name,
    weight: parseFloat(document.getElementById('current-weight').textContent) || 0,
    unit: document.getElementById('weight-unit').textContent,
    reps: parseInt(document.getElementById('current-reps').textContent) || 0,
    repsUnit: document.getElementById('reps-unit').textContent
  });

  const restSecs = parseTimeToSeconds(document.getElementById('rest-display').textContent);
  startRest(restSecs, ex.name);
}

function startRest(seconds, exName) {
  const weight = document.getElementById('current-weight').textContent;
  const reps = document.getElementById('current-reps').textContent;
  const unit = document.getElementById('weight-unit').textContent;

  session.restTotal = seconds;
  session.restRemaining = seconds;

  document.getElementById('rest-big-timer').textContent = formatTime(seconds);
  document.getElementById('rest-summary').textContent =
    `${exName}\n${weight} ${unit} × ${reps} reps`;
  document.getElementById('rest-progress-fill').style.width = '100%';

  showPage('page-rest');

  session.restInterval = setInterval(() => {
    session.restRemaining--;
    document.getElementById('rest-big-timer').textContent = formatTime(session.restRemaining);
    const pct = (session.restRemaining / session.restTotal) * 100;
    document.getElementById('rest-progress-fill').style.width = pct + '%';

    if (session.restRemaining <= 0) {
      clearInterval(session.restInterval);
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      advanceAfterRest();
    }
  }, 1000);
}

function skipRest() {
  clearInterval(session.restInterval);
  advanceAfterRest();
}

function adjustRestLive(delta) {
  session.restRemaining = Math.max(0, session.restRemaining + delta);
  session.restTotal = Math.max(session.restTotal, session.restRemaining);
  document.getElementById('rest-big-timer').textContent = formatTime(session.restRemaining);
}

function advanceAfterRest() {
  const ex = currentExercise();
  if (!ex) return;

  // Prossima serie o prossimo esercizio
  if (session.currentSerIdx < ex.series.length - 1) {
    session.currentSerIdx++;
  } else {
    // Fine esercizio — prossimo
    if (session.currentExIdx < session.exercises.length - 1) {
      session.currentExIdx++;
      session.currentSerIdx = 0;
    } else {
      // Fine workout
      showPage('page-workout');
      renderWorkoutExercise();
      confirmEndWorkout();
      return;
    }
  }

  showPage('page-workout');
  renderWorkoutExercise();
}

// ============================================
// EXERCISE LIST MODAL
// ============================================
function showExerciseList() {
  const inner = document.getElementById('modal-exercise-list-inner');
  inner.innerHTML = session.exercises.map((ex, i) => {
    const done = session.completedSeries.filter(s => s.exIdx === i);
    const totalSer = ex.series.length;
    let status = '○';
    let cls = '';
    if (i === session.currentExIdx) { status = '→'; cls = 'current'; }
    else if (done.length >= totalSer) { status = '✓'; cls = 'done'; }
    else if (done.length > 0) { status = `${done.length}/${totalSer}`; }

    const isSkippable = i !== session.currentExIdx && done.length === 0;
    return `
      <div class="modal-ex-row ${cls}" onclick="${isSkippable ? `jumpToExercise(${i})` : ''}">
        <div>
          <div style="font-size:13px; font-weight:500;">${ex.name}</div>
          <div style="font-size:10px; color:var(--text-muted); margin-top:2px;">${totalSer} serie</div>
        </div>
        <div class="modal-ex-status">${status}</div>
      </div>`;
  }).join('');
  document.getElementById('modal-exercise-list').style.display = 'flex';
}

function closeExerciseList() {
  document.getElementById('modal-exercise-list').style.display = 'none';
}

function jumpToExercise(idx) {
  session.currentExIdx = idx;
  session.currentSerIdx = 0;
  closeExerciseList();
  renderWorkoutExercise();
}

// ============================================
// SERIES ACTIONS
// ============================================
function addExtraSeries() {
  const ex = currentExercise();
  if (!ex) return;
  const lastSer = ex.series[ex.series.length - 1];
  ex.series.push({ ...lastSer });
  renderWorkoutExercise();
}

function endExerciseEarly() {
  const ex = currentExercise();
  if (!ex) return;
  // Taglia le serie rimanenti
  ex.series = ex.series.slice(0, session.currentSerIdx + 1);
  // Vai al prossimo esercizio
  if (session.currentExIdx < session.exercises.length - 1) {
    session.currentExIdx++;
    session.currentSerIdx = 0;
    renderWorkoutExercise();
  } else {
    confirmEndWorkout();
  }
}

function skipExercise() {
  const ex = currentExercise();
  if (!ex) return;
  if (session.currentSerIdx > 0) return; // sicurezza
  const alreadyStarted = session.completedSeries.some(s => s.exIdx === session.currentExIdx);
  if (alreadyStarted) return;

  if (session.currentExIdx < session.exercises.length - 1) {
    session.currentExIdx++;
    session.currentSerIdx = 0;
    renderWorkoutExercise();
  }
}

// ============================================
// WEIGHT MODAL
// ============================================
function openWeightModal() {
  const val = parseFloat(document.getElementById('current-weight').textContent) || 0;
  weightModalValue = Math.abs(val);
  weightModalSign = val < 0 ? -1 : 1;
  updateWeightModalDisplay();
  updatePctButtons();
  document.getElementById('modal-weight').style.display = 'flex';
}

function closeWeightModal() {
  document.getElementById('modal-weight').style.display = 'none';
}

function toggleWeightSign() {
  weightModalSign *= -1;
  const btn = document.getElementById('weight-sign-btn');
  btn.textContent = weightModalSign > 0 ? '+' : '−';
  btn.style.background = weightModalSign > 0 ? 'var(--accent-light)' : '#fdf0ee';
  btn.style.color = weightModalSign > 0 ? 'var(--accent-dark)' : 'var(--danger)';
  updateWeightModalDisplay();
}

function adjustWeight(delta) {
  weightModalValue = Math.max(0, weightModalValue + delta);
  updateWeightModalDisplay();
  updatePctButtons();
}

function applyWeightPct(pct) {
  weightModalValue = Math.round((weightModalValue * (1 - pct/100)) * 4) / 4;
  updateWeightModalDisplay();
  updatePctButtons();
}

function updateWeightModalDisplay() {
  document.getElementById('weight-modal-num').textContent = weightModalValue + ' kg';
}

function updatePctButtons() {
  [20, 30, 40].forEach(p => {
    const el = document.getElementById(`pct-${p}`);
    if (el) el.textContent = Math.round((weightModalValue * (1 - p/100)) * 4) / 4 + ' kg';
  });
}

function weightManualInput() {
  const val = prompt('Inserisci peso (kg):', weightModalValue);
  if (val !== null && !isNaN(parseFloat(val))) {
    weightModalValue = Math.abs(parseFloat(val));
    updateWeightModalDisplay();
    updatePctButtons();
  }
}

function confirmWeight() {
  const finalVal = weightModalSign * weightModalValue;
  document.getElementById('current-weight').textContent = finalVal;
  closeWeightModal();
}

// ============================================
// REPS MODAL
// ============================================
function openRepsModal() {
  repsModalValue = parseInt(document.getElementById('current-reps').textContent) || 0;
  updateRepsModalDisplay();
  document.getElementById('modal-reps').style.display = 'flex';
}

function closeRepsModal() {
  document.getElementById('modal-reps').style.display = 'none';
}

function adjustReps(delta) {
  repsModalValue = Math.max(0, repsModalValue + delta);
  updateRepsModalDisplay();
}

function updateRepsModalDisplay() {
  document.getElementById('reps-modal-num').textContent = repsModalValue + ' reps';
}

function repsManualInput() {
  const val = prompt('Inserisci reps:', repsModalValue);
  if (val !== null && !isNaN(parseInt(val))) {
    repsModalValue = Math.max(0, parseInt(val));
    updateRepsModalDisplay();
  }
}

function confirmReps() {
  document.getElementById('current-reps').textContent = repsModalValue;
  closeRepsModal();
}

// ============================================
// REST ADJUST (dalla pagina workout)
// ============================================
function adjustRest(delta) {
  const el = document.getElementById('rest-display');
  let secs = parseTimeToSeconds(el.textContent);
  secs = Math.max(0, secs + delta);
  el.textContent = formatTime(secs);
}

// ============================================
// END WORKOUT
// ============================================
function confirmEndWorkout() {
  document.getElementById('modal-end-confirm').style.display = 'flex';
}
function closeEndConfirm() {
  document.getElementById('modal-end-confirm').style.display = 'none';
}

function endWorkout() {
  closeEndConfirm();
  clearInterval(session.timerInterval);
  clearInterval(session.restInterval);

  const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);

  // Raggruppa le serie per esercizio
  const exGroups = {};
  session.completedSeries.forEach(s => {
    if (!exGroups[s.exName]) exGroups[s.exName] = [];
    exGroups[s.exName].push(s);
  });

  const exCount = Object.keys(exGroups).length;
  const serCount = session.completedSeries.length;

  document.getElementById('close-duration').textContent = `${minutes}'`;
  document.getElementById('close-exercises').textContent = exCount;
  document.getElementById('close-series').textContent = serCount;

  selectedMood = null;
  selectedEnergy = null;
  document.getElementById('close-notes').value = '';
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  document.querySelectorAll('.btn-energy').forEach(b => b.classList.remove('selected'));

  showPage('page-close');
}

function selectMood(val, btn) {
  selectedMood = val;
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

function selectEnergy(val, btn) {
  selectedEnergy = val;
  document.querySelectorAll('.btn-energy').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}

async function saveSession() {
  const btn = document.getElementById('btn-save-session');
  btn.textContent = 'SALVATAGGIO...';
  btn.disabled = true;

  const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
  const minutes = Math.floor(elapsed / 60);
  const notes = document.getElementById('close-notes').value.trim();

  // Costruisci testo per il GAS (compatibile con save_workout esistente)
  const exGroups = {};
  session.completedSeries.forEach(s => {
    if (!exGroups[s.exName]) exGroups[s.exName] = [];
    exGroups[s.exName].push(s);
  });

  const rawText = Object.entries(exGroups).map(([name, series]) => {
    const serStr = series.map(s => `${s.weight}${s.unit} x ${s.reps} ${s.repsUnit}`).join(', ');
    return `${name}: ${serStr}`;
  }).join('\n') + (notes ? `\n${notes}` : '');

  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({
        service: 'save_workout',
        raw_input: rawText,
        manual_mood: selectedMood,
        manual_energy: selectedEnergy,
        workout_name: session.workoutName,
        workout_id: session.workoutId,
        duration: minutes
      })
    });

    btn.textContent = '✓ SALVATO';
    btn.style.background = '#4ade80';
    btn.style.color = '#000';
    setTimeout(async () => {
      btn.textContent = 'SALVA E ANALIZZA';
      btn.disabled = false;
      btn.style.background = '';
      btn.style.color = '';
      await loadAppData();
      showPage('page-home');
    }, 1200);
  } catch(e) {
    btn.textContent = 'ERRORE — riprova';
    btn.disabled = false;
  }
}

// ============================================
// CONFIG WORKOUT
// ============================================
function renderConfigList() {
  const container = document.getElementById('config-workout-list');
  const workouts = appData.workouts || [];
  if (workouts.length === 0) {
    container.innerHTML = '<div class="empty-state">Nessun workout</div>';
    return;
  }
  container.innerHTML = workouts.map(w => `
    <div class="exercise-lib-card" onclick="openWorkoutDetail('${w.id}')">
      <div>
        <div class="exercise-lib-name">${w.name}</div>
        <div class="exercise-lib-muscle">${(w.exercises||[]).length} esercizi</div>
      </div>
      <div style="font-size:18px; color:var(--text-dim);">›</div>
    </div>`).join('');
}

function openNewWorkoutModal() {
  document.getElementById('new-workout-name').value = '';
  document.getElementById('modal-new-workout').style.display = 'flex';
}
function closeNewWorkoutModal() {
  document.getElementById('modal-new-workout').style.display = 'none';
}

async function saveNewWorkout() {
  const name = document.getElementById('new-workout-name').value.trim();
  if (!name) return;
  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ service: 'lift_save_workout_template', name, exercises: [] })
    });
    closeNewWorkoutModal();
    await loadAppData();
  } catch(e) { console.error(e); }
}

function openWorkoutDetail(workoutId) {
  editingWorkoutId = workoutId;
  const workout = appData.workouts.find(w => w.id === workoutId);
  if (!workout) return;
  document.getElementById('workout-detail-title').textContent = workout.name;
  renderWorkoutDetailList(workout);
  showPage('page-workout-detail');
}

function renderWorkoutDetailList(workout) {
  const container = document.getElementById('workout-detail-list');
  const exs = workout.exercises || [];
  if (exs.length === 0) {
    container.innerHTML = '<div class="empty-state">Nessun esercizio — aggiungi con +</div>';
    return;
  }
  container.innerHTML = exs.map((ex, i) => `
    <div class="history-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div class="history-card-title">${ex.name}</div>
        <button style="background:none;border:none;color:var(--text-dim);font-size:16px;cursor:pointer;" onclick="removeExFromWorkout(${i})">×</button>
      </div>
      <div class="history-card-meta">${ex.series.length} serie · ${ex.series[0]?.weight||'—'}kg · rest ${formatTime(ex.series[0]?.rest||120)}</div>
      ${ex.note ? `<div style="font-size:10px;color:var(--text-muted);margin-top:4px;font-style:italic;">${ex.note}</div>` : ''}
    </div>`).join('');
}

function addExerciseToWorkout() {
  // Apre modal replace (riuso) per selezionare dalla libreria
  document.getElementById('replace-search').value = '';
  buildReplaceList('');
  document.getElementById('modal-replace').style.display = 'flex';
  // Override onclick del replace per aggiungere invece di sostituire
  window._replaceMode = 'add';
}

async function removeExFromWorkout(idx) {
  const workout = appData.workouts.find(w => w.id === editingWorkoutId);
  if (!workout) return;
  workout.exercises.splice(idx, 1);
  renderWorkoutDetailList(workout);
  await saveWorkoutTemplate(workout);
}

async function saveWorkoutTemplate(workout) {
  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ service: 'lift_save_workout_template', id: workout.id, name: workout.name, exercises: workout.exercises })
    });
  } catch(e) { console.error(e); }
}

// ============================================
// EXERCISE LIBRARY
// ============================================
function renderExerciseLibrary() {
  const container = document.getElementById('exercise-library-list');
  const exs = appData.exercises || [];
  if (exs.length === 0) {
    container.innerHTML = '<div class="empty-state">Nessun esercizio</div>';
    return;
  }
  container.innerHTML = exs.map(ex => `
    <div class="exercise-lib-card">
      <div>
        <div class="exercise-lib-name">${ex.name}</div>
        <div class="exercise-lib-muscle">${ex.muscle || '—'}</div>
      </div>
      <div class="exercise-lib-pr">${ex.pr ? ex.pr + ' kg PR' : ''}</div>
    </div>`).join('');
}

function openAddExerciseModal() {
  document.getElementById('new-exercise-name').value = '';
  document.getElementById('new-exercise-muscle').value = '';
  document.getElementById('modal-add-exercise').style.display = 'flex';
}
function closeAddExerciseModal() {
  document.getElementById('modal-add-exercise').style.display = 'none';
}

async function saveNewExercise() {
  const name = document.getElementById('new-exercise-name').value.trim();
  const muscle = document.getElementById('new-exercise-muscle').value.trim();
  if (!name) return;
  try {
    await fetch(SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify({ service: 'lift_save_exercise', name, muscle })
    });
    closeAddExerciseModal();
    await loadAppData();
  } catch(e) { console.error(e); }
}

// ============================================
// REPLACE EXERCISE MODAL
// ============================================
function buildReplaceList(query) {
  const exs = appData.exercises || [];
  const filtered = query
    ? exs.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
    : exs;
  const container = document.getElementById('replace-list');
  container.innerHTML = filtered.map(ex => `
    <div class="modal-ex-row" onclick="selectReplaceExercise('${ex.name}')">
      <div>
        <div style="font-size:13px;">${ex.name}</div>
        <div style="font-size:10px;color:var(--text-muted);">${ex.muscle||''}</div>
      </div>
    </div>`).join('');
}

function filterReplaceList(q) { buildReplaceList(q); }
function closeReplaceModal() {
  document.getElementById('modal-replace').style.display = 'none';
  window._replaceMode = null;
}

async function selectReplaceExercise(name) {
  if (window._replaceMode === 'add') {
    await addExToCurrentWorkout(name);
  } else {
    // sostituisci esercizio corrente nel workout
    const ex = currentExercise();
    if (ex) { ex.name = name; renderWorkoutExercise(); }
  }
  closeReplaceModal();
}

async function replaceWithCustom() {
  const name = document.getElementById('replace-custom').value.trim();
  if (!name) return;
  if (window._replaceMode === 'add') {
    await addExToCurrentWorkout(name);
  } else {
    const ex = currentExercise();
    if (ex) { ex.name = name; renderWorkoutExercise(); }
  }
  closeReplaceModal();
}

async function addExToCurrentWorkout(name) {
  const workout = appData.workouts.find(w => w.id === editingWorkoutId);
  if (!workout) return;

  const rest = parseInt(prompt('Rest tra le serie (secondi):', '120')) || 120;
  const sets = parseInt(prompt('Numero di serie:', '3')) || 3;
  const weight = parseFloat(prompt('Peso di partenza (kg):', '0')) || 0;
  const reps = parseInt(prompt('Reps per serie:', '8')) || 8;

  const series = Array.from({length: sets}, () => ({ weight, reps, rest, unit: 'kg', repsUnit: 'reps' }));
  workout.exercises.push({ name, series, note: '' });
  renderWorkoutDetailList(workout);
  await saveWorkoutTemplate(workout);
}

// ============================================
// HISTORY
// ============================================
function renderHistoryList() {
  const container = document.getElementById('history-list');
  const history = (appData.history || []).slice(0, 30);
  if (history.length === 0) {
    container.innerHTML = '<div class="empty-state">Nessuna sessione salvata</div>';
    return;
  }
  container.innerHTML = history.map(s => `
    <div class="history-card">
      <div class="history-card-title">${s.workoutName || 'Sessione'}</div>
      <div class="history-card-meta">${s.date} · ${s.duration ? s.duration + ' min' : '—'} · ${s.mood !== undefined ? moodEmoji(s.mood) : ''}</div>
      ${s.notes ? `<div style="font-size:11px;color:var(--text-muted);margin-top:6px;line-height:1.4;">${s.notes}</div>` : ''}
    </div>`).join('');
}

function moodEmoji(val) {
  const map = {'-2':'😫', '-1':'😐', '0':'😊', '1':'😄', '2':'🔥'};
  return map[String(val)] || '';
}

// ============================================
// UTILITIES
// ============================================
function formatTime(secs) {
  secs = Math.max(0, Math.floor(secs));
  const m = Math.floor(secs / 60).toString().padStart(2,'0');
  const s = (secs % 60).toString().padStart(2,'0');
  return `${m}:${s}`;
}

function parseTimeToSeconds(str) {
  const parts = str.split(':');
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  return parseInt(str) || 0;
}
