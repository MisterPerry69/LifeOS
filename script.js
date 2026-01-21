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
    if(pageId === 'agenda') loadAgenda(); // <--- QUESTO MANCAVA!
    
    if(menuOpen) toggleSidebar(); 
}

function toggleMenu() {
    const menu = document.getElementById('side-menu');
    menuOpen = !menuOpen;
    if(menu) menu.style.width = menuOpen ? "180px" : "0";
}

// --- 3. DATA ENGINE (GET) ---

async function loadStats() {
    // Pulisci l'URL da eventuali spazi
    const url = SCRIPT_URL + "?action=getStats&t=" + Date.now();
    
    try {
        const response = await fetch(url, {
            method: 'GET',
            mode: 'cors', // Proviamo a forzare cors
            headers: {
                'Content-Type': 'text/plain;charset=utf-8',
            }
        });

        if (!response.ok) throw new Error('Errore nella risposta del server');

        const data = await response.json();
        console.log("Dati ricevuti con successo:", data);

        if (data.status === "ONLINE") {
            historyData = data.history || [];
            extraItemsGlobal = data.extraDetails || [];
            window.agendaData = data.agenda || []; 
            renderGrid(data);
        }
    } catch (err) {
        console.error("Errore recupero dati:", err);
        testAgenda(); // Carica i finti se fallisce
    }
}

// Variabile globale per contenere le note caricate ed evitare problemi di parsing nell'HTML
let loadedNotesData = [];

let draggedItem = null;

function renderGrid(data) {
    const grid = document.getElementById('keep-grid');
    if (!grid) return;
    grid.innerHTML = "";
    
    // Sincronizziamo i dati globali per l'uso nei filtri e apertura note
    lastStatsData = data; 
    loadedNotesData = data.notes;

    // --- 1. CARD EXTRA (Mostrata solo se filtri ALL/EXTRA e NON stai cercando testo) ---
    const isSearching = typeof searchQuery !== 'undefined' && searchQuery.length > 0;
    
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
        grid.appendChild(extraCard);
    }

    // --- 2. FILTRAGGIO COMBINATO (Categoria + Ricerca Testuale) ---
    const filteredNotes = loadedNotesData.map((note, originalIndex) => ({ note, originalIndex }))
    .filter(item => {
        const title = (item.note[5] || "").toLowerCase();
        const content = (item.note[1] || "").toLowerCase();
        const type = item.note[2];
        
        // A. Controllo Barra di Ricerca
        const matchesSearch = !isSearching || title.includes(searchQuery) || content.includes(searchQuery);
        if (!matchesSearch) return false;

        // B. Controllo Categoria Menu Laterale
        if (currentFilter === 'ALL') return true;
        if (currentFilter === 'PINNED') return type === 'PINNED';
        if (currentFilter === 'NOTE') return type === 'NOTE' && !content.includes('http');
        if (currentFilter === 'LINK') return content.includes('http');
        if (currentFilter === 'EXTRA') return false; // Già gestito dalla card extra sopra
        return true;
    });

    // --- 3. GENERAZIONE DELLE CARD FILTRATE ---
    filteredNotes.forEach((item) => {
        const note = item.note;
        const index = item.originalIndex; 
        const isPinned = note[2] === "PINNED";
        
        const card = document.createElement('div');
        card.className = `keep-card bg-${note[3]} ${isPinned ? 'pinnato' : ''}`;
        card.id = `card-${note[4]}`;
        card.dataset.type = note[2];
        
        // Il Drag & Drop è attivo solo se siamo in "TUTTO" e non stiamo filtrando con la ricerca
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

        // --- EVENTI DRAG & DROP ---
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

        // --- GESTIONE CLICK ---
        card.onclick = () => {
            if (!card.classList.contains('dragging')) openNoteByIndex(index);
        };

        grid.appendChild(card);
    });
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

function sendCmd(event) {
    if (event.key === 'Enter') {
        const input = event.target;
        const val = input.value.trim();
        if (!val) return;
        
// SE INIZIA CON "t ", VAI ALL'AGENDA
        if (val.toLowerCase().startsWith('t ')) {
            handleAgendaCommand(val);
            input.value = "";
            input.placeholder = "> CHRONO AGGIORNATO.";
            setTimeout(() => input.placeholder = "> DIGITA...", 1000);
            return; // Esci, non serve procedere con le note
        }


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
    searchQuery = document.getElementById('search-input').value.toLowerCase();
    // Chiamiamo renderGrid passando i dati che abbiamo già
    if (lastStatsData) {
        renderGrid(lastStatsData);
    }
}

function toggleSearch(show) {
    const wrapper = document.getElementById('search-wrapper');
    const input = document.getElementById('search-input');
    const title = document.getElementById('dump-title');
    const trigger = document.getElementById('search-trigger');

    if (show) {
        title.style.opacity = "0"; // Sparisce il titolo
        trigger.style.opacity = "0"; // Sparisce la lente
        wrapper.classList.add('active');
        setTimeout(() => input.focus(), 400);
    } else {
        if (input.value === "") {
            wrapper.classList.remove('active');
            setTimeout(() => {
                title.style.opacity = "1";
                trigger.style.opacity = "1";
            }, 300);
        }
    }
}


//AGENDA

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
    container.innerHTML = ""; // Pulisce il caricamento

    days.forEach(day => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-group';
        
        let eventsHtml = '';
        day.events.forEach(ev => {
            eventsHtml += `
                <div class="event-node">
                    <div class="event-time">${ev.time}</div>
                    <div class="event-title">${ev.title}</div>
                </div>
            `;
        });

        dayDiv.innerHTML = `
            <div class="day-label">${day.dateLabel}</div>
            ${eventsHtml}
        `;
        container.appendChild(dayDiv);
    });
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