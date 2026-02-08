/**
 * SYSTEM_OS - CORE JAVASCRIPT (FIXED)
 * Fix problemi loadStats e window.onload
 */

// ============================================
// 1. CONFIGURAZIONE E STATO GLOBALE
// ============================================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwQPQYYG6qBHwPcZRUFnNYILkm1xgiwWlFZWofg8M2u12xsOBgJDeB8HJmH2JIM0csI/exec";

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
        
        // Aggiorna variabili globali
        historyData = data.history || [];
        extraItemsGlobal = data.extraDetails || [];
        window.agendaData = data.agenda || [];
        loadedNotesData = data.notes || [];
        lastStatsData = data;
        
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
            const title = String(item.note[5] || "").toLowerCase();
            const content = String(item.note[1] || "").toLowerCase();
            const type = item.note[2];
            const searchLower = searchQuery.toLowerCase();
            
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
            if (currentFilter === 'ALL' && !isSearching) {
                if (a.note[2] === "PINNED" && b.note[2] !== "PINNED") return -1;
                if (a.note[2] !== "PINNED" && b.note[2] === "PINNED") return 1;
            }
            return 0;
        });

    // Generazione card
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

        // Eventi Drag & Drop
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
            if (!card.classList.contains('dragging')) openNoteByIndex(index);
        };

        fragment.appendChild(card);
    });

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

    currentNoteData = { id: note[4], type: note[2], color: note[3], index: index };
    
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
    
    detailType.innerText = note[5] || "NOTA";
    detailText.value = note[1];
    detailText.style.display = "block";
    detailExtraList.style.display = "none";
    
    if(pinIcon) pinIcon.style.color = (note[2] === "PINNED") ? "var(--accent)" : "var(--dim)";

    modal.className = `note-overlay bg-${note[3]}`;
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
        const oldText = oldNote ? oldNote[1] : "";
        const oldColor = oldNote ? oldNote[3] : "default";

        if (newText !== oldText || currentNoteData.color !== oldColor) {
            if (currentNoteData.index !== undefined) {
                loadedNotesData[currentNoteData.index][1] = newText;
                loadedNotesData[currentNoteData.index][3] = currentNoteData.color;
                if (lastStatsData) renderGrid(lastStatsData);
            }

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
    
    currentNoteData.color = color;
    
    const modal = document.getElementById('note-detail');
    if (modal) modal.className = `note-overlay bg-${color}`;
    
    const card = document.getElementById(`card-${currentNoteData.id}`);
    if (card) {
        card.className = `keep-card bg-${color}${currentNoteData.type === 'PINNED' ? ' pinnato' : ''}`;
    }
}

async function togglePin() {
    if (!currentNoteData || currentNoteData.type === "EXTRA") return;

    const nuovoStato = (currentNoteData.type === "PINNED") ? "NOTE" : "PINNED";
    currentNoteData.type = nuovoStato;
    
    const pinIcon = document.querySelector('.tool-icon i.fa-thumbtack');
    if (pinIcon) pinIcon.style.color = (nuovoStato === "PINNED") ? "var(--accent)" : "var(--dim)";

    await fetch(SCRIPT_URL, {
        method: 'POST', mode: 'no-cors',
        body: JSON.stringify({ service: "update_note_type", id: currentNoteData.id, type: nuovoStato })
    });
    loadStats();
}

let deleteTarget = null;

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
    
    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
            service: "delete_item",
            id: deleteTarget.id,
            type: deleteTarget.type
        })
    });
    
    closeNoteDetail(false);
    await loadStats();
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
    input.value = tag;
    aiSearchActive = false; // Disattiviamo AI per i filtri semplici
    document.getElementById('ai-status').innerText = 'OFF';
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
    input.value = '';
    document.getElementById('search-clear').style.display = 'none';
    // Se hai una funzione che mostra tutti i dati iniziali, chiamala qui
    // Esempio: renderFilteredItems(fullDataBackUp); 
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
}

function initStats() {
    if (!lastStatsData || !lastStatsData.finance.transactions) return;

    const txs = lastStatsData.finance.transactions; // Usiamo le transazioni caricate (o full_history se disponibile)
    
    // --- ELABORAZIONE DATI CATEGORIE ---
    const categories = {};
    txs.forEach(t => {
        if (t.amt < 0) { // Consideriamo solo le uscite
            const cat = t.cat.toUpperCase();
            categories[cat] = (categories[cat] || 0) + Math.abs(t.amt);
        }
    });

    // --- RENDER GRAFICO CATEGORIE (Doughnut) ---
    renderCategoryChart(categories);

    const catKeys = Object.keys(categories);
    const topCat = catKeys.reduce((a, b) => categories[a] > categories[b] ? a : b);
    const totalSpent = Object.values(categories).reduce((a, b) => a + b, 0);
    
    const evalElem = document.getElementById('stats-eval');
    
    // Messaggi personalizzati in base alla spesa maggiore
    if (topCat === "CIBO" && categories[topCat] > (totalSpent * 0.4)) {
        evalElem.innerText = "RILEVATO_ECCESSO_ALIMENTARE. Il tuo sostentamento sta drenando il 40% delle risorse. Ottimizzare dieta o budget.";
    } else if (totalSpent > 1000) {
        evalElem.innerText = "BURN_RATE_CRITICO. Le uscite superano i parametri di sicurezza. Suggerisco modalità risparmio energetico.";
    } else {
        evalElem.innerText = "FLUSSI_STABILI. Nessuna anomalia critica rilevata nel settore " + topCat + ".";
    }
    
    // --- RENDER GRAFICO TREND (Line) ---
    // (Qui potremmo aggregare per data, per ora facciamo le categorie che è il più utile)
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
    
    executeLogSearch(period);
}

async function filterByMonth(val) {
    if (!val) return;
    
    // val sarà nel formato "2026-02"
    const [year, month] = val.split('-');
    const monthNames = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", 
                        "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    
    const query = `${monthNames[parseInt(month)-1]} ${year}`;
    
    // Forziamo la ricerca standard (AI OFF) per risparmiare quota
    aiSearchActive = false; 
    const status = document.getElementById('fin-ai-status');
    if(status) {
        status.innerText = 'OFF';
        status.style.color = '#666';
    }
    
    executeLogSearch(query);
}