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
let currentFilter = 'ALL'; // Filtro BRAIN DUMP
let searchQuery = ""; // Casella di ricerca BD

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
    document.getElementById('search-input').addEventListener('blur', function() {
    // Se l'input è vuoto quando clicchi fuori, chiudi la barra
    if (this.value === "") {
        toggleSearch(false);
    }
});
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
    const target = document.getElementById(pageId);
    if(target) target.classList.add('active');
    
    // LOGICA DI ATTIVAZIONE MODULI
    if(pageId === 'habit') drawPixels(historyData);
    if(pageId === 'agenda') loadAgenda(); 
    checkSavedPlan();
    
    
    if(menuOpen) toggleSidebar(); 
}

async function checkSavedPlan() {
    // Qui dovremmo fare una fetch per vedere se nel foglio System_State c'è roba di oggi
    // Per ora, se non lo implementiamo, rimarrà sempre sulla schermata di input.
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
            // Aggiorniamo le variabili globali
            historyData = data.history || [];
            extraItemsGlobal = data.extraDetails || [];
            window.agendaData = data.agenda || [];
            
            // Ridisegniamo la UI
            renderGrid(data); 
            
            // Se siamo nella pagina agenda, ridisegnamo anche quella
            if (document.getElementById('agenda').classList.contains('active')) {
                renderAgenda(window.agendaData);
            }
        }
    } catch (err) {
        console.error("Refresh fallito:", err);
    }
}

// Variabile globale per contenere le note caricate ed evitare problemi di parsing nell'HTML
let loadedNotesData = [];

let draggedItem = null;

function renderGrid(data) {
    const grid = document.getElementById('keep-grid');
    if (!grid) return;
    
    // 1. SALVATAGGIO DATI GLOBALI
    lastStatsData = data; 
    loadedNotesData = data.notes;

    document.getElementById('widget-notes').innerText = (loadedNotesData.length + 1);
    if(data.weight) document.getElementById('widget-weight').innerText = data.weight;
    if(data.history) document.getElementById('widget-habits').innerText = data.history.length;

    const fragment = document.createDocumentFragment();
    const isSearching = typeof searchQuery !== 'undefined' && searchQuery.length > 0;
    
    // --- 3. CARD EXTRA (Pinnata in alto a sinistra) ---
    if ((currentFilter === 'ALL' || currentFilter === 'EXTRA') && !isSearching) {
        const extraCard = document.createElement('div');
        extraCard.className = "keep-card bg-default extra-card pinnato";
        extraCard.innerHTML = `
            <div class="pin-indicator" style="color:var(--accent)"><i class="fas fa-thumbtack"></i></div>
            <div class="title-row" style="color:var(--accent)">TOTAL_EXTRA</div>
            <div style="font-size: 28px; color: var(--accent); margin: 5px 0;">${data.extraTotal}h</div>
            <div class="label" style="opacity:0.5">${data.monthLabel}</div>
        `;
        extraCard.onclick = () => openExtraDetail();
        fragment.appendChild(extraCard);
    }

    // --- 4. FILTRAGGIO E ORDINAMENTO ---
    // Manteniamo la tua logica di filtraggio, ma aggiungiamo un sort per i Pinnati
    const filteredNotes = loadedNotesData.map((note, originalIndex) => ({ note, originalIndex }))
    .filter(item => {
        const title = String(item.note[5] || "").toLowerCase();
        const content = String(item.note[1] || "").toLowerCase();
        const type = item.note[2];
        const searchLower = searchQuery.toLowerCase(); // searchQuery è già minuscola se usi handleSearch
        
        const matchesSearch = !isSearching || title.includes(searchLower) || content.includes(searchLower);
        if (!matchesSearch) return false;

        if (currentFilter === 'ALL') return true;
        if (currentFilter === 'PINNED') return type === 'PINNED';
        if (currentFilter === 'NOTE') return type === 'NOTE' && !content.includes('http');
        if (currentFilter === 'LINK') return content.includes('http');
        if (currentFilter === 'EXTRA') return false; 
        return true;
    })
    .sort((a, b) => {
        // Forza i Pinnati in alto se siamo in visualizzazione ALL
        if (currentFilter === 'ALL' && !isSearching) {
            if (a.note[2] === "PINNED" && b.note[2] !== "PINNED") return -1;
            if (a.note[2] !== "PINNED" && b.note[2] === "PINNED") return 1;
        }
        return 0;
    });

    // --- 5. GENERAZIONE DELLE CARD NOTE (Col tuo Drag & Drop) ---
    filteredNotes.forEach((item) => {
        const note = item.note;
        const index = item.originalIndex; 
        const isPinned = note[2] === "PINNED";
        
        const card = document.createElement('div');
        card.className = `keep-card bg-${note[3]} ${isPinned ? 'pinnato' : ''}`;
        card.id = `card-${note[4]}`;
        card.dataset.type = note[2];
        
        const isDraggable = (currentFilter === 'ALL' && !isSearching);
        card.draggable = isDraggable;

        card.innerHTML = `
            ${isPinned ? '<div class="pin-indicator"><i class="fas fa-thumbtack"></i></div>' : ''}
            <div class="title-row">${(note[5] || "NOTA").toUpperCase()}</div>
            <div class="content-preview">${note[1]}</div>
            <div class="label" style="font-size:9px; margin-top:5px; opacity:0.4;">
                ${new Date(note[0]).toLocaleDateString('it-IT', {day:'2-digit', month:'short'})}
            </div>
        `;

        // --- I TUOI EVENTI DRAG & DROP (INTATTI) ---
        card.ondragstart = (e) => {
            if (!isDraggable) return; 
            draggedItem = card;
            card.classList.add('dragging');
        };

        card.ondragend = () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.keep-card').forEach(c => c.classList.remove('drag-over'));
            if (isDraggable) saveNewOrder(); 
        };

        card.ondragover = (e) => e.preventDefault();

        card.ondragenter = (e) => {
            if (isDraggable && draggedItem && draggedItem.dataset.type === card.dataset.type && card !== draggedItem) {
                card.classList.add('drag-over');
            }
        };

        card.ondragleave = () => card.classList.remove('drag-over');

        card.ondrop = (e) => {
            e.preventDefault();
            card.classList.remove('drag-over');
            if (!isDraggable || !draggedItem || draggedItem === card) return;

            if (!card.classList.contains('extra-card') && draggedItem.dataset.type === card.dataset.type) {
                const allCards = [...grid.querySelectorAll('.keep-card')];
                const draggedIdx = allCards.indexOf(draggedItem);
                const targetIdx = allCards.indexOf(card);
                if (draggedIdx < targetIdx) card.after(draggedItem);
                else card.before(draggedItem);
            }
        };

        card.onclick = () => {
            if (!card.classList.contains('dragging')) openNoteByIndex(index);
        };

        fragment.appendChild(card);
    });

    // --- 6. SWITCH ISTANTANEO ---
    grid.innerHTML = ""; 
    grid.appendChild(fragment);
}

async function saveNewOrder() {
    const cards = [...document.querySelectorAll('.keep-card:not(.extra-card)')];
    const orderList = cards.map((card, index) => ({
        id: card.id.replace('card-', ''),
        order: index + 1
    }));

    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ service: "update_order", orderList: orderList })
    });
}

// --- 4. COMMAND CENTER (POST) ---

async function sendCmd(event) {
    if (event.key === 'Enter') {
        const input = event.target;
        const val = input.value.trim();
        if (!val) return;
        input.value = "";
        input.placeholder = "> SYNCING...";
        
        let service = "note";
        if (val.toLowerCase().startsWith('t ')) service = "agenda_add";
        else if (/^\+(\d+(\.\d+)?)$/.test(val) || val.toLowerCase().startsWith('ieri+')) service = "extra_hours";

        try {
            await fetch(SCRIPT_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ service: service, text: val })});
            await new Promise(r => setTimeout(r, 1200));
            await loadStats();
            input.placeholder = "> SUCCESS.";
        } catch (e) { input.placeholder = "!! ERROR !!"; }
        
        setTimeout(() => { 
            input.placeholder = "> DIGITA...";
            input.focus(); // RIPRISTINA FOCUS
        }, 1500);
    }
}

// --- 5. UI MODALS & ACTIONS ---

function openNoteByIndex(index) {
    const note = loadedNotesData[index];
    if (!note) return;

    currentNoteData = { id: note[4], type: note[2], color: note[3], index: index };
    
    const modal = document.getElementById('note-detail');
    const colorBtn = document.querySelector('.color-selector-container');
    const pinIcon = document.querySelector('.tool-icon i.fa-thumbtack');

    // Reset UI
    document.getElementById('detail-type').innerText = note[5] || "NOTA";
    document.getElementById('detail-text').value = note[1];
    document.getElementById('detail-text').style.display = "block";
    document.getElementById('detail-extra-list').style.display = "none";
    
    // Mostra tavolozza (per le note normali)
    if(colorBtn) colorBtn.style.display = "block";
    
    // Illumina Pin se la nota è già pinnata
    if(pinIcon) pinIcon.style.color = (note[2] === "PINNED") ? "var(--accent)" : "var(--dim)";

    modal.className = `note-overlay bg-${note[3]}`;
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
}



function openExtraDetail() {
    currentNoteData = { type: "EXTRA" };
    const modal = document.getElementById('note-detail');
    const list = document.getElementById('detail-extra-list');
    const colorBtn = document.querySelector('.color-selector-container');
    const pinIcon = document.querySelector('.tool-icon i.fa-thumbtack');

    document.getElementById('detail-type').innerText = "RECAP_EXTRA";
    document.getElementById('detail-text').style.display = "none";
    list.style.display = "block";

    // Nascondi tavolozza e illumina Pin (Hours è sempre pinnato)
    if(colorBtn) colorBtn.style.display = "none";
    if(pinIcon) pinIcon.style.color = "var(--accent)";

    // Ordinamento Cronologico
    const sortedExtra = [...extraItemsGlobal].sort((a, b) => new Date(a.data) - new Date(b.data));
    
    list.innerHTML = sortedExtra.map(item => `
        <div class="extra-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #222;">
            <span>${new Date(item.data).toLocaleDateString('it-IT', {day:'2-digit', month:'short'})} ➔ <b>+${item.ore}h</b></span>
            <i class="fas fa-trash" onclick="confirmDelete(${item.id}, 'EXTRA')" style="color:#555; cursor:pointer;"></i>
        </div>`).join('');
    
    modal.className = 'note-overlay extra-card';
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
}

// Chiusura istantanea per eliminare il lag
function saveAndClose() {
    const text = document.getElementById('detail-text').value;
    const modal = document.getElementById('note-detail');
    
    if (currentNoteData && currentNoteData.id) {
        // AGGIORNAMENTO ISTANTANEO LATO CLIENT (Optimistic)
        const card = document.getElementById(`card-${currentNoteData.id}`);
        if (card) {
            card.querySelector('.content-preview').innerText = text;
            // Se hai cambiato colore, aggiorna anche la classe della card
            card.className = `keep-card bg-${currentNoteData.color}`;
        }

        // Poi invia al server in background
        fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ 
                service: "update_note", 
                id: currentNoteData.id, 
                text: text, 
                color: currentNoteData.color 
            })
        });
    }
    closeModal();
}

function closeModal() {
    document.getElementById('note-detail').style.display = 'none';
    document.getElementById('modal-backdrop').style.display = 'none';
    document.body.classList.remove('modal-open');
    
    // RESET INTERFACCIA: Chiude bubble colori e modal cancellazione se aperti
    document.getElementById('color-picker-bubble').style.display = 'none';
    document.getElementById('delete-modal').style.display = 'none';
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
    if (currentNoteData) {
        currentNoteData.color = colorName;
        // Cambia colore al modal subito
        document.getElementById('note-detail').className = `note-overlay bg-${colorName}`;
        // Chiude la bolla dei colori
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
    
    // 1. Chiudi subito il popup di conferma
    document.getElementById('delete-modal').style.display = 'none';
    
    // 2. Manda il comando al server
    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ 
            service: "delete_item", 
            id: deleteTarget.id, 
            type: deleteTarget.type 
        })
    });
    
    // 3. ORA ricarica i dati e chiudi il modal della nota
    closeModal();
    await loadStats(); // Questo pulirà la lista degli extra e le note
}

// NUOVA: Funzione per switchare il PIN
async function togglePin() {
    if (!currentNoteData || currentNoteData.type === "EXTRA") return;

    // Toggle Stato
    const nuovoStato = (currentNoteData.type === "PINNED") ? "NOTE" : "PINNED";
    currentNoteData.type = nuovoStato;
    
    const pinIcon = document.querySelector('.tool-icon i.fa-thumbtack');
    pinIcon.style.color = (nuovoStato === "PINNED") ? "var(--accent)" : "var(--dim)";

    await fetch(SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        body: JSON.stringify({ service: "update_note_type", id: currentNoteData.id, type: nuovoStato })
    });
    loadStats(); // Ricarica per spostare la card in cima
}

function toggleSidebar() {
    const menu = document.getElementById('side-menu');
    const backdrop = document.getElementById('menu-backdrop');
    if (!menu || !backdrop) return; // Sicurezza

    const isOpen = menu.classList.contains('open');

    if (isOpen) {
        menu.classList.remove('open');
        backdrop.style.display = 'none';
    } else {
        menu.classList.add('open');
        backdrop.style.display = 'block';
    }
}

function setFilter(type, el) {
    currentFilter = type;
    
    // Rimuovi classe active da tutti e aggiungi al corrente
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');
    
    toggleSidebar(); // Chiude il menu
    
    // Ricarica la griglia con i dati che abbiamo già in memoria
    if (lastStatsData) {
        renderGrid(lastStatsData);
    }
}

function handleSearch() {
    const input = document.getElementById('search-input');
    searchQuery = (input.value || "").toLowerCase();
    // Forza il rendering della griglia con il filtro
    if (lastStatsData) renderGrid(lastStatsData);
}

function toggleSearch(show) {
    const wrapper = document.getElementById('search-wrapper');
    const input = document.getElementById('search-input');
    const title = document.getElementById('dump-title');
    const trigger = document.getElementById('search-trigger');

    if (show) {
        wrapper.style.display = 'flex';
        title.style.opacity = "0";
        setTimeout(() => input.focus(), 100);
    } else {
        if (input.value === "") {
            wrapper.style.display = 'none';
            title.style.opacity = "1";
            searchQuery = "";
            renderGrid(lastStatsData);
        }
    }
}//AGENDA

// Aggiungiamo un flag isInternal per capire da dove arriva il comando
function handleAgendaCommand(input, isInternal = false) {
    if (!input.trim()) return;
    
    const commands = input.split('/').map(s => s.trim());
    const inputField = isInternal ? document.getElementById('agenda-cmd') : document.getElementById('cmd');
    
    inputField.placeholder = "> UPLOADING...";
    if(isInternal) inputField.value = "";

    const promises = commands.map(cmd => {
        const cleanCmd = cmd.startsWith('t ') ? cmd.substring(2) : cmd;
        return fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors', // Usiamo no-cors per velocità, ma sappiamo che il server elabora
            body: JSON.stringify({ service: "agenda_add", text: cleanCmd })
        });
    });

    // Aspettiamo un secondo per dare tempo a Google di scrivere sul calendario
    // poi forziamo il ricaricamento dei dati
    Promise.all(promises).then(() => {
        setTimeout(async () => {
            await loadStats(); // Riscarica tutto il JSON (inclusa la nuova agenda)
            loadAgenda();      // Ridisegna la timeline
            inputField.placeholder = isInternal ? "> AGGIUNGI EVENTO..." : "> DIGITA...";
        }, 1500); 
    });
}

function loadAgenda() {
    const container = document.getElementById('events-container');
    
    // Se window.agendaData non esiste ancora (fetch in corso)
    if (typeof window.agendaData === 'undefined') {
        container.innerHTML = "<div style='color:var(--accent); padding:20px;' class='blink'>[ SYNCING_CHRONO... ]</div>";
        
        // Controlla ogni mezzo secondo se i dati sono arrivati
        const checkData = setInterval(() => {
            if (typeof window.agendaData !== 'undefined') {
                clearInterval(checkData);
                loadAgenda(); // Richiama se stessa ora che i dati ci sono
            }
        }, 500);
        return;
    }

    // Ora che siamo sicuri che i dati ci sono (o sono un array vuoto)
    if (window.agendaData.length === 0) {
        container.innerHTML = "<div style='color:var(--dim); padding:20px;'>NESSUN EVENTO RILEVATO (7D_SCAN).</div>";
    } else {
        renderAgenda(window.agendaData);
    }
}

function renderAgenda(days) {
    const container = document.getElementById('events-container');
    if (!days || days.length === 0) {
        container.innerHTML = "<div class='day-label' style='border-right-color:var(--dim)'>CHRONO_EMPTY</div>";
        return;
    }

    container.innerHTML = days.map(day => `
        <div class="day-group">
            <div class="day-label">${day.dateLabel}</div>
            ${day.events.map(ev => `
                <div class="event-node">
                    <div class="event-time">${ev.time}</div>
                    <div class="event-title">${ev.title}</div>
                </div>
            `).join('')}
        </div>
    `).join('');
}

function testAgenda() {
    const mockData = [
        {
            dateLabel: "MER 21 GEN",
            events: [
                { time: "15:30", title: "Configurazione System_OS" },
                { time: "20:00", title: "Test Timeline" }
            ]
        },
        {
            dateLabel: "GIO 22 GEN",
            events: [
                { time: "09:00", title: "Recupero Dati" }
            ]
        }
    ];
    renderAgenda(mockData);
}

async function synthesizeDaily() {
    const prompt = document.getElementById('neural-prompt').value;
    if (!prompt) return;

    const btn = document.querySelector('#neural-input-zone button');
    btn.innerText = "SYNTHESIZING_NEURAL_PATH...";

    try {
        // Prepariamo i dati da mandare al POST
        const payload = {
            service: "smartPlan",
            text: prompt,
            fixed: window.agendaData || [] // Gli eventi caricati da CHRONO_SCAN
        };

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.status === "SUCCESS") {
            renderNeuralTimeline(data.plan);
            document.getElementById('neural-input-zone').style.display = 'none';
            document.getElementById('active-flow-zone').style.display = 'block';
        }
    } catch (e) {
        console.error("Critical Neural Error", e);
        btn.innerText = "LINK_FAILED - RETRY";
    }
}

function renderNeuralTimeline(plan) {
    const container = document.getElementById('daily-timeline-content');
    if (!plan || !Array.isArray(plan)) return;

    container.innerHTML = plan.map((task, i) => {
        const accentColor = task.isFixed ? '#00f3ff' : '#fcee0a';
        // Se il task è completato, applichiamo subito le classi CSS
        const isDone = task.completed;
        
        return `
            <div class="event-node" id="task-${i}" 
                 style="border-left: 2px solid ${accentColor}; margin-bottom: 12px; padding: 10px 15px; 
                        background: rgba(255,255,255,0.03); transition: all 0.4s ease;">
                
                <div style="display: flex; justify-content: space-between; align-items: center; ${isDone ? 'opacity: 0.3; filter: grayscale(1);' : ''}">
                    <div style="flex-grow: 1;">
                        <span style="color: ${accentColor}; font-family: 'Rajdhani'; font-weight: bold; font-size: 11px;">
                            ${task.suggestedTime} </span>
                        <div class="task-text" style="color: #fff; font-size: 14px; margin-top: 2px; ${isDone ? 'text-decoration: line-through;' : ''}">
                            ${task.text}
                        </div>
                    </div>
                    
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <input type="checkbox" ${isDone ? 'checked' : ''} 
                               onclick="toggleTaskVisual(${i})" 
                               style="width: 18px; height: 18px; accent-color: ${accentColor}; cursor:pointer;">
                        <i class="fas fa-grip-vertical" style="color: #222; cursor: move;"></i>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Funzione per il check visivo immediato
function toggleTaskVisual(index) {
    const node = document.querySelector(`#task-${index} > div`);
    const text = node.querySelector('.task-text');
    const checkbox = node.querySelector('input');

    if (checkbox.checked) {
        node.style.opacity = "0.3";
        node.style.filter = "grayscale(1)";
        text.style.textDecoration = "line-through";
    } else {
        node.style.opacity = "1";
        node.style.filter = "none";
        text.style.textDecoration = "none";
    }
}