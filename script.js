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

    // 1. Chiudi input e apri analista in stato "LOADING"
    input.blur();
    toggleFinanceInput(false);
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    text.innerText = "NEURAL_PROCESSING_IN_PROGRESS...";
    bubble.classList.add('active');
    
    input.value = '';

    try {
        const isAgenda = rawText.toLowerCase().startsWith('t ');
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                service: isAgenda ? "agenda_add" : "finance_smart_entry",
                text: isAgenda ? rawText.substring(2) : rawText,
                wallet: rawText.includes('*c') ? "CASH" : "BANK"
            })
        });

        if (!isAgenda) {
            const result = await response.json();
            text.innerText = result.advice; // Risposta cinica di Gemini
        } else {
            text.innerText = "EVENTO_MEMORIZZATO_NELLA_TIMELINE";
        }

        // 2. Ricarica i dati (Saldo e Log)
        await loadStats();
        
    } catch (err) {
        text.innerText = "CRITICAL_ERROR: SYNC_FAILED";
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
        const color = t.amt < 0 ? "#fff" : "#00ff88"; // Testi bianchi per uscite, verdi per entrate

        return `
        <div class="trans-row" style="display: flex; align-items: center; gap: 10px; padding: 12px 0; border-bottom: 1px solid #1a1a1a;">
            <span style="font-size: 10px; color: var(--dim); min-width: 35px;">${t.date}</span>
            
            <i data-lucide="${iconName}" style="width: 16px; color: #fff; opacity: 0.8;"></i>
            
            <div style="flex: 1; display: flex; align-items: center; gap: 6px;">
                <span style="font-size: 11px; font-weight: 500; color: #fff; text-transform: uppercase;">${t.desc}</span>
                ${hasNote ? `<i data-lucide="info" 
       onclick="showTransactionNote('${t.note.replace(/'/g, "\\'")}')" 
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

async function showTransactionNote(noteText) {
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    bubble.classList.add('active');
    text.innerText = "DECRYPTING_NOTE...";

    // Chiamata veloce a Gemini per parafrasare la nota in stile Cyberpunk
    const prompt = `Riscrivi questa nota spesa in modo brevissimo, cinico e colloquiale (max 10 parole): "${noteText}"`;
    
    try {
        const response = await fetch(`${SCRIPT_URL}?action=ai_interpret&text=${encodeURIComponent(prompt)}`);
        const result = await response.text();
        text.innerHTML = `<span style="opacity:0.6; font-size:9px">TRANSLATION_SUCCESS:</span><br>"${result.toUpperCase()}"`;
    } catch (e) {
        text.innerText = noteText.toUpperCase(); // Fallback se l'AI fallisce
    }
    
    setTimeout(() => bubble.classList.remove('active'), 7000);
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

async function handleLogSearch(event) {
    if (event.key !== 'Enter') return;
    
    const input = document.getElementById('log-search');
    const query = input.value.trim();
    
    // Passiamo la palla alla funzione che esegue la chiamata
    executeLogSearch(query);
}

// Funzione unica che esegue la chiamata (usata da tastiera e dai bottoni)
async function executeLogSearch(query) {
    if (!query) return;

    const container = document.getElementById('filtered-results');
    const input = document.getElementById('log-search');

    // UX: Chiudi tastiera e mostra Loading
    input.value = query; // Se ho cliccato un bottone, scrivo il testo nell'input
    input.blur(); 
    container.innerHTML = `<div style="text-align:center; color:var(--accent); margin-top:40px; font-family:'Rajdhani'; animation: pulse 1.5s infinite;">
                            <i data-lucide="database" style="margin-bottom:10px;"></i><br>
                            QUERYING_DATABASE: "${query.toUpperCase()}"...
                           </div>`;
    if(window.lucide) lucide.createIcons();

    try {
        // Chiamata al server (Apps Script)
        const response = await fetch(`${SCRIPT_URL}?action=search_finance&q=${encodeURIComponent(query)}`);
        const results = await response.json();
        
        // Render dei risultati
        if (results.length === 0) {
            container.innerHTML = `<div style="text-align:center; color:#555; margin-top:40px;">NO_MATCHES_FOUND</div>`;
        } else {
            renderFilteredItems(results);
        }
        
    } catch (e) {
        console.error(e);
        container.innerHTML = `<div style="color:red; text-align:center; margin-top:20px;">CRITICAL_ERROR: CONNECTION_LOST</div>`;
    }
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

function switchFinanceTab(tab) {
    const home = document.getElementById('finance-home');
    const log = document.getElementById('log-page');
    
    if (tab === 'log') {
        if (home) home.style.display = 'none';
        if (log) log.style.display = 'block';
        setTimeout(() => input.focus(), 100); // Focus automatico per cercare subito
    } else {
        if (home) home.style.display = 'block';
        if (log) log.style.display = 'none';
    }
}