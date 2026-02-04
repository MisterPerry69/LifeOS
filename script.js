/**
 * SYSTEM_OS - CORE JAVASCRIPT (CLEANED)
 * Versione pulita e ottimizzata
 */

// ============================================
// 1. CONFIGURAZIONE E STATO GLOBALE
// ============================================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwQPQYYG6qBHwPcZRUFnNYILkm1xgiwWlFZWofg8M2u12xsOBgJDeB8HJmH2JIM0csI/exec";

// Stato applicazione centralizzato
let historyData = [];
let extraItemsGlobal = [];
let loadedNotesData = [];
let lastStatsData = null; // FIX: Dichiarata esplicitamente
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
    await loadStats();
    
    setTimeout(() => {
        const boot = document.getElementById('boot-screen');
        if(boot) boot.style.display = 'none';
    }, 500);
    
    // FIX: Event listener con controllo null
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('blur', function() {
            if (this.value === "") {
                toggleSearch(false);
            }
        });
    }
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
// 3. DATA ENGINE (GET)
// ============================================

async function loadStats() {
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getStats&t=${Date.now()}`);
        const data = await response.json();
        
        if (data.status === "ONLINE") {
            // --- MANTENIAMO LA TUA ROBA VECCHIA ---
            historyData = data.history || [];
            extraItemsGlobal = data.extraDetails || [];
            window.agendaData = data.agenda || [];
            loadedNotesData = data.notes || [];
            lastStatsData = data;
            
            renderGrid(data);
            
            if (document.getElementById('agenda').classList.contains('active')) {
                renderAgenda(window.agendaData);
            }

            // --- NUOVO BLOCCO FINANCE (Se non c'è questo, vedi sempre 0) ---
            if (data.finance) {
                // Aggiorna pagina Finance
                if (document.getElementById('total-balance')) 
                    document.getElementById('total-balance').innerText = data.finance.total + " €";
                
                if (document.getElementById('bank-val')) 
                    document.getElementById('bank-val').innerText = data.finance.bank + " €";
                
                if (document.getElementById('cash-val')) 
                    document.getElementById('cash-val').innerText = data.finance.cash + " €";

                // Aggiorna Widget in Home
                if (document.getElementById('widget-spent'))
                    document.getElementById('widget-spent').innerText = data.finance.spent;

                // Calcolo Barra HP (Budget fittizio 1500€ per la barra)
                const budget = 1500; 
                const burnPct = Math.min((parseFloat(data.finance.spent) / budget) * 100, 100);
                
                if (document.getElementById('efficiency-fill'))
                    document.getElementById('efficiency-fill').style.width = burnPct + "%";
                
                if (document.getElementById('burn-percentage'))
                    document.getElementById('burn-percentage').innerText = Math.round(burnPct) + "%";

                renderFinanceLog(data.finance.transactions);
            }
        }
    } catch (err) {
        console.error("Refresh fallito:", err);
    }
}

function renderGrid(data) {
    const grid = document.getElementById('keep-grid');
    if (!grid) return;
    
    lastStatsData = data;
    loadedNotesData = data.notes || [];

    document.getElementById('widget-notes').innerText = (loadedNotesData.length + 1);
    document.getElementById('widget-weight').innerText = data.weight || "94.5";

    const fragment = document.createDocumentFragment();
    const isSearching = searchQuery.length > 0;
    
    // Card EXTRA pinnata
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
                e.preventDefault(); // FIX: Blocca drag se non permesso
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
        recordFinanceCommand(val);
        input.value = "";
        return;
    }

    // Optimistic UI per note normali
    if (!val.toLowerCase().startsWith('t ') && !val.includes('+')) {
        const grid = document.getElementById('keep-grid');
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
            if (document.getElementById('note-detail').style.display === 'flex' && service === "extra_hours") {
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

    // FIX: Controlli null aggiunti
    if(colorBtn) colorBtn.style.display = "block";
    if(pinTool) pinTool.style.display = "flex";
    
    document.getElementById('detail-type').innerText = note[5] || "NOTA";
    document.getElementById('detail-text').value = note[1];
    document.getElementById('detail-text').style.display = "block";
    document.getElementById('detail-extra-list').style.display = "none";
    
    if(pinIcon) pinIcon.style.color = (note[2] === "PINNED") ? "var(--accent)" : "var(--dim)";

    modal.className = `note-overlay bg-${note[3]}`;
    modal.style.display = 'flex';
    document.getElementById('modal-backdrop').style.display = 'block';
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

    document.getElementById('prevMonth').onclick = (e) => { e.stopPropagation(); changeDetailMonth(-1); };
    document.getElementById('nextMonth').onclick = (e) => { e.stopPropagation(); changeDetailMonth(1); };
}

function changeDetailMonth(delta) {
    const newOffset = detailMonthOffset + delta;
    if (newOffset > 0) return;
    
    detailMonthOffset = newOffset;
    openExtraDetail();
}

// FIX: Funzione unificata per chiusura modal
function closeNoteDetail(forceSave = true) {
    const modal = document.getElementById('note-detail');
    const textArea = document.getElementById('detail-text');
    const backdrop = document.getElementById('modal-backdrop');
    
    if (!modal || modal.style.display === 'none') return;

    // Salvataggio solo per note normali se forceSave = true
    if (forceSave && currentNoteData && currentNoteData.id && currentNoteData.type !== "EXTRA") {
        const newText = textArea.value.trim();
        const oldNote = loadedNotesData[currentNoteData.index];
        const oldText = oldNote ? oldNote[1] : "";
        const oldColor = oldNote ? oldNote[3] : "default";

        if (newText !== oldText || currentNoteData.color !== oldColor) {
            // Aggiorna locale
            if (currentNoteData.index !== undefined) {
                loadedNotesData[currentNoteData.index][1] = newText;
                loadedNotesData[currentNoteData.index][3] = currentNoteData.color;
                if (lastStatsData) renderGrid(lastStatsData);
            }

            // Invia al server
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

    // Chiusura fisica
    modal.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
    
    // Reset UI
    document.getElementById('color-picker-bubble').style.display = 'none';
    document.getElementById('delete-modal').style.display = 'none';
    
    currentNoteData = null;
    detailMonthOffset = 0;
}

// Alias per compatibilità con HTML esistente
function saveAndClose() {
    closeNoteDetail(true);
}

function closeModal() {
    closeNoteDetail(false);
}

function toggleColorPicker() {
    const picker = document.getElementById('color-picker-bubble');
    picker.style.display = (picker.style.display === 'flex') ? 'none' : 'flex';
}

function changeNoteColor(color) {
    if (!currentNoteData) return;
    
    currentNoteData.color = color;
    
    const modal = document.getElementById('note-detail');
    modal.className = `note-overlay bg-${color}`;
    
    // FIX: Usa ID invece di querySelector fragile
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
    document.getElementById('delete-modal').style.display = 'flex';
}

function cancelDelete() {
    deleteTarget = null;
    document.getElementById('delete-modal').style.display = 'none';
}

async function executeDelete() {
    if (!deleteTarget) return;
    
    document.getElementById('delete-modal').style.display = 'none';
    
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

// ============================================
// 8. AGENDA
// ============================================

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

async function synthesizeDaily() {
    const prompt = document.getElementById('neural-prompt').value;
    if (!prompt) return;

    const btn = document.querySelector('#neural-input-zone button');
    btn.innerText = "SYNTHESIZING_NEURAL_PATH...";

    try {
        const payload = {
            service: "smartPlan",
            text: prompt,
            fixed: window.agendaData || []
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

// ============================================
// 9. EVENT LISTENERS (DOM READY)
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


// ============================================
// 10. FINANCE
// ============================================

// Modifica al submit per usare la nuova funzione di feedback
async function handleFinanceSubmit(event) {
    if (event.key !== 'Enter') return;
    const input = document.getElementById('finance-input');
    const rawText = input.value.trim();
    if (!rawText) return;

    toggleFinanceInput(false);
    input.value = '';

    const entries = rawText.split(',');
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    text.innerText = "ANALISI_FLUSSI...";
    bubble.classList.add('active');

    for (let entry of entries) {
        const isCash = entry.includes('*c');
        const cleanText = entry.replace('*c', '').trim();

        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                service: "finance_smart_entry",
                text: cleanText,
                wallet: isCash ? "CASH" : "BANK"
            })
        });
        
        const result = await response.json();
        text.innerText = result.advice; // Qui appare il consiglio cinico!
    }

    setTimeout(loadStats, 1500); // Aggiorna i numeri (Saldo/HP Bar)
    setTimeout(() => bubble.classList.remove('active'), 7000);
}

// Funzione per il fumetto dell'analista (L'occhio verde in alto)
function triggerAnalyst() {
    const bubble = document.getElementById('analyst-bubble');
    if (bubble.style.display === 'block') {
        bubble.style.display = 'none';
    } else {
        bubble.style.display = 'block';
        // Qui potremmo chiamare Gemini per una frase random
    }
}

function showAnalystQuote(text) {
    const bubble = document.getElementById('analyst-bubble');
    const textField = document.getElementById('analyst-text');
    if (textField) textField.innerText = text;
    
    bubble.classList.add('active');
    // Si chiude da sola dopo 5 secondi
    setTimeout(() => { bubble.classList.remove('active'); }, 5000);
}

function toggleAnalyst() {
    document.getElementById('analyst-bubble').classList.toggle('active');
}

function toggleFinanceInput(show) {
    const zone = document.getElementById('finance-input-zone');
    const fab = document.getElementById('fab-finance');
    
    if (show) {
        zone.classList.add('active');
        fab.style.opacity = "0"; // Nasconde il + mentre scrivi
        document.getElementById('finance-input').focus();
    } else {
        zone.classList.remove('active');
        fab.style.opacity = "1";
    }
}
// Chiudi se clicchi fuori
document.getElementById('finance-input').addEventListener('blur', () => {
    setTimeout(() => toggleFinanceInput(false), 200);
});

function updateFinanceUI(stats) {
    // Supponendo che stats.finance contenga i dati dal foglio
    // Se non li hai ancora, dobbiamo mapparli nel getStatsData() del Codice.gs
    document.getElementById('total-balance').innerText = stats.total + " €";
    document.getElementById('bank-val').innerText = stats.bank + " €";
    document.getElementById('cash-val').innerText = stats.cash + " €";
    
    // Calcolo Burn Rate (Esempio su 1000€ di budget)
    let burn = (stats.total_spent / 1000) * 100;
    document.getElementById('efficiency-fill').style.width = burn + "%";
    document.getElementById('burn-percentage').innerText = Math.round(burn) + "%";
}

function renderFinanceLog(transactions) {
    const log = document.getElementById('finance-log');
    if (!log) return;
    
    if (!transactions || transactions.length === 0) {
        log.innerHTML = "<div>NO_DATA_FOUND</div>";
        return;
    }

    log.innerHTML = transactions.map(t => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px; border-bottom: 1px solid #111; padding-bottom: 2px;">
            <span style="color: var(--dim);">${t.date}</span>
            <span style="flex: 1; margin-left: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${t.desc}</span>
            <span style="color: ${t.amt < 0 ? '#ff4d4d' : '#00ff88'}; font-weight: bold; margin-left: 10px;">
                ${t.amt > 0 ? '+' : ''}${parseFloat(t.amt).toFixed(2)}€
            </span>
        </div>
    `).join('');
}