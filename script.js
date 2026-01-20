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

function renderGrid(data) {
    const grid = document.getElementById('keep-grid');
    if (!grid) return;

    grid.innerHTML = "";
    
    // 3.1 Card Extra (Speciale)
    grid.innerHTML += `
        <div class="keep-card bg-default" onclick="openExtraDetail()" style="border-left: 3px solid var(--accent) !important;">
            <div class="label">EXTRA_TOTAL</div>
            <div style="font-size: 24px; color: var(--accent); margin: 5px 0;">${data.extraTotal}h</div>
            <div style="font-size: 9px; color: var(--dim); text-transform: uppercase;">${data.monthLabel}</div>
        </div>`;

    // 3.2 Card Note (Procedurali)
    data.notes.forEach(note => {
        const d = new Date(note[0]);
        const dStr = d.toLocaleDateString('it-IT', {day:'2-digit', month:'short'});
        const tStr = d.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
        const cleanText = note[1].replace(/'/g, "\\'");
        
        grid.innerHTML += `
            <div class="keep-card bg-${note[3]}" onclick="openNote('${cleanText}', 'NOTE', '${dStr} ${tStr}', '${note[3]}', ${note[4]})">
                <div class="label">${dStr} - ${tStr}</div>
                <div style="font-size: 13px; line-height: 1.4;">${note[1]}</div>
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

function openNote(text, type, dateLabel, color, id) {
    currentNoteData = { id, type, color };
    const modal = document.getElementById('note-detail');
    const textArea = document.getElementById('detail-text');
    
    document.getElementById('detail-type').innerText = dateLabel;
    textArea.style.display = "block";
    textArea.value = text;
    document.getElementById('detail-extra-list').style.display = "none";
    
    // Reset e applicazione colore
    modal.className = `note-overlay bg-${color}`;
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
    document.body.classList.add('modal-open');
}

function openExtraDetail() {
    currentNoteData = { type: "EXTRA" };
    const modal = document.getElementById('note-detail');
    const list = document.getElementById('detail-extra-list');
    
    document.getElementById('detail-type').innerText = "DETTAGLIO_EXTRA";
    document.getElementById('detail-text').style.display = "none";
    list.style.display = "block";
    
    list.innerHTML = extraItemsGlobal.map(item => `
        <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #333;">
            <div style="flex-grow:1; font-size:12px;">
                ${new Date(item.data).toLocaleDateString('it-IT', {day:'2-digit', month:'short'})} 
                <span style="color:var(--accent)">(+${item.ore}h)</span> - ${item.nota}
            </div>
            <span onclick="deleteItem(${item.id}, 'EXTRA')" style="color:#ea4335; cursor:pointer; font-size:16px;">🗑️</span>
        </div>
    `).join('');
    
    modal.className = 'note-overlay bg-default';
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
    document.body.classList.add('modal-open');
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

function changeNoteColor(colorName) {
    if (currentNoteData && currentNoteData.type === 'NOTE') {
        const modal = document.getElementById('note-detail');
        // Update visivo immediato
        modal.className = `note-overlay bg-${colorName}`;
        currentNoteData.color = colorName;
        // Chiudi la bubble dopo la selezione
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
