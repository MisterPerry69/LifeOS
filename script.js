/**
 * SYSTEM_OS - CORE JAVASCRIPT
 * Struttura Modulare per GitHub
 */

// --- 1. CONFIGURAZIONE E STATO GLOBALE ---
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwQPQYYG6qBHwPcZRUFnNYILkm1xgiwWlFZWofg8M2u12xsOBgJDeB8HJmH2JIM0csI/exec";
let historyData = [];
let extraItemsGlobal = [];
let currentNoteData = null; // Memorizza la nota attiva nel modal
let currentView = 30;       // Vista Pixel (7, 30, 365)
let menuOpen = false;

// --- 2. CORE & NAVIGATION ---

// Inizializzazione al caricamento
// --- 2. CORE & NAVIGATION ---

// Inizializzazione al caricamento
window.onload = async () => {
    updateClock();
    setInterval(updateClock, 1000);
    
    // Avvia la sequenza di boot visiva
    await runBootSequence();
    
    // Carica i dati reali
    await loadStats(); 
    
    // Nasconde il boot screen dopo un breve delay per far leggere l'ultimo log
    setTimeout(() => {
        const boot = document.getElementById('boot-screen');
        if(boot) boot.style.display = 'none';
    }, 500);
};

// Funzione per scrivere i log nel boot screen
async function bootLog(text, delay = 150) {
    const logEl = document.getElementById('boot-text');
    if (logEl) {
        logEl.innerHTML += `> ${text}<br>`;
        // Scroll automatico verso il basso se i log sono tanti
        logEl.scrollTop = logEl.scrollHeight;
    }
    return new Promise(res => setTimeout(res, delay));
}

// Sequenza di log "estetici"
async function runBootSequence() {
    await bootLog("INITIALIZING SYSTEM_OS...", 300);
    await bootLog("LOADING KERNEL MODULES...", 200);
    await bootLog("ESTABLISHING CONNECTION TO GAS_ENGINE...", 400);
    await bootLog("FETCHING USER_DATA FROM SPREADSHEET...", 100);
    // Qui il codice passerà a loadStats() nel window.onload
}

function updateClock() {
    const clockEl = document.getElementById('clock');
    const dateEl = document.getElementById('dateStr');
    const now = new Date();
    
    if(clockEl) clockEl.innerText = now.getHours().toString().padStart(2, '0') + ":" + now.getMinutes().toString().padStart(2, '0');
    if(dateEl) dateEl.innerText = now.toLocaleDateString('it-IT');
}

function nav(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById(pageId).classList.add('active');
    if(pageId === 'habit') drawPixels(historyData);
    if(menuOpen) toggleMenu(); // Chiude il menu se aperto
}

function toggleMenu() {
    const menu = document.getElementById('side-menu');
    menuOpen = !menuOpen;
    if(menu) menu.style.width = menuOpen ? "180px" : "0";
}

// --- 3. DATA ENGINE (GET) ---

async function loadStats() {
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getStats&t=${Date.now()}`);
        const data = await response.json();
        
        if (data.status === "ONLINE") {
            historyData = data.history || [];
            extraItemsGlobal = data.extraDetails || [];
            renderGrid(data);
        }
    } catch (err) {
        console.error("Errore recupero dati:", err);
    }
}

// Variabile globale per contenere le note caricate ed evitare problemi di parsing nell'HTML
let loadedNotesData = [];

function renderGrid(data) {
    const grid = document.getElementById('keep-grid');
    if (!grid) return;
    grid.innerHTML = "";
    
    loadedNotesData = data.notes;

    // CARD EXTRA (Sempre pinnata di default)
    grid.innerHTML += `
        <div class="keep-card bg-default extra-card pinnato" onclick="openExtraDetail()">
            <div style="position:absolute; top:8px; right:8px; font-size:10px; color:var(--accent)"><i class="fas fa-thumbtack"></i></div>
            <div class="title-row" style="color:var(--accent)">TOTAL_EXTRA</div>
            <div style="font-size: 28px; color: var(--accent); margin: 5px 0;">${data.extraTotal}h</div>
            <div class="label" style="opacity:0.5">${data.monthLabel}</div>
        </div>`;

    // NOTE
    loadedNotesData.forEach((note, index) => {
        const d = new Date(note[0]);
        const dStr = d.toLocaleDateString('it-IT', {day:'2-digit', month:'short'});
        const color = note[3];
        const id = note[4];
        const title = note[5] || "Nota";
        // Supponiamo che il pin sia gestito via colore o tag (per ora aggiungiamo placeholder)
        const isPinned = note[2] === "PINNED"; 

        grid.innerHTML += `
            <div class="keep-card bg-${color} ${isPinned ? 'pinnato' : ''}" id="card-${id}" onclick="openNoteByIndex(${index})">
                ${isPinned ? '<div style="position:absolute; top:8px; right:8px; font-size:10px; opacity:0.5"><i class="fas fa-thumbtack"></i></div>' : ''}
                <div class="title-row">${title.toUpperCase()}</div>
                <div class="content-preview">${note[1]}</div>
                <div class="label" style="font-size:9px; margin-top:5px; opacity:0.4;">${dStr}</div>
            </div>`;
    });
}

// --- 4. COMMAND CENTER (POST) ---

function sendCmd(event) {
    if (event.key === 'Enter') {
        const input = event.target;
        const val = input.value.trim();
        if (!val) return;

        let service = "note";
        const cmd = val.toLowerCase();

        // Riconoscimento Intelligente Command Service
        if (/^\+(\d+(\.\d+)?)$/.test(cmd)) service = "extra_hours";
        else if (/^ieri\+(\d+(\.\d+)?)$/.test(cmd)) service = "extra_hours";
        else if (/^(\d{1,2})([a-z]{3})\+(\d+(\.\d+)?)$/.test(cmd)) service = "extra_hours";
        else if (/^\d+(\.\d+)?\s?kg/i.test(cmd)) service = "health_weight";
        else if (/^h\d/i.test(cmd)) service = "habit_log";

        input.value = "";
        input.placeholder = "REGISTRO: " + service.toUpperCase() + "...";

        fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ service: service, text: val })
        }).then(() => {
            input.placeholder = "> CONCLUSO.";
            setTimeout(() => {
                input.placeholder = (input.id === 'cmd') ? "> DIGITA..." : "Prendi una nota...";
                loadStats();
            }, 1000);
        });
    }
}

// --- 5. UI MODALS & ACTIONS ---

function openNoteByIndex(index) {
    const note = loadedNotesData[index];
    if (!note) return;

    // note = [Data, Contenuto, Tipo, Colore, ID, Titolo]
    currentNoteData = { id: note[4], type: 'NOTE', color: note[3] };
    
    const d = new Date(note[0]);
    const dStr = d.toLocaleDateString('it-IT', {day:'2-digit', month:'short'});
    
    const modal = document.getElementById('note-detail');
    document.getElementById('detail-type').innerText = note[5] || "Nota"; // Titolo nel modal
    document.getElementById('detail-text').value = note[1]; // Testo integrale
    document.getElementById('detail-text').style.display = "block";
    document.getElementById('detail-extra-list').style.display = "none";
    
    modal.className = `note-overlay bg-${note[3]}`;
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
}


function openExtraDetail() {
    currentNoteData = { type: "EXTRA" };
    const modal = document.getElementById('note-detail');
    const list = document.getElementById('detail-extra-list');
    const colorBtn = document.querySelector('.color-selector-container');
    
    document.getElementById('detail-type').innerText = "RECAP_EXTRA";
    document.getElementById('detail-text').style.display = "none";
    if(colorBtn) colorBtn.style.display = "none"; // Disabilita colori per Extra
    
    list.style.display = "block";

    // ORDINAMENTO CRONOLOGICO: dal primo del mese all'ultimo
    const sortedExtra = [...extraItemsGlobal].sort((a, b) => new Date(a.data) - new Date(b.data));
    
    list.innerHTML = sortedExtra.map(item => `
        <div class="extra-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #222;">
            <span>${new Date(item.data).toLocaleDateString('it-IT', {day:'2-digit', month:'short'})} ➔ <b>+${item.ore}h</b></span>
            <i class="fas fa-trash" onclick="confirmDelete(${item.id}, 'EXTRA')" style="color:#555; cursor:pointer;"></i>
        </div>`).join('');
    
    modal.className = 'note-overlay bg-default';
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
}


// Chiusura istantanea per eliminare il lag
function saveAndClose() {
    const text = document.getElementById('detail-text').value;
    const modal = document.getElementById('note-detail');
    
    if (currentNoteData && currentNoteData.type === 'NOTE') {
        // NON usiamo await qui: lanciamo il salvataggio e chiudiamo subito
        fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ 
                service: "update_note", 
                id: currentNoteData.id, 
                text: text, 
                color: currentNoteData.color 
            })
        }).then(() => loadStats()); // Ricarica i dati in background
    }

    // Chiudi subito l'interfaccia
    closeModal();
}

function closeModal() {
    document.getElementById('note-detail').style.display = 'none';
    document.getElementById('modal-backdrop').style.display = 'none';
    document.body.classList.remove('modal-open');
}

async function deleteItem(id, type) {
    if (!confirm("Confermi eliminazione?")) return;
    
    await fetch(SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        body: JSON.stringify({ service: "delete_item", id: id, type: type })
    });
    saveAndClose();
}

function toggleColorPicker() {
    const picker = document.getElementById('color-picker-bubble');
    picker.style.display = (picker.style.display === 'flex') ? 'none' : 'flex';
}

// MODIFICA: Aggiornamento immediato del colore (Optimistic UI)
function changeNoteColor(colorName) {
    if (currentNoteData && currentNoteData.type === 'NOTE') {
        // Cambia colore al modal subito
        document.getElementById('note-detail').className = `note-overlay bg-${colorName}`;
        
        // Cambia colore alla card sotto subito (senza aspettare il server)
        const card = document.getElementById(`card-${currentNoteData.id}`);
        if(card) card.className = `keep-card bg-${colorName}`;
        
        currentNoteData.color = colorName;
        document.getElementById('color-picker-bubble').style.display = 'none';
    }
}

// --- 6. HABIT TRACKER (PIXELS) ---

function drawPixels(history = []) {
    const container = document.getElementById('pixels');
    if(!container) return;
    
    container.innerHTML = '';
    container.className = 'grid-' + currentView;

    const labels = { 7: "SETTIMANA", 30: "MESE", 365: "ANNO" };
    document.getElementById('viewLabel').innerText = labels[currentView];

    for(let i = 0; i < currentView; i++) {
        const p = document.createElement('div');
        p.className = 'pixel';
        let d = new Date();
        d.setDate(d.getDate() - (currentView - 1 - i));
        let dateStr = d.toISOString().split('T')[0];
        if (history.includes(dateStr)) p.classList.add('active');
        container.appendChild(p);
    }
}

function cycleView() {
    currentView = (currentView === 30) ? 365 : (currentView === 365) ? 7 : 30;
    drawPixels(historyData);
}


let deleteTarget = null;

function confirmDelete(id, type) {
    deleteTarget = { id, type };
    document.getElementById('delete-modal').style.display = 'flex';
}

function cancelDelete() {
    deleteTarget = null;
    document.getElementById('delete-modal').style.display = 'none';
}

async function executeDelete() {
    if (!deleteTarget) return;
    
    // UI Feedback immediato
    document.getElementById('delete-modal').style.display = 'none';
    
    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ service: "delete_item", id: deleteTarget.id, type: deleteTarget.type })
    });
    
    closeModal();
    loadStats(); // Ricarica la griglia
}