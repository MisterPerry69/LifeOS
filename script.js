/**
 * SYSTEM_OS - CORE JAVASCRIPT (FIXED)
 * Fix problemi loadStats e window.onload
 */

// ============================================
// 1. CONFIGURAZIONE E STATO GLOBALE
// ============================================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwo10TaL8bjFh-qDTURMniGM0jHzWr4D5MeAJpyXlvqcDq7oietjxGpIhFZAoN8TMLP/exec";

// Stato applicazione centralizzato
let historyData = [];
let extraItemsGlobal = [];
let loadedNotesData = [];
let lastStatsData = null;
let currentNoteData = null;
let currentView = 30;
let currentFilter = 'ALL';
let searchQuery = "";
let currentMonthOffset = 0;
let detailMonthOffset = 0;
let draggedItem = null;
let charts = {};
let deleteTarget = null;
let currentReviews = [];


// ============================================
// 2. CORE & NAVIGATION
// ============================================

window.onload = async () => {
    updateClock();
    setInterval(updateClock, 1000);
    
    await runBootSequence();
    
    // FIX: Carica i dati PRIMA di nascondere boot screen
    try {
        await loadStats();
    } catch (err) {
        console.error("ERRORE_BOOT_STATS:", err);
    }
    
    // Nascondi boot screen solo DOPO che i dati sono caricati
    setTimeout(() => {
        const boot = document.getElementById('boot-screen');
        if(boot) boot.style.display = 'none';
    }, 500);
    
    // FIX: Event listener con controllo null - DOPO che il DOM è pronto
    setTimeout(() => {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('blur', function() {
                if (this.value === "") {
                    toggleSearch(false);
                }
            });
        }
        
        // FIX: Event listener Finance Input
        const financeInput = document.getElementById('finance-input');
        if (financeInput) {
            financeInput.addEventListener('keypress', handleFinanceSubmit);
            financeInput.addEventListener('blur', () => {
                setTimeout(() => toggleFinanceInput(false), 200);
            });
        }
    }, 100);
};

async function bootLog(text, delay = 150) {
    const logEl = document.getElementById('boot-text');
    if (logEl) {
        logEl.innerHTML += `> ${text}<br>`;
        logEl.scrollTop = logEl.scrollHeight;
    }
    return new Promise(res => setTimeout(res, delay));
}

async function runBootSequence() {
    await bootLog("INITIALIZING SYSTEM_OS...", 300);
    await bootLog("LOADING KERNEL MODULES...", 200);
    await bootLog("ESTABLISHING CONNECTION TO GAS_ENGINE...", 400);
    await bootLog("FETCHING USER_DATA FROM SPREADSHEET...", 100);
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
    
    if(pageId === 'habit') drawPixels(historyData);
    if(pageId === 'agenda') loadAgenda();
}

function toggleMenu() {
    const menu = document.getElementById('side-menu');
    const isOpen = menu && menu.style.width !== "0";
    if(menu) menu.style.width = isOpen ? "0" : "180px";
}

// ============================================
// 3. DATA ENGINE (GET) - FIX COMPLETO
// ============================================

async function loadStats() {
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getStats&t=${Date.now()}`);
        
        // FIX: Controllo risposta prima di parsare
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // FIX: Controllo status PRIMA di usare i dati
        if (data.status !== "ONLINE") {
            console.warn("Server non online:", data);
            return;
        }

        // --- AGGIORNA VARIABILI GLOBALI (Aggiungi qui sotto) ---
        historyData = data.history || [];
        extraItemsGlobal = data.extraDetails || [];
        window.agendaData = data.agenda || [];
        loadedNotesData = data.notes || [];
        lastStatsData = data;

        // AGGIUNGI QUESTE DUE RIGHE:
        allReviews = data.reviews || []; // Salva le review dal server
        renderReviews(allReviews);
        
        // Render griglia note
        renderGrid(data);
        
        // Render agenda se attiva
        if (document.getElementById('agenda')?.classList.contains('active')) {
            renderAgenda(window.agendaData);
        }

        // --- BLOCCO FINANCE CON CONTROLLI NULL ---
        if (data.finance) {
            // 1. Widget home
            const widgetSpent = document.getElementById('widget-spent');
            const widgetCash = document.getElementById('widget-cash');
            if (widgetSpent) widgetSpent.innerText = data.finance.spent || "0.00";
            if (widgetCash) widgetCash.innerText = data.finance.cash || "--";

            // 2. Pagina Finance - Saldi
            const totalEl = document.getElementById('total-balance');
            const bankEl = document.getElementById('bank-val');
            const cashEl = document.getElementById('cash-val');
            
            if (totalEl) totalEl.innerText = (data.finance.total || "0") + " €";
            if (bankEl) bankEl.innerText = (data.finance.bank || "0") + " €";
            if (cashEl) cashEl.innerText = (data.finance.cash || "0") + " €";

            // 3. Burn Rate Bar
            const inc = parseFloat(data.finance.income) || 0;
            const out = parseFloat(data.finance.spent) || 0;
            const fill = document.getElementById('efficiency-fill');
            const infoText = document.getElementById('burn-info-text');

            if (fill && infoText) {
                if (inc > 0) {
                    const lifePct = Math.max(0, ((inc - out) / inc) * 100);
                    const spentPct = ((out / inc) * 100).toFixed(1);
                    
                    fill.style.width = lifePct + "%";
                    fill.style.background = lifePct < 20 ? "#ff4d4d" : "var(--accent)";
                    infoText.innerText = `STAI_SPENDENDO_IL_${spentPct}%_DELLE_TUE_ENTRATE`;
                } else {
                    fill.style.width = "0%";
                    fill.style.background = "#ff4d4d";
                    infoText.innerText = "NESSUNA_ENTRATA_RILEVATA";
                }
            }

            // 4. Log Transazioni
            if (data.finance.transactions) {
                renderFinanceLog(data.finance.transactions);
            }
        }
        
    } catch (err) {
        console.error("ERRORE_CRITICO_SYNC:", err);
        // FIX: Mostra errore all'utente invece di crashare silenziosamente
        const widgetNotes = document.getElementById('widget-notes');
        if (widgetNotes) widgetNotes.innerText = "ERR";
    }
}

function renderGrid(data) {
    const grid = document.getElementById('keep-grid');
    if (!grid) return;
    
    lastStatsData = data;
    loadedNotesData = data.notes || [];

    // FIX: Controlli null prima di aggiornare
    const widgetNotes = document.getElementById('widget-notes');
    const widgetWeight = document.getElementById('widget-weight');
    
    if (widgetNotes) widgetNotes.innerText = (loadedNotesData.length + 1);
    if (widgetWeight) widgetWeight.innerText = data.weight || "94.5";

    const fragment = document.createDocumentFragment();
    const isSearching = searchQuery.length > 0;
    
    // Card EXTRA pinnata
    if ((currentFilter === 'ALL' || currentFilter === 'EXTRA') && !isSearching) {
        const extraCard = document.createElement('div');
        extraCard.className = "keep-card bg-default extra-card pinnato";
        extraCard.innerHTML = `
            <div class="pin-indicator" style="color:var(--accent)"><i class="fas fa-thumbtack"></i></div>
            <div class="title-row" style="color:var(--accent)">TOTAL_EXTRA</div>
            <div style="font-size: 28px; color: var(--accent); margin: 5px 0;">${data.extraTotal || 0}h</div>
            <div class="label" style="opacity:0.5">${data.monthLabel || ''}</div>
        `;
        extraCard.onclick = () => openExtraDetail();
        fragment.appendChild(extraCard);
    }

    // Filtraggio e ordinamento note
    const filteredNotes = loadedNotesData
        .map((note, originalIndex) => ({ note, originalIndex }))
        .filter(item => {
            const title = String(item.note.title || "").toLowerCase();
            const content = String(item.note.date || "").toLowerCase();
            const type = item.note.type;
            const searchLower = searchQuery.toLowerCase();
            
            const matchesSearch = !isSearching || title.includes(searchLower) || content.includes(searchLower);
            if (!matchesSearch) return false;

            if (currentFilter === 'ALL') return true;
            if (currentFilter === 'PINNED') return type === 'PINNED';
            if (currentFilter === 'NOTE') return type === 'NOTE' && !content.includes('http');
            if (currentFilter === 'LINK') return content.includes('http');
            if (currentFilter === 'EXTRA') return false;
            if (currentFilter === 'ARCHIVE') return note.type === 'NOTE';
            return true;
        })
        .sort((a, b) => {
            if (currentFilter === 'ALL' && !isSearching) {
                if (a.note.type === "PINNED" && b.note.type !== "PINNED") return -1;
                if (a.note.type !== "PINNED" && b.note.type === "PINNED") return 1;
            }
            return 0;
        });

    // Generazione card
    filteredNotes.forEach((item) => {
    const note = item.note;  // Ora note è un OGGETTO
    const index = item.originalIndex;
    const isPinned = note.type === "PINNED";  // Usa .type invece di note[2]
    
    const card = document.createElement('div');
    card.className = `keep-card bg-${note.color} ${isPinned ? 'pinnato' : ''}`;  // .color invece di note[3]
    card.id = `card-${note.id}`;  // .id invece di note[4]
    card.dataset.type = note.type;  // .type invece di note[2]
    
    const isDraggable = (currentFilter === 'ALL' && !isSearching);
    card.draggable = isDraggable;

    card.innerHTML = `
        ${isPinned ? `<div class="pin-indicator" onclick="event.stopPropagation(); togglePinFromCard('${note.id}')"><i class="fas fa-thumbtack"></i></div>` : ''}
        <div class="title-row">${(note.title || "NOTA").toUpperCase()}</div>
        <div class="content-preview">${note.content}</div>
        <div class="label" style="font-size:9px; margin-top:5px; opacity:0.4;">
            ${new Date(note.date).toLocaleDateString('it-IT', {day:'2-digit', month:'short'})}
        </div>
    `;

    // Eventi Drag & Drop (resto del codice rimane uguale)
    card.ondragstart = (e) => {
        if (!isDraggable) {
            e.preventDefault();
            return;
        }
        draggedItem = card;
        card.classList.add('dragging');
    };

        card.ondragend = () => {
            card.classList.remove('dragging');
            document.querySelectorAll('.keep-card').forEach(c => c.classList.remove('drag-over'));
            if (isDraggable) saveNewOrder();
        };

        card.ondragover = (e) => e.preventDefault();

        card.ondragenter = () => {
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
    if (!card.classList.contains('dragging')) openNoteByIndex(index); // Torna ad usare index
};

        fragment.appendChild(card);
    });

    grid.innerHTML = "";
    grid.appendChild(fragment);
}

// Funzione di supporto per la data
function formattaData(d) {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}


// Funzione Delete (Aggiornata per ID)
function confirmDelete(id, type, event) {
    if(event) event.stopPropagation();
    
    if(confirm("ELIMINARE DEFINITIVAMENTE QUESTA NOTA?")) {
        executeDeleteSecure(id, type);
    }
}

async function executeDeleteSecure(id, type) {
    // Feedback visivo immediato: Nascondi la card
    const card = document.getElementById(`card-${id}`);
    if(card) card.style.display = 'none';

    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
            service: "delete_item",
            id: id, 
            type: type
        })
    });
    
    // Non serve ricaricare tutto se l'abbiamo nascosta, ma è meglio per sicurezza
    setTimeout(() => loadStats(), 1000); 
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

// ============================================
// 4. COMMAND CENTER (POST)
// ============================================

async function sendCmd(event) {
    if (event.key !== 'Enter') return;
    
    const input = event.target;
    const val = input.value.trim();
    if (!val) return;

    // Finance command
    if (val.startsWith('-') || val.startsWith('spesa ')) {
        handleFinanceCommand(val);
        input.value = "";
        return;
    }

    // Optimistic UI per note normali
    if (!val.toLowerCase().startsWith('t ') && !val.includes('+')) {
        const grid = document.getElementById('keep-grid');
        if (grid) {
            const tempCard = document.createElement('div');
            tempCard.className = "keep-card bg-default blink temp-note";
            tempCard.innerHTML = `
                <div class="title-row">SYNCING...</div>
                <div class="content-preview">${val}</div>
                <div class="label" style="font-size:9px; opacity:0.4;">JUST NOW</div>
            `;
            const lastPinned = grid.querySelector('.pinnato:last-of-type');
            if (lastPinned) {
                lastPinned.after(tempCard);
            } else {
                grid.prepend(tempCard);
            }
        }
    }

    input.value = "";
    input.placeholder = "> SYNC_STARTING...";
    
    let service = "note";
    if (val.toLowerCase().startsWith('t ')) service = "agenda_add";
    else if (/^\+(\d+(\.\d+)?)$/.test(val) || val.toLowerCase().startsWith('ieri+')) service = "extra_hours";

    try {
        fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ service: service, text: val })
        });

        input.placeholder = "> COMMAND_SENT.";
        
        setTimeout(async () => {
            await loadStats();
            const noteDetail = document.getElementById('note-detail');
            if (noteDetail && noteDetail.style.display === 'flex' && service === "extra_hours") {
                openExtraDetail();
            }
        }, 3000);

    } catch (e) {
        input.placeholder = "!! SYNC_ERROR !!";
    }
    
    setTimeout(() => {
        input.placeholder = "> DIGITA...";
        input.focus();
    }, 1500);
}


// FIX: Rinominata per evitare conflitti
function handleFinanceCommand(rawText) {
    console.log("Finance command:", rawText);
    // Implementazione base - da espandere
    fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ service: "finance_add", text: rawText })
    });
}

// ============================================
// 5. UI MODALS & ACTIONS
// ============================================

function openNoteByIndex(index) {
    const note = loadedNotesData[index];
    if (!note) return;

    // FIX: Usa proprietà oggetto invece di array
    currentNoteData = { 
        id: note.id, 
        type: note.type, 
        color: note.color, 
        index: index 
    };
    
    const modal = document.getElementById('note-detail');
    const colorBtn = document.querySelector('.color-selector-container');
    const pinTool = document.querySelector('.tool-icon i.fa-thumbtack')?.parentElement;
    const pinIcon = document.querySelector('.tool-icon i.fa-thumbtack');
    const detailType = document.getElementById('detail-type');
    const detailText = document.getElementById('detail-text');
    const detailExtraList = document.getElementById('detail-extra-list');
    const backdrop = document.getElementById('modal-backdrop');

    if (!modal || !detailType || !detailText || !detailExtraList) return;

    if(colorBtn) colorBtn.style.display = "block";
    if(pinTool) pinTool.style.display = "flex";
    
    detailType.innerText = note.title || "NOTA";
    detailText.value = note.content;
    detailText.style.display = "block";
    detailExtraList.style.display = "none";
    
    if(pinIcon) pinIcon.style.color = (note.type === "PINNED") ? "var(--accent)" : "var(--dim)";

    modal.className = `note-overlay bg-${note.color}`;
    modal.style.display = 'flex';
    if (backdrop) backdrop.style.display = 'block';
}

function openExtraDetail() {
    currentNoteData = { type: "EXTRA" };
    const modal = document.getElementById('note-detail');
    const list = document.getElementById('detail-extra-list');
    
    if (!modal || !list) return;

    const colorTool = document.querySelector('.color-selector-container');
    const pinTool = document.querySelector('.tool-icon i.fa-thumbtack')?.parentElement;
    if(colorTool) colorTool.style.display = "none";
    if(pinTool) pinTool.style.display = "none";

    const now = new Date();
    const viewDate = new Date(now.getFullYear(), now.getMonth() + detailMonthOffset, 1);
    const targetMonth = viewDate.getMonth();
    const targetYear = viewDate.getFullYear();
    const monthLabel = viewDate.toLocaleString('it-IT', { month: 'long', year: 'numeric' }).toUpperCase();

    document.getElementById('detail-type').innerHTML = `
        <div style="display:flex; align-items:center; gap:15px; justify-content:center; width:100%">
            <i class="fas fa-chevron-left" id="prevMonth" style="cursor:pointer; padding:10px;"></i>
            <span>RECAP: ${monthLabel}</span>
            <i class="fas fa-chevron-right" id="nextMonth" style="cursor:pointer; padding:10px;"></i>
        </div>
    `;

    document.getElementById('detail-text').style.display = "none";
    list.style.display = "block";

    try {
        const filteredExtra = (extraItemsGlobal || []).filter(item => {
            const d = new Date(item.data);
            return !isNaN(d.getTime()) && d.getMonth() === targetMonth && d.getFullYear() === targetYear;
        }).sort((a, b) => new Date(b.data) - new Date(a.data));

        const monthTotal = filteredExtra.reduce((acc, curr) => acc + (parseFloat(curr.ore) || 0), 0);

        if (filteredExtra.length === 0) {
            list.innerHTML = `<div style="text-align:center; opacity:0.3; padding:40px;">[ NESSUN_DATO ]</div>`;
        } else {
            let html = `
                <div style="margin-bottom:15px; padding:15px; background:rgba(0,212,255,0.1); border:1px solid var(--accent); border-radius:4px; text-align:center;">
                    <span style="font-size:10px; opacity:0.6; display:block">TOTALE_ORE</span>
                    <span style="font-size:24px; color:var(--accent); font-weight:bold">${monthTotal.toFixed(1)}h</span>
                </div>`;
            
            html += filteredExtra.map(item => `
                <div class="extra-item-row" style="display:flex; justify-content:space-between; align-items:center; padding:12px; border-bottom:1px solid #222;">
                    <span>${new Date(item.data).toLocaleDateString('it-IT', {day:'2-digit', month:'short'})} ➔ <b style="color:var(--accent)">+${item.ore}h</b></span>
                    <span style="font-size:10px; opacity:0.4;">${item.nota || ''}</span>
                </div>`).join('');
            list.innerHTML = html;
        }
    } catch (err) {
        list.innerHTML = "ERRORE_SYNC";
    }

    modal.className = 'note-overlay extra-card';
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';

    // FIX: Aggiungi event listener solo se elementi esistono
    const prevMonth = document.getElementById('prevMonth');
    const nextMonth = document.getElementById('nextMonth');
    if (prevMonth) prevMonth.onclick = (e) => { e.stopPropagation(); changeDetailMonth(-1); };
    if (nextMonth) nextMonth.onclick = (e) => { e.stopPropagation(); changeDetailMonth(1); };
}

function changeDetailMonth(delta) {
    const newOffset = detailMonthOffset + delta;
    if (newOffset > 0) return;
    
    detailMonthOffset = newOffset;
    openExtraDetail();
}

function closeNoteDetail(forceSave = true) {
    const modal = document.getElementById('note-detail');
    const textArea = document.getElementById('detail-text');
    const backdrop = document.getElementById('modal-backdrop');
    
    if (!modal || modal.style.display === 'none') return;

    if (forceSave && currentNoteData && currentNoteData.id && currentNoteData.type !== "EXTRA") {
        const newText = textArea.value.trim();
        const oldNote = loadedNotesData[currentNoteData.index];

        // FIX: Salva SEMPRE se c'è un id valido, senza confrontare
        if (oldNote) {
            oldNote.content = newText;
            oldNote.color = currentNoteData.color;
            renderGrid(lastStatsData);
        }

        // FIX: Manda SEMPRE la fetch (il server farà il confronto se vuoi)
        fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({
                service: "update_note",
                id: currentNoteData.id,
                text: newText,
                color: currentNoteData.color
            })
        });
    }

    modal.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
    
    const colorPicker = document.getElementById('color-picker-bubble');
    const deleteModal = document.getElementById('delete-modal');
    if (colorPicker) colorPicker.style.display = 'none';
    if (deleteModal) deleteModal.style.display = 'none';
    
    currentNoteData = null;
    detailMonthOffset = 0;
}

function saveAndClose() {
    closeNoteDetail(true);
}

function closeModal() {
    closeNoteDetail(false);
}

function toggleColorPicker() {
    const picker = document.getElementById('color-picker-bubble');
    if (picker) picker.style.display = (picker.style.display === 'flex') ? 'none' : 'flex';
}

function changeNoteColor(color) {
    if (!currentNoteData) return;
    
    // Aggiorna currentNoteData
    currentNoteData.color = color;
    
    // Aggiorna modal
    const modal = document.getElementById('note-detail');
    if (modal) modal.className = `note-overlay bg-${color}`;
    
    // FIX: Aggiorna anche l'oggetto in loadedNotesData
    const note = loadedNotesData[currentNoteData.index];
    if (note) {
        note.color = color; // Salva locale
    }
    
    // FIX: Aggiorna card immediatamente
    const card = document.getElementById(`card-${currentNoteData.id}`);
    if (card) {
        card.className = `keep-card bg-${color}${currentNoteData.type === 'PINNED' ? ' pinnato' : ''}`;
    }
}

// IL PIN CHE FUNZIONA
async function togglePin() {
    if (!currentNoteData || currentNoteData.type === "EXTRA") return;

    const nuovoStato = (currentNoteData.type === "PINNED") ? "NOTE" : "PINNED";
    currentNoteData.type = nuovoStato;
    
    // FIX: Aggiorna anche loadedNotesData
    const note = loadedNotesData[currentNoteData.index];
    if (note) {
        note.type = nuovoStato;
    }
    
    const pinIcon = document.querySelector('.tool-icon i.fa-thumbtack');
    if (pinIcon) pinIcon.style.color = (nuovoStato === "PINNED") ? "var(--accent)" : "var(--dim)";

    await fetch(SCRIPT_URL, {
        method: 'POST', 
        mode: 'no-cors',
        body: JSON.stringify({ 
            service: "update_note_type", 
            id: currentNoteData.id, 
            type: nuovoStato 
        })
    });
    
    renderGrid(lastStatsData); // Aggiorna griglia
}

async function togglePinFromCard(id) {
    const noteIndex = loadedNotesData.findIndex(n => String(n.id) === String(id));
    if (noteIndex === -1) return;
    
    const note = loadedNotesData[noteIndex];
    const newType = note.type === "PINNED" ? "NOTE" : "PINNED";

    // Ottimistica: cambia subito
    note.type = newType;
    renderGrid(lastStatsData);

    // Salva su server
    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ 
            service: "update_note_type", 
            id: id, 
            type: newType 
        })
    });
}

function confirmDelete(id, type) {
    deleteTarget = { id, type };
    const deleteModal = document.getElementById('delete-modal');
    if (deleteModal) deleteModal.style.display = 'flex';
}

function cancelDelete() {
    deleteTarget = null;
    const deleteModal = document.getElementById('delete-modal');
    if (deleteModal) deleteModal.style.display = 'none';
}

async function executeDelete() {
    if (!deleteTarget) return;
    
    const deleteModal = document.getElementById('delete-modal');
    if (deleteModal) deleteModal.style.display = 'none';
    
    // 1. CHIUDI SUBITO IL MODAL DELLA NOTA
    const noteModal = document.getElementById('note-detail');
    const backdrop = document.getElementById('modal-backdrop');
    if (noteModal) noteModal.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
    
    // 2. NASCONDI LA CARD IMMEDIATAMENTE (UI Ottimistica)
    const card = document.getElementById(`card-${deleteTarget.id}`);
    if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        card.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
            card.style.display = 'none';
        }, 300);
    }
    
    // 3. RIMUOVI DALLA MEMORIA LOCALE (evita il reset colori)
    const indexToRemove = loadedNotesData.findIndex(n => String(n.id) === String(deleteTarget.id));
    if (indexToRemove !== -1) {
        loadedNotesData.splice(indexToRemove, 1);
    }
    
    // 4. SALVA SU SERVER IN BACKGROUND (no await!)
    fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
            service: "delete_item",
            id: deleteTarget.id,
            type: deleteTarget.type
        })
    }).then(() => {
        console.log("Nota cancellata dal server");
    }).catch(err => {
        console.error("Errore cancellazione:", err);
        // Se fallisce, ricarica per sicurezza
        loadStats();
    });
    
    // 5. RESET
    currentNoteData = null;
    deleteTarget = null;
}

// ============================================
// 6. SIDEBAR & FILTERS
// ============================================

function toggleSidebar() {
    const menu = document.getElementById('side-menu');
    const backdrop = document.getElementById('menu-backdrop');
    if (!menu || !backdrop) return;

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
    
    document.querySelectorAll('.menu-item').forEach(item => item.classList.remove('active'));
    if (el) el.classList.add('active');
    
    toggleSidebar();
    
    if (lastStatsData) {
        renderGrid(lastStatsData);
    }
}

function handleSearch() {
    const input = document.getElementById('search-input');
    searchQuery = (input.value || "").toLowerCase();
    if (lastStatsData) renderGrid(lastStatsData);
}

function toggleSearch(show) {
    const wrapper = document.getElementById('search-wrapper');
    const input = document.getElementById('search-input');
    const title = document.getElementById('dump-title');
    const trigger = document.getElementById('search-trigger');

    if (!wrapper || !input || !title || !trigger) return;

    if (show) {
        wrapper.classList.add('active');
        trigger.classList.add('hidden');
        title.style.opacity = "0";
        setTimeout(() => input.focus(), 400);
    } else {
        if (input.value === "") {
            wrapper.classList.remove('active');
            trigger.classList.remove('hidden');
            setTimeout(() => { title.style.opacity = "1"; }, 300);
            searchQuery = "";
            if (lastStatsData) renderGrid(lastStatsData);
        }
    }
}

// ============================================
// 7. HABIT TRACKER (PIXELS)
// ============================================

function drawPixels(history = []) {
    const container = document.getElementById('pixels');
    if(!container) return;
    
    container.innerHTML = '';
    container.className = 'grid-' + currentView;

    const labels = { 7: "SETTIMANA", 30: "MESE", 365: "ANNO" };
    const viewLabel = document.getElementById('viewLabel');
    if (viewLabel) viewLabel.innerText = labels[currentView];

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

// ============================================
// 8. AGENDA
// ============================================

function handleAgendaCommand(input, isInternal = false) {
    if (!input.trim()) return;
    
    const commands = input.split('/').map(s => s.trim());
    const inputField = isInternal ? document.getElementById('agenda-cmd') : document.getElementById('cmd');
    
    if (!inputField) return;
    
    inputField.placeholder = "> UPLOADING...";
    if(isInternal) inputField.value = "";

    const promises = commands.map(cmd => {
        const cleanCmd = cmd.startsWith('t ') ? cmd.substring(2) : cmd;
        return fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ service: "agenda_add", text: cleanCmd })
        });
    });

    Promise.all(promises).then(() => {
        setTimeout(async () => {
            await loadStats();
            loadAgenda();
            inputField.placeholder = isInternal ? "> AGGIUNGI EVENTO..." : "> DIGITA...";
        }, 1500);
    });
}

function loadAgenda() {
    const container = document.getElementById('events-container');
    if (!container) return;
    
    if (typeof window.agendaData === 'undefined') {
        container.innerHTML = "<div style='color:var(--accent); padding:20px;' class='blink'>[ SYNCING_CHRONO... ]</div>";
        
        const checkData = setInterval(() => {
            if (typeof window.agendaData !== 'undefined') {
                clearInterval(checkData);
                loadAgenda();
            }
        }, 500);
        return;
    }

    if (window.agendaData.length === 0) {
        container.innerHTML = "<div style='color:var(--dim); padding:20px;'>NESSUN EVENTO RILEVATO (7D_SCAN).</div>";
    } else {
        renderAgenda(window.agendaData);
    }
}

function renderAgenda(days) {
    const container = document.getElementById('events-container');
    if (!container || !days || days.length === 0) {
        if (container) container.innerHTML = "<div class='day-label' style='border-right-color:var(--dim)'>CHRONO_EMPTY</div>";
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

async function synthesizeDaily() {
    const prompt = document.getElementById('neural-prompt');
    if (!prompt || !prompt.value) return;

    const btn = document.querySelector('#neural-input-zone button');
    if (btn) btn.innerText = "SYNTHESIZING_NEURAL_PATH...";

    try {
        const payload = {
            service: "smartPlan",
            text: prompt.value,
            fixed: window.agendaData || []
        };

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.status === "SUCCESS") {
            renderNeuralTimeline(data.plan);
            const neuralZone = document.getElementById('neural-input-zone');
            const flowZone = document.getElementById('active-flow-zone');
            if (neuralZone) neuralZone.style.display = 'none';
            if (flowZone) flowZone.style.display = 'block';
        }
    } catch (e) {
        console.error("Critical Neural Error", e);
        if (btn) btn.innerText = "LINK_FAILED - RETRY";
    }
}

function renderNeuralTimeline(plan) {
    const container = document.getElementById('daily-timeline-content');
    if (!container || !plan || !Array.isArray(plan)) return;

    container.innerHTML = plan.map((task, i) => {
        const accentColor = task.isFixed ? '#00f3ff' : '#fcee0a';
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

function toggleTaskVisual(index) {
    const node = document.querySelector(`#task-${index} > div`);
    if (!node) return;
    
    const text = node.querySelector('.task-text');
    const checkbox = node.querySelector('input');

    if (checkbox && checkbox.checked) {
        node.style.opacity = "0.3";
        node.style.filter = "grayscale(1)";
        if (text) text.style.textDecoration = "line-through";
    } else {
        node.style.opacity = "1";
        node.style.filter = "none";
        if (text) text.style.textDecoration = "none";
    }
}

// ============================================
// 9. FINANCE
// ============================================

async function handleFinanceSubmit(event) {
    if (event.key !== 'Enter') return;
    const input = document.getElementById('finance-input');
    const rawText = input.value.trim();
    if (!rawText) return;

    // 1. UI: Chiudi input e mostra l'analista che "lavora"
    input.blur();
    toggleFinanceInput(false);
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    text.innerText = "NEURAL_PROCESSING_IN_PROGRESS...";
    bubble.classList.add('active');
    input.value = '';

    try {
        // Riconoscimento wallet semplice: se scrivi *c nel testo usa CASH, altrimenti BANK
        const textLower = rawText.toLowerCase();
        let targetWallet = "BANK"; // Default

        // Riconoscimento intelligente
        if (textLower.includes('*c') || textLower.includes('cash') || textLower.includes('contanti')) {
            targetWallet = "CASH";
        } else if (textLower.includes('*b') || textLower.includes('bank') || textLower.includes('banca')) {
            targetWallet = "BANK";
        }
        
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                service: "finance_smart_entry",
                text: rawText,
                wallet: targetWallet
            })
        });

        // Leggiamo la risposta come testo prima per evitare il crash del "Unexpected Token E"
        const responseData = await response.text();
        
        try {
            const result = JSON.parse(responseData);
            if (result.status === "SUCCESS") {
                text.innerText = result.advice.toUpperCase(); // Il commento cinico
                // 2. Ricarica i dati per aggiornare saldo e HP bar
                if (typeof loadStats === "function") await loadStats();
            } else {
                text.innerText = "DANGER: " + (result.message || "SYNC_ERROR");
            }
        } catch (e) {
            // Se arriviamo qui, il server ha mandato un errore testuale (quello che inizia con "E")
            console.error("Server Error Raw:", responseData);
            text.innerText = "CRITICAL_ERROR: APPS_SCRIPT_CRASHED";
        }

    } catch (err) {
        text.innerText = "CONNECTION_LOST: SYNC_FAILED";
        console.error(err);
    }
    
    // 3. Chiudi l'analista dopo 6 secondi
    setTimeout(() => bubble.classList.remove('active'), 6000);
}

function toggleAnalyst() {
    const bubble = document.getElementById('analyst-bubble');
    const inputZone = document.getElementById('finance-input-zone');
    
    // Chiudi l'input se è aperto
    inputZone.classList.remove('active');
    
    // Toggle Analista
    bubble.classList.toggle('active');
}

function toggleFinanceInput(show) {
    const inputZone = document.getElementById('finance-input-zone');
    const input = document.getElementById('finance-input');
    
    if (show) {
        inputZone.style.display = 'block'; // Prima lo rendi disponibile
        setTimeout(() => {
            inputZone.classList.add('active');
            input.focus();
        }, 10);
    } else {
        input.blur(); // CHIUDE LA TASTIERA
        inputZone.classList.remove('active');
        setTimeout(() => inputZone.style.display = 'none', 300);
    }
}

const financeIcons = {
    "CIBO": "utensils", 
    "SPESA": "shopping-cart", 
    "SVAGO": "gamepad-2",
    "CASA": "home", 
    "SALUTE": "heart", 
    "TRASPORTI": "car", 
    "LAVORO": "briefcase"
};

function renderFinanceLog(transactions) {
    const log = document.getElementById('finance-log');
    if (!log) return;
    
    const financeIcons = {
        "CIBO": "utensils", "SPESA": "shopping-cart", "SVAGO": "gamepad-2",
        "CASA": "home", "SALUTE": "heart", "TRASPORTI": "car", "LAVORO": "briefcase"
    };

    log.innerHTML = transactions.map(t => {
        const iconName = financeIcons[t.cat] || "arrow-right-left";
        const hasNote = t.note && t.note !== "";
        const color = t.amt < 0 ? "#ff0055" : "#00ff88"; // Testi rossi per uscite, verdi per entrate

        return `
        <div class="trans-row" style="display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid #525252;">
            <span style="font-size: 10px; color: var(--dim); min-width: 35px;">${t.date}</span>
            
            <i data-lucide="${iconName}" style="width: 16px; color: #fff; opacity: 0.8;"></i>
            
            <div style="flex: 1; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: 500; color: #fff; text-transform: uppercase;">${t.desc}</span>
                ${hasNote ? `<i data-lucide="info" 
       onclick="showTransactionNote('${t.note}', '${t.desc}', '${t.advice}')" 
       style="width: 14px; height: 14px; color: var(--accent); flex-shrink: 0; cursor: pointer; margin-left: 5px;">
    </i>` : ''}
            </div>
            
            <span style="color: ${color}; font-family: 'Rajdhani'; font-weight: 700; font-size: 13px;">
                ${t.amt > 0 ? '+' : ''}${parseFloat(t.amt).toFixed(2)}€
            </span>
        </div>`;
    }).join('');
    
    if (window.lucide) lucide.createIcons();
}

async function showTransactionNote(noteText, description, advice) { // <--- Aggiunto description qui
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    if (!bubble || !text) return;

    // Forza la riattivazione se era già aperto
    bubble.classList.remove('active');
    void bubble.offsetWidth; 
    bubble.classList.add('active');

    // 1. Mostra subito i dati locali
    text.innerHTML = `
        <div style="font-size: 0.7rem; color: var(--dim); margin-bottom: 4px;">USER_NOTE_CONTENT_about </div>
        <div style="color: var(--accent); font-size: 0.9rem; font-weight: bold; margin-bottom: 4px;">
            ${(description || 'TRANSACTION').toUpperCase()}
        </div>
        <div style="color: #fff; font-style: italic; margin-bottom: 12px; border-left: 2px solid #444; padding-left: 8px; font-size: 0.85rem;">
            "${(noteText || 'NESSUNA NOTA').toUpperCase()}"
        </div>
        <div style="margin-top: 10px; border-top: 1px dashed #333; padding-top: 10px;">
            <span style="font-size: 0.7rem; color: var(--dim);">PREVIOUS_ANALYSIS:</span><br>
            <span style="color: var(--accent); font-weight: bold;">"${(advice || 'NESSUN COMMENTO ARCHIVIATO').toUpperCase()}"</span>
        </div>
    `;
/* 
    // 2. Chiamata all'AI
    const prompt = `Fai un breve, cinico (ma non troppo) e divertente commento sulla descrizione di questa transazione: "${description, noteText}"`;
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=ai_interpret&text=${encodeURIComponent(prompt)}`);
        const aiResponse = await response.text();
        
        const typingElem = document.getElementById('ai-typing');
        if(typingElem) {
            typingElem.innerHTML = `
                <span style="font-size: 0.7rem; color: var(--dim);">ANALYSIS:</span><br>
                <span style="color: var(--accent); font-weight: bold;">"${aiResponse.toUpperCase()}"</span>
            `;
        }
    } catch (e) {
        const typingElem = document.getElementById('ai-typing');
        if(typingElem) typingElem.innerText = "ERROR: NEURAL_LINK_DOWN";
    } */
    
    // Chiudi dopo un po'
    setTimeout(() => bubble.classList.remove('active'), 8000);
}

let allTransactions = []; // Da riempire durante il loadStats

// Apre l'overlay e resetta
function toggleFilters(show) {
    const overlay = document.getElementById('filter-overlay');
    const input = document.getElementById('log-search');
    const container = document.getElementById('filtered-results');
    
    if(show) {
        overlay.style.display = 'block';
        input.value = ''; // Pulisci input
        input.focus();
        // Messaggio di benvenuto o lista vuota
        container.innerHTML = `<div style="text-align:center; color:#444; margin-top:30px; font-size:12px;">DIGITA E PREMI INVIO PER CERCARE NEL DATABASE COMPLETO</div>`;
    } else {
        overlay.style.display = 'none';
        // Togli focus per chiudere tastiera
        input.blur();
    }
}

// Filtra in tempo reale
function applyFilters() {
    const query = document.getElementById('log-search').value.toLowerCase();
    const allData = lastStatsData.finance.full_history || []; // Usa la lista LUNGA
    
    const filtered = allData.filter(t => 
        t.desc.toLowerCase().includes(query) || 
        t.cat.toLowerCase().includes(query) ||
        (t.note && t.note.toLowerCase().includes(query))
    );

    renderFilteredItems(filtered);
}

function renderFilteredItems(items) {
    const container = document.getElementById('filtered-results');
    const financeIcons = {
        "CIBO": "utensils", "SPESA": "shopping-cart", "SVAGO": "gamepad-2",
        "CASA": "home", "SALUTE": "heart", "TRASPORTI": "car", "LAVORO": "briefcase"
    };

    if (items.length === 0) {
        container.innerHTML = "<div style='color:#555; text-align:center; margin-top:20px;'>NO_DATA_FOUND</div>";
        return;
    }

    container.innerHTML = items.map(t => {
        const iconName = financeIcons[t.cat] || "arrow-right-left";
        const hasNote = t.note && t.note !== "";
        const color = t.amt < 0 ? "#fff" : "#00ff88";

        return `
        <div style="display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid #1a1a1a;">
            <span style="font-size: 10px; color: var(--dim); min-width: 35px;">${t.date}</span>
            <i data-lucide="${iconName}" style="width: 16px; color: #fff; opacity: 0.8;"></i>
            <div style="flex: 1; display: flex; flex-direction: column;">
                <span style="font-size: 11px; font-weight: 500; color: #fff; text-transform: uppercase;">${t.desc}</span>
                ${hasNote ? `<span style="font-size:9px; color:var(--accent);">${t.note}</span>` : ''}
            </div>
            <span style="color: ${color}; font-family: 'Rajdhani'; font-weight: 700; font-size: 13px;">
                ${t.amt > 0 ? '+' : ''}${parseFloat(t.amt).toFixed(2)}€
            </span>
        </div>`;
    }).join('');

    if (window.lucide) lucide.createIcons();
}

let aiSearchActive = false;

async function handleLogSearch(event) {
    if (event.key !== 'Enter') {
        document.getElementById('search-clear').style.display = event.target.value ? 'block' : 'none';
        return;
    }
    
    const query = event.target.value.trim();
    if (!query) return;

    const container = document.getElementById('filtered-results');
    event.target.blur();
    container.innerHTML = `<div class="loading-ani">QUERYING_${aiSearchActive ? 'NEURAL_' : ''}DATABASE...</div>`;

    try {
        // Se l'AI è attiva, usiamo una action diversa, altrimenti quella normale
        const action = aiSearchActive ? "search_finance_ai" : "search_finance";
        const res = await fetch(`${SCRIPT_URL}?action=${action}&q=${encodeURIComponent(query)}`);
        const data = await res.json();
        
        if (data.length === 0) {
            container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--dim);">NESSUN_RISULTATO_TROVATO</div>`;
        } else {
            renderFilteredItems(data); 
        }
    } catch (e) {
        container.innerHTML = "ERRORE_CONNESSIONE_DATABASE";
    }
}

// Funzione per i tasti rapidi
function quickFilter(tag) {
    const input = document.getElementById('finance-search');
    const currentVal = input.value.trim();

    // Se il tag è già presente, non aggiungerlo di nuovo
    if (!currentVal.includes(tag)) {
        // Aggiunge il nuovo tag con uno spazio se c'è già qualcosa
        input.value = currentVal ? `${currentVal} ${tag}` : tag;
    }

    aiSearchActive = false; 
    const aiStatus = document.getElementById('fin-ai-status');
    if(aiStatus) aiStatus.innerText = 'OFF';
    
    document.getElementById('search-clear').style.display = 'block';

    // Lanciamo la ricerca con la stringa combinata (es: "/02/2026 CIBO")
    handleLogSearch({ key: 'Enter', target: input });
}

function toggleAISearch() {
    aiSearchActive = !aiSearchActive;
    const status = document.getElementById('ai-status');
    const box = document.getElementById('ai-search-toggle');
    status.innerText = aiSearchActive ? 'ON' : 'OFF';
    status.style.color = aiSearchActive ? 'var(--accent)' : '#666';
    box.style.borderColor = aiSearchActive ? 'var(--accent)' : '#444';
}

function clearLogSearch() {
    const input = document.getElementById('finance-search');
    const container = document.getElementById('filtered-results');
    const clearBtn = document.getElementById('search-clear');

    input.value = '';
    clearBtn.style.display = 'none';
    
    // Svuota i risultati filtrati
    container.innerHTML = ''; 
    
    // Opzionale: se vuoi che torni la lista iniziale delle ultime 10:
    // refreshFinanceLog(); 
}


function switchPage(pageId) {
    // 1. Nascondi tutte le pagine
    document.querySelectorAll('.app-page').forEach(p => p.style.display = 'none');
    
    // 2. Mostra quella selezionata
    const target = document.getElementById(pageId + '-page');
    if (target) {
        target.style.display = 'block';
    }

    // 3. Logica specifica
    if (pageId === 'log') {
        // Se entriamo nel log e non c'è ricerca, possiamo mostrare gli ultimi 20 di default
        if (lastStatsData) renderFilteredItems(lastStatsData.finance.transactions);
    }
    
    // 4. Aggiorna icone (se necessario)
    if (window.lucide) lucide.createIcons();
}
// ============================================
// 10. EVENT LISTENERS (DOM READY)
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    const backdrop = document.getElementById('modal-backdrop');
    const closeBtn = document.querySelector('.close-btn');

    if (backdrop) {
        backdrop.onclick = () => closeNoteDetail(true);
    }

    if (closeBtn) {
        closeBtn.onclick = () => closeNoteDetail(true);
    }
});

// FIX: Event listeners globali con controlli null
document.addEventListener('click', (e) => {
    const analystBubble = document.getElementById('analyst-bubble');
    const analystBtn = document.getElementById('analyst-btn');
    const financeInputZone = document.getElementById('finance-input-zone');
    const fab = document.getElementById('fab-finance');

    if (analystBubble && analystBtn && !analystBubble.contains(e.target) && !analystBtn.contains(e.target)) {
        analystBubble.classList.remove('active');
    }

    if (financeInputZone && fab && !financeInputZone.contains(e.target) && !fab.contains(e.target)) {
        toggleFinanceInput(false);
    }
});

function switchFinanceTab(target) {
    const dashboard = document.getElementById('finance-home-view');
    const searchView = document.getElementById('finance-search-view');
    const statsView = document.getElementById('finance-stats-view');

    // Nascondi tutto
    [dashboard, searchView, statsView].forEach(v => { if(v) v.style.display = 'none' });

    if (target === 'log') {
        searchView.style.display = 'block';
    } else if (target === 'stats') {
        statsView.style.display = 'block';
        initStats(); // <--- GENERA I GRAFICI
    } else {
        dashboard.style.display = 'block';
    }
    
    if (window.lucide) lucide.createIcons();
}

function nav(page) {
    // Nascondi tutte le pagine principali (.page)
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    
    // Mostra la pagina target (es. 'home' per le note o 'finance' per i soldi)
    const targetPage = document.getElementById(page);
    if (targetPage) targetPage.classList.add('active');

    // Se stiamo andando alla HOME principale, resettiamo le tab di finance per la prossima volta
    if (page === 'home') {
        switchFinanceTab('dashboard');
    }

    if (page === 'reviews') {
    loadReviews();
    }
}

async function initStats() {
    try {
        const res = await fetch(`${SCRIPT_URL}?action=get_finance_stats`);
        const data = await res.json();
        
        // Aggiorna i testi
        document.getElementById('stat-total-spent').innerText = `${data.spent.toFixed(2)}€`;
        document.getElementById('stat-total-income').innerText = `${data.income.toFixed(2)}€`;
        
        // Survival Bar
        const survivalPercent = data.income > 0 ? (data.spent / data.income) * 100 : 0;
        document.getElementById('survival-bar-fill').style.width = Math.min(survivalPercent, 100) + "%";
        document.getElementById('survival-percentage').innerText = Math.round(survivalPercent) + "%";

        // Top Expenses
        const topList = document.getElementById('top-expenses-list');
        const sortedCats = Object.entries(data.categories).sort((a,b) => b[1] - a[1]).slice(0,3);
        topList.innerHTML = sortedCats.map(([cat, val]) => `
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; border-bottom:1px solid #222; padding:5px 0;">
                <span>${cat}</span><span style="color:#ff4d4d;">-${val.toFixed(2)}€</span>
            </div>
        `).join('');

        // ORA chiamiamo il grafico
        renderCategoryChart(data.categories);

    } catch (e) {
        console.error("Errore nel caricamento stats:", e);
    }
}

    // --- RENDER GRAFICO CATEGORIE (Doughnut) ---
function renderCategoryChart(categories) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) {
        console.error("ERRORE: Canvas 'categoryChart' non trovato nel DOM!");
        return;
    }
    const ctx = canvas.getContext('2d');
    
    if (myChart) myChart.destroy();

    const labels = Object.keys(categories);
    const values = Object.values(categories);

    myChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: ['#00f3ff', '#ff4d4d', '#7000ff', '#ff00c1', '#00ff41', '#ff9a00'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%', // Lo rende un anello elegante
            plugins: {
                legend: { position: 'bottom', labels: { color: '#666', font: { family: 'Rajdhani', size: 10 } } }
            }
        }
    });
}

function renderCategoryChart(data) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    if (charts.cat) charts.cat.destroy();

    charts.cat = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: [
                    '#00f3ff', // Cyan
                    '#ff0055', // Magenta
                    '#9d00ff', // Purple
                    '#00ff88', // Green
                    '#ffb300'  // Amber
                ],
                hoverBackgroundColor: '#fff',
                borderColor: '#080808', // Sfondo scuro tra le fette
                borderWidth: 3,
                hoverOffset: 15
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: '#aaa',
                        font: { family: 'Rajdhani', size: 11, weight: 'bold' },
                        padding: 20,
                        usePointStyle: true,
                        pointStyle: 'rectRot' // Icone a diamante
                    }
                },
                tooltip: {
                    backgroundColor: '#000',
                    titleFont: { family: 'Rajdhani' },
                    bodyFont: { family: 'Rajdhani' },
                    borderColor: 'var(--accent)',
                    borderWidth: 1,
                    displayColors: false
                }
            },
            cutout: '75%' // Cerchio molto sottile, stile interfaccia futuristica
        }
    });
}

async function openTimeFilter() {
    const period = prompt("Inserisci Mese e Anno (es: Gennaio 2026):");
    if (!period) return;
    
    // Attiviamo l'AI per questa ricerca perché deve capire il periodo
    aiSearchActive = true; 
    document.getElementById('fin-ai-status').innerText = 'ON';
    
    quickFilter(period);
}

async function filterByMonth(val) {
    if (!val) return;
    
    // val arriva dal calendario come "2026-02"
    const parts = val.split('-');
    const year = parts[0];
    const month = parts[1]; // "02"

    // Stringa per il tuo database numerico (07/02/2026)
    const formattedQuery = `/${month}/${year}`;
    
    console.log("Trigger ricerca numerica:", formattedQuery);

    // Passiamo la palla a quickFilter che già funziona per i bottoni!
    quickFilter(formattedQuery);
}

let myChart = null;

async function loadFinanceStats() {
    // 1. Fetch dei dati (Assicurati che l'action get_finance_stats sia attiva in Apps Script)
    const res = await fetch(`${SCRIPT_URL}?action=get_finance_stats`);
    const data = await res.json();

    // 2. Aggiorna Contatori Numerici
    document.getElementById('stat-total-spent').innerText = `${data.spent.toFixed(2)}€`;
    document.getElementById('stat-total-income').innerText = `${data.income.toFixed(2)}€`;

    // 3. Survival Bar Logic
    // Calcoliamo quanto abbiamo speso rispetto a quanto abbiamo incassato
    let survivalPercent = 0;
    if (data.income > 0) {
        survivalPercent = (data.spent / data.income) * 100;
    } else {
        survivalPercent = data.spent > 0 ? 100 : 0; // Se non hai entrate ma spendi, sei al 100% di rischio
    }
    
    const bar = document.getElementById('survival-bar-fill');
    const percentText = document.getElementById('survival-percentage');
    
    bar.style.width = Math.min(survivalPercent, 100) + "%";
    percentText.innerText = Math.round(survivalPercent) + "%";
    
    // Cambio colore barra in base al pericolo
    if (survivalPercent > 85) bar.style.background = "#ff4d4d"; // Rosso alert
    else if (survivalPercent > 60) bar.style.background = "#ff9a00"; // Arancio warning
    else bar.style.background = "var(--accent)"; // Tutto ok

    // 4. Top Expenses List (Mobile Friendly)
    const topList = document.getElementById('top-expenses-list');
    const sortedCats = Object.entries(data.categories)
        .sort((a, b) => b[1] - a[1]) // Ordina dalla spesa più alta
        .slice(0, 3); // Prendi le prime 3

    topList.innerHTML = sortedCats.map(([cat, val]) => `
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px dashed #222; padding-bottom: 5px;">
            <span style="font-family: 'Rajdhani'; font-size: 0.8rem; color: #fff;">${cat}</span>
            <span style="font-family: 'Rajdhani'; font-size: 0.9rem; color: #ff4d4d;">-${val.toFixed(2)}€</span>
        </div>
    `).join('');

    // 5. Render del Grafico (come abbiamo visto prima)
    renderDoughnutChart(data.categories);
}

async function requestAnalystUpdate() {
    const evalBox = document.getElementById('stats-eval');
    const spent = document.getElementById('stat-total-spent').innerText;
    const income = document.getElementById('stat-total-income').innerText;
    
    evalBox.innerText = "ANALISI_IN_CORSO... ATTENDERE...";
    evalBox.style.color = "var(--accent)";

    try {
        // Chiamata all'AI passando i dati attuali
        const response = await fetch(`${SCRIPT_URL}?action=search_finance_ai&q=Analizza brevemente queste spese mensili: Entrate ${income}, Uscite ${spent}. Sii sintetico, tecnico e un po' cinico nello stile LifeOS.`);
        const report = await response.json();
        
        // Se il tuo backend search_finance_ai restituisce un testo o un array
        // Adatta questa riga in base a come risponde il tuo Apps Script
        evalBox.innerText = report.aiAnalysis || report; 
        evalBox.style.color = "#fff";
        
    } catch (e) {
        evalBox.innerText = "ERRORE_DI_COLLEGAMENTO_CORE. RIPROVA.";
        console.error(e);
    }
}

function updateUI(data) {
    // Aggiorna le Note
    loadedNotesData = data.notes; 
    renderGrid();

    // AGGIORNA LE ORE (Se questa riga manca, la sezione sparisce!)
    if (data.extraTotal) {
        document.getElementById('extra-hours-val').innerText = data.extraTotal + "h";
    }
    
    // Aggiorna Finanze
    if (data.finance) {
        document.getElementById('bank-val').innerText = "€ " + data.finance.bank;
        // ... ecc
    }
}

function toggleQuickMenu() {
    const qMenu = document.getElementById('quick-menu');
    if (qMenu) {
        qMenu.classList.toggle('quick-menu-hidden');
    }
}

// Funzione chiamata dalle opzioni del menu
function createNew(kind) {
    createNewNote();
    
    if (kind === 'LINK') {
        document.getElementById('detail-text').value = "https://";
        document.getElementById('detail-type').innerText = "NUOVO_LINK";
    }
    if (kind === 'LIST') {
        document.getElementById('detail-text').value = "☐ \n☐ \n☐ ";
        document.getElementById('detail-type').innerText = "NUOVA_LISTA";
    }
    
    toggleQuickMenu();
}

// Funzione di supporto per aprire il modal vuoto
function createNewNote() {
    currentNoteData = { id: null, type: 'NOTE', color: 'default', index: undefined };
    document.getElementById('detail-type').innerText = "NUOVA_NOTA";
    document.getElementById('detail-text').value = "";
    document.getElementById('note-detail').className = "note-overlay bg-default";
    document.getElementById('note-detail').style.display = "flex";
    document.getElementById('modal-backdrop').style.display = "block";
}

function filterArchive() {
    const navArchive = document.getElementById('nav-stats');
    
    if (currentFilter === 'ARCHIVE') {
        // Torna a tutto
        currentFilter = 'ALL';
        if (navArchive) navArchive.style.color = 'var(--dim)';
    } else {
        currentFilter = 'ARCHIVE';
        if (navArchive) navArchive.style.color = 'var(--accent)';
    }
    
    renderGrid(lastStatsData);
}

function toggleGhostAI() {
    // Chiude quick menu se aperto
    const qMenu = document.getElementById('quick-menu');
    if (qMenu && !qMenu.classList.contains('quick-menu-hidden')) {
        qMenu.classList.add('quick-menu-hidden');
    }

    // Usa la stessa bubble di finance (già esiste nel DOM)
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    if (!bubble || !text) return;

    bubble.classList.remove('active');
    void bubble.offsetWidth; // Force reflow
    
    text.innerHTML = `
        <div style="font-size: 0.7rem; color: var(--dim); margin-bottom: 8px; letter-spacing: 2px;">GHOST_AI // BRAIN_MODULE</div>
        <div style="color: var(--accent); font-size: 0.85rem; margin-bottom: 12px;">In attesa di input...</div>
        <div style="display: flex; gap: 8px; margin-top: 10px;">
            <input type="text" id="ghost-input" placeholder="Descrivi cosa vuoi fare..." 
                style="flex:1; background:#111; border:1px solid #333; color:#fff; padding:8px; 
                       font-family:'JetBrains Mono'; font-size:0.8rem; outline:none; border-radius:4px;"
                onkeypress="handleGhostInput(event)">
        </div>
        <div style="font-size: 0.65rem; color:#333; margin-top:8px;">
            es: "espandi questa idea", "correggi grammatica", "crea lista da questo testo"
        </div>
    `;
    
    bubble.classList.add('active');
    setTimeout(() => {
        const ghostInput = document.getElementById('ghost-input');
        if (ghostInput) ghostInput.focus();
    }, 200);
}

async function handleGhostInput(event) {
    if (event.key !== 'Enter') return;
    
    const input = document.getElementById('ghost-input');
    const query = input.value.trim();
    if (!query) return;
    
    const text = document.getElementById('analyst-text');
    text.innerHTML = `<div style="color:var(--accent);" class="blink">NEURAL_PROCESSING...</div>`;
    
    // Placeholder - qui collegherai Gemini
    setTimeout(() => {
        text.innerHTML = `
            <div style="font-size:0.7rem; color:var(--dim);">GHOST_RESPONSE:</div>
            <div style="color:#fff; margin-top:8px;">Gemini non ancora collegato.<br>
            <span style="color:var(--accent);">Query ricevuta: "${query}"</span></div>
        `;
    }, 1000);
}

//REVIEWS SECTION//


function renderStars(rating, color) {
    let starsHtml = '';
    const r = parseFloat(rating) || 0;
    for (let i = 1; i <= 5; i++) {
        if (r >= i) starsHtml += `<i data-lucide="star" style="fill:${color}; color:${color}; width:16px; height:16px;"></i>`;
        else if (r >= i - 0.5) starsHtml += `<i data-lucide="star-half" style="fill:${color}; color:${color}; width:16px; height:16px;"></i>`;
        else starsHtml += `<i data-lucide="star" style="color:#333; width:16px; height:16px;"></i>`;
    }
    return starsHtml;
}

function formatItalianDate(dateStr) {
    if (!dateStr) return "--";
    // Splittiamo YYYY-MM-DD per evitare inversioni del browser
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const months = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUGL", "AGO", "SET", "OTT", "NOV", "DIC"];
    return `${parts[2]} ${months[parseInt(parts[1]) - 1]}`;
}

let allReviews = []; 

function loadReviews() {
    isWishlistView = false; // Reset sempre su Home
    const headerTitle = document.querySelector('#reviews .header h1');
    if (headerTitle) headerTitle.innerText = 'REVIEWS';

    if (lastStatsData && lastStatsData.reviews) {
        allReviews = lastStatsData.reviews;
        renderReviews(allReviews, false); // Forza visualizzazione REVIEWS
    } else {
        if (list) list.innerHTML = `<div style="text-align:center; opacity:0.3; padding:40px;">SYNCING...</div>`;
        
        setTimeout(() => {
            if (lastStatsData && lastStatsData.reviews) {
                allReviews = lastStatsData.reviews;
                renderReviews(allReviews, false);
            }
        }, 2000);
    }
}

function renderReviews(data, showOnlyWish = false) {
    const list = document.getElementById('reviews-list');
    if (!list) return;

    // 1. FILTRAGGIO INTELLIGENTE
    const filteredData = data.filter(item => {
        const isWish = item.categoria?.toUpperCase() === 'WISH';
        // Se showOnlyWish è true, passano solo i desideri. Se false, passa tutto il resto.
        return showOnlyWish ? isWish : !isWish;
    });

    if (!filteredData || filteredData.length === 0) {
        list.innerHTML = `<div style="text-align:center; opacity:0.1; padding:40px; letter-spacing:2px;">[ NESSUN_DATO_RILEVATO ]</div>`;
        return;
    }

    const catColors = {
        'FILM': '#00d4ff',
        'SERIE': '#ff0055',
        'GAME': '#00ff44',
        'COMIC': '#ffcc00',
        'WISH': '#888888'
    };

    list.innerHTML = filteredData.map(item => {
        const isWish = item.categoria?.toUpperCase() === 'WISH';
        const color = catColors[item.categoria?.toUpperCase()] || 'var(--accent)';
        const dateStr = formatItalianDate(item.data);
        
        // Se è un desiderio, mostriamo un'icona invece delle stelle vuote
        const starsHtml = isWish 
            ? `<div style="color:${color}; font-size:10px; opacity:0.6; display:flex; align-items:center; gap:4px;"><i data-lucide="clock" style="width:12px;"></i> WISHLIST</div>`
            : renderStars(item.rating, color);

        return `
            <div class="review-card" 
                 data-review-id="${item.id}"
                 style="border-left: 3px solid ${color}; cursor:pointer;">
                
                <div class="poster-mini" 
                     style="background-image: url('${item.image_url || ''}'); background-color: #050505;">
                     ${!item.image_url ? `<span style="font-size:8px; color:#333;">NO_IMG</span>` : ''}
                </div>

                <div class="review-info">
                    <div class="review-top">
                        <span class="review-title" style="color:${color}; font-family:'Rajdhani';">${item.titolo}</span>
                        <div class="rating-stars" style="display:flex; gap:2px;">
                            ${starsHtml}
                        </div>
                    </div>
                    
                    <div class="review-comment" style="font-family:'JetBrains Mono'; font-style: normal; color:#aaa;">
                        ${item.commento_breve || item.riassunto_ai || ''}
                    </div>
                    
                    <div class="review-meta" style="font-family:'JetBrains Mono';">
                        <span style="opacity:0.7">${item.categoria}</span>
                        <span>${dateStr}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Listener per il dettaglio
    list.querySelectorAll('.review-card').forEach(card => {
        card.onclick = () => {
            const id = card.getAttribute('data-review-id');
            if (id) openReviewDetail(id);
        };
    });

    if(window.lucide) lucide.createIcons();
}

// Funzione per generare le stelle (★ e ½)
function getStarRating(rating) {
    const fullStars = Math.floor(rating);
    const halfStar = (rating % 1 !== 0) ? '½' : '';
    return '★'.repeat(fullStars) + halfStar;
}

let currentReviewId = null;

function renderReviews(data, showOnlyWish = false) {
    const list = document.getElementById('reviews-list');
    if (!list) return;

    // --- AGGIUNTA FILTRO ISWISH ---
    // Filtra i dati in base alla categoria 'WISH' e al parametro showOnlyWish
    const filteredData = data ? data.filter(item => {
        const isWish = item.categoria?.toUpperCase() === 'WISH';
        return showOnlyWish ? isWish : !isWish;
    }) : [];

    if (!filteredData || filteredData.length === 0) {
        list.innerHTML = `<div style="text-align:center; opacity:0.1; padding:40px; letter-spacing:2px;">[ NESSUN_DATO_RILEVATO ]</div>`;
        return;
    }

    const catColors = {
        'FILM': '#00d4ff',
        'SERIE': '#ff0055',
        'GAME': '#00ff44',
        'COMIC': '#ffcc00',
        'WISH': '#888888'
    };

    list.innerHTML = filteredData.map(item => {
        const color = catColors[item.categoria?.toUpperCase()] || 'var(--accent)';
        const dateStr = formatItalianDate(item.data);
        
        // --- LOGICA STELLE/WISH ---
        // Se è un WISH, mostriamo l'icona bookmark o clock invece delle stelle vuote
        const isWish = item.categoria?.toUpperCase() === 'WISH';
        const starsHtml = isWish 
            ? `<div style="display:flex; align-items:center; gap:5px; color:#666; font-size:10px;">
                <i data-lucide="bookmark" style="width:12px; height:12px;"></i> WISHLIST
               </div>`
            : renderStars(item.rating, color);

        return `
            <div class="review-card" 
                 data-review-id="${item.id}"
                 style="border-left: 3px solid ${color}; cursor:pointer;">
                
                <div class="poster-mini" 
                     style="background-image: url('${item.image_url || ''}'); background-color: #050505;">
                     ${!item.image_url ? `<span style="font-size:8px; color:#333;">NO_IMG</span>` : ''}
                </div>

                <div class="review-info">
                    <div class="review-top">
                        <span class="review-title" style="color:${color}; font-family:'Rajdhani';">${item.titolo}</span>
                        <div class="rating-stars" style="display:flex; gap:2px;">
                            ${starsHtml}
                        </div>
                    </div>
                    
                    <div class="review-comment" style="font-family:'JetBrains Mono'; font-style: normal; color:#aaa;">
                        ${item.commento_breve || item.riassunto_ai || ''}
                    </div>
                    
                    <div class="review-meta" style="font-family:'JetBrains Mono';">
                        <span style="opacity:0.7">${item.categoria}</span>
                        <span>${dateStr}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Event delegation - rimane identico
    list.querySelectorAll('.review-card').forEach(card => {
        card.onclick = () => {
            const id = card.getAttribute('data-review-id');
            if (id) openReviewDetail(id);
        };
    });

    if(window.lucide) lucide.createIcons();
}

function closeReviewDetail() {
    document.getElementById('review-detail-modal').style.display = 'none';
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
}

function openReviewEntry() {
    document.getElementById('review-entry-modal').style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
    setTimeout(() => document.getElementById('ai-review-input').focus(), 300);
}

function closeReviewEntry() {
    document.getElementById('review-entry-modal').style.display = 'none';
    document.getElementById('modal-backdrop').style.display = 'none';
    document.getElementById('ai-review-input').value = '';
}

async function processReviewWithAI() {
    const inputField = document.getElementById('ai-review-input');
    const input = inputField.value.trim();
    if (!input) return;

    closeReviewEntry();

// 2. Crea una card "LOADING" temporanea in cima alla lista
    const list = document.getElementById('reviews-list');
    const tempId = "temp_" + Date.now();
    const loadingCard = document.createElement('div');
    loadingCard.id = tempId;
    loadingCard.className = "review-card";
    loadingCard.style.opacity = "0.5";
    loadingCard.style.borderLeft = "3px solid var(--dim)";
    loadingCard.innerHTML = `
        <div class="poster-mini" style="background: #111; display: flex; align-items: center; justify-content: center;">
            <div class="blink-dot"></div>
        </div>
        <div class="review-info">
            <div class="review-top">
                <span class="review-title" style="color:var(--dim)">ANALISI_IN_CORSO...</span>
            </div>
            <div class="review-comment">${input.substring(0, 50)}...</div>
        </div>
    `;
    list.prepend(loadingCard);

    try {
        // FIX: rimuovi mode:'no-cors' per poter leggere la risposta
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ service: 'processReviewAI', text: input }) // FIX: 'service' non 'action'
        });
        
        const responseText = await response.text();
        const result = JSON.parse(responseText);
        
        if (result.status === "SUCCESS") {
            const ai = result.data;
            
            // Aggiorna card visivamente
            loadingCard.innerHTML = `
                <div class="poster-mini" style="background-image: url('${ai.image_url || ''}'); background-size:cover;"></div>
                <div class="review-info">
                    <div class="review-top">
                        <span class="review-title">${(ai.titolo || "").toUpperCase()}</span>
                        <span class="rating-stars">${getStarRating(ai.rating)}</span>
                    </div>
                    <div class="review-comment">${ai.commento_breve || ""}</div>
                </div>
            `;

            // Ricarica in background per aggiornare allReviews
            setTimeout(() => loadStats(), 2000);
        } else {
            loadingCard.innerHTML = `<div style="padding:10px; color:#ff4d4d;">ERRORE: ${result.message || 'SYNC_FAILED'}</div>`;
        }
    } catch (error) {
        console.error("Review error:", error);
        loadingCard.innerHTML = `<div style="padding:10px; color:#ff4d4d;">ERRORE_CONNESSIONE</div>`;
    }
}

async function editPosterLink() {
    // Recuperiamo l'ID della review che è attualmente aperta nel modal
    const currentId = document.getElementById('review-detail-modal').getAttribute('data-current-id');
    const newUrl = prompt("Incolla l'URL della nuova immagine:");
    
    if (newUrl && newUrl.startsWith('http')) {
        try {
            const response = await fetch(SCRIPT_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'updateReviewPoster',
                    id: currentId,
                    url: newUrl
                })
            });
            const res = await response.json();
            if (res.status === "SUCCESS") {
                alert("Poster aggiornato!");
                loadStats(); // Ricarica tutto così vedi la nuova immagine
                closeReviewDetail();
            }
        } catch (e) {
            alert("Errore durante il salvataggio.");
        }
    }
}

// Stato locale del modulo Reviews

let isWishlistView = false; // Stato globale del modulo

function toggleWishlist() {
    // 1. Inverti lo stato
    isWishlistView = !isWishlistView;
    
    // 2. Recupera gli elementi con cautela
    const wishBtn = document.getElementById('nav-wish');
    const headerTitle = document.querySelector('#reviews .header h1');
    
    // Cambiamo il titolo della Header
    if (headerTitle) {
        headerTitle.innerText = isWishlistView ? 'WISHLIST' : 'REVIEWS';
    }

    // 3. Gestione Icona e Colore Tasto
    if (wishBtn) {
        const icon = wishBtn.querySelector('i');
        if (isWishlistView) {
            wishBtn.style.color = "var(--accent)";
            if (icon) icon.setAttribute('data-lucide', 'bookmark-check'); 
        } else {
            wishBtn.style.color = "var(--dim)";
            if (icon) icon.setAttribute('data-lucide', 'bookmark-plus');
        }
    }

    // 4. Rendering della lista filtrata
    // Usiamo allReviews che è quella caricata da loadReviews()
    if (typeof allReviews !== 'undefined' && allReviews.length > 0) {
        renderReviews(allReviews, isWishlistView);
    } else {
        console.error("Dati reviews non pronti.");
    }

    // Refresh icone Lucide (indispensabile dopo setAttribute)
    if(window.lucide) lucide.createIcons();
}

function openReviewDetail(id) {
    console.log("Click ricevuto, ID:", id);
    
    if (!allReviews || allReviews.length === 0) {
        console.error("allReviews è vuoto, attendi il caricamento");
        return;
    }
    
    const item = allReviews.find(r => String(r.id) === String(id));
    if (!item) {
        console.error("Review non trovata:", id, allReviews);
        return;
    }

    // --- LOGICA ISWISH ---
    const isWish = item.categoria?.toUpperCase() === 'WISH';
    const catColors = { 'FILM': '#00d4ff', 'SERIE': '#ff0055', 'GAME': '#00ff44', 'COMIC': '#ffcc00', 'WISH': '#888888' };
    const color = catColors[item.categoria?.toUpperCase()] || 'var(--accent)';
    
    const modal = document.getElementById('review-detail-modal');
    if (!modal) return;

    let fullDate = "--";
    if (item.data) {
        const d = item.data.split('-');
        const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUGL", "AGO", "SET", "OTT", "NOV", "DIC"];
        fullDate = `${d[2]} ${mesi[parseInt(d[1])-1]} ${d[0]}`;
    }

    modal.innerHTML = `
        <div class="review-detail-card" style="border-top: 3px solid ${color}">
            <button class="esc-btn" onclick="closeReviewDetail()">ESC</button>

            <div style="margin-bottom: 5px; text-align: left;">
                <h1 style="font-family:'Rajdhani'; font-size: 2.2rem; margin: 0; color: ${color}; text-transform: uppercase; line-height:1.1;">
                    ${item.titolo}
                </h1>
                <p style="font-family:'JetBrains Mono'; font-size: 11px; color: #555; margin: 8px 0 0 0; letter-spacing:0.5px;">
                    <span style="color:#888">${fullDate}</span> • 
                    <span style="color:${color}">${item.categoria}</span> <br/> 
                    ${item.metadata || 'NO_INFO'}
                </p>
            </div>

            <div class="review-main-content">
                
                <div class="detail-poster-zone">
                    <img src="${item.image_url}" onclick="window.open('${item.image_url}', '_blank')" 
                         style="box-shadow: 0 10px 20px rgba(0,0,0,0.5);">
                    
                    <div style="margin-top: 15px; background: #080808; padding: 12px; border: 1px solid #111; text-align: center; border-radius:2px;">
                        ${isWish ? `
                            <div style="color:${color}; font-family:'Rajdhani'; font-size: 0.9rem; letter-spacing:1px;">
                                <i data-lucide="clock" style="width:14px; margin-bottom:4px;"></i><br>IN_WISHLIST
                            </div>
                        ` : `
                            <div style="display:flex; justify-content:center; gap:3px; margin-bottom:5px;">
                                ${renderStars(item.rating, color)}
                            </div>
                            <div style="font-family:'Rajdhani'; font-size: 1.3rem; color:${color}; font-weight:bold;">${item.rating} / 5</div>
                        `}
                    </div>
                </div>

                <div class="review-text-zone">
                    ${(item.commento_full || item.commento || 'Nessun testo.').trim()}
                    
                    ${isWish ? `
                        <div style="margin-top:30px; border-top: 1px solid #222; padding-top:20px;">
                            <button onclick="promoteToReview('${item.id}')" 
                                    style="width:100%; background:${color}; color:#000; border:none; padding:12px; font-family:'Rajdhani'; font-weight:bold; cursor:pointer; border-radius:4px;">
                                CONVERTI IN RECENSIONE
                            </button>
                        </div>
                    ` : ''}
                </div>

            </div>
        </div>
    `;
    
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
    
    if(window.lucide) lucide.createIcons();
}

// Questa serve per far funzionare il tasto sopra
function promoteToReview(id) {
    const item = allReviews.find(r => String(r.id) === String(id));
    if (!item) return;
    closeReviewDetail();
    openReviewEntry();
    document.getElementById('ai-review-input').value = `Ho completato ${item.titolo}. Ecco il mio voto e parere: `;
}