/**
 * SYSTEM_OS - CORE JAVASCRIPT (CLEANED)
 * Rimossi: Habit Tracker, Agenda
 */

// ============================================
// 1. CONFIGURAZIONE E STATO GLOBALE
// ============================================

const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxDmRkeFLKSTTRlkPhOhTaPDR8zKxZ9hqqu9hRUbusustTTFjZXOiPHD3XZz1ClqVzh/exec";

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
let ghostGeneratedText = '';
let balanceHidden = true;
let cachedFinanceStats = null;

// Wallet attivo per Finance input
window.activeWallet = "BANK";

function setWallet(wallet) {
    window.activeWallet = wallet;
    document.querySelectorAll('.wallet-btn').forEach(btn => {
        btn.style.borderColor = btn.dataset.wallet === wallet ? '#00d4ff' : '#333';
        btn.style.color = btn.dataset.wallet === wallet ? '#00d4ff' : '#666';
    });
}

// Salva dati in cache
function cacheData(data) {
    try {
        localStorage.setItem('lifeosData', JSON.stringify(data));
        localStorage.setItem('lifeosDataTimestamp', Date.now());
    } catch(e) {
        console.warn("Cache fallita:", e);
    }
}

// Carica dati da cache
function loadCachedData() {
    try {
        const cached = localStorage.getItem('lifeosData');
        const timestamp = localStorage.getItem('lifeosDataTimestamp');
        
        if (cached) {
            const age = Date.now() - parseInt(timestamp || 0);
            if (age < 30 * 60 * 1000) {
                return JSON.parse(cached);
            }
        }
    } catch(e) {
        console.warn("Lettura cache fallita:", e);
    }
    return null;
}

// ============================================
// 2. CORE & NAVIGATION
// ============================================

window.onload = async () => {
    updateClock();
    setInterval(updateClock, 1000);
    
    const cached = loadCachedData();
    
    if (cached) {
        renderWithData(cached);
        document.getElementById('boot-screen').style.display = 'none';
        
        loadStats().then(freshData => {
            cacheData(freshData);
            renderWithData(freshData);
        });
    } else {
        await runBootSequence();
        
        try {
            await loadStats();
            cacheData(lastStatsData);
        } catch(err) {
            console.error("ERRORE_BOOT_STATS:", err);
        }
        
        setTimeout(() => {
            document.getElementById('boot-screen').style.display = 'none';
        }, 500);
    }
    
    setTimeout(() => {
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('blur', function() {
                if (this.value === "") toggleSearch(false);
            });
        }
        
        const financeInput = document.getElementById('finance-input');
        if (financeInput) {
            financeInput.addEventListener('keypress', handleFinanceSubmit);
            financeInput.addEventListener('blur', () => {
                setTimeout(() => toggleFinanceInput(false), 200);
            });
        }
    }, 100);

    document.addEventListener('click', function(e) {
        const quickMenu = document.getElementById('quick-menu');
        const entryBtn = document.querySelector('.nav-item[onclick*="toggleQuickMenu"]');
        
        if (!quickMenu.classList.contains('quick-menu-hidden') && 
            !quickMenu.contains(e.target) && 
            !entryBtn?.contains(e.target)) {
            toggleQuickMenu();
        }
    });
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
    
    if (pageId === 'body') {
        initBodyModule();
    }
    
    if (pageId === 'reviews') {
        loadReviews();
    }
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
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.status !== "ONLINE") {
            console.warn("Server non online:", data);
            return;
        }

        cacheData(data);
        renderWithData(data);
        
    } catch (err) {
        console.error("ERRORE_CRITICO_SYNC:", err);
        const widgetNotes = document.getElementById('widget-notes');
        if (widgetNotes) widgetNotes.innerText = "ERR";
    }
}

function renderGrid(data) {
    const grid = document.getElementById('keep-grid');
    if (!grid) return;
    
    lastStatsData = data;
    loadedNotesData = data.notes || [];
    const loadedReviewsData = data.reviews || [];

    const widgetNotes = document.getElementById('widget-notes');
    const widgetReviews = document.getElementById('widget-reviews');
    const widgetWeight = document.getElementById('widget-weight');

    
    if (widgetNotes) widgetNotes.innerText = (loadedNotesData.length + 1);

    if (widgetWeight && data.body && data.body.weight) {
        widgetWeight.innerText = data.body.weight.toFixed(1);
    }

    if (widgetReviews) {
        const totalDone = loadedReviewsData.filter(r => {
            const cat = r.categoria ? r.categoria.toUpperCase() : "";
            return !cat.includes("WISH");
        }).length;
        widgetReviews.innerText = totalDone;
    }

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

            if (currentFilter === 'ALL') return type !== 'ARCHIVE';
            if (currentFilter === 'PINNED') return type === 'PINNED';
            if (currentFilter === 'NOTE') return type === 'NOTE' && !content.includes('http');
            if (currentFilter === 'LINK') return content.includes('http');
            if (currentFilter === 'EXTRA') return false;
            if (currentFilter === 'ARCHIVE') return type === 'ARCHIVE';
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
    const note = item.note;
    const index = item.originalIndex;

    console.log("Card:", note.id, "Tipo:", note.type);

    const isPinned = note.type === "PINNED";
    
    const card = document.createElement('div');
    card.className = `keep-card bg-${note.color} ${isPinned ? 'pinnato' : ''}`;
    card.id = `card-${note.id}`;
    card.dataset.type = note.type;
    
    const isDraggable = (currentFilter === 'ALL' && !isSearching);
    card.draggable = isDraggable;

    if (note.type === 'LINK') {
        const lines = note.content.split('\n');
        const title = lines[0]?.replace('🔗 ', '') || 'Link';
        const url = lines[1] || '';   
        const imageUrl = lines[2] || '';
        const description = lines.slice(4).join(' ').substring(0, 80) || '';
   
        
        let domain = '';
        try {
            domain = new URL(url).hostname.replace('www.', '');
        } catch(e) {
            domain = 'link';
        }
        
        card.innerHTML = `
             ${isPinned ? `<div class="pin-indicator" onclick="event.stopPropagation(); togglePinFromCard('${note.id}')"><i class="fas fa-thumbtack"></i></div>` : ''}
        <div style="
            width: 100%;
            height: 80px;
            background: ${imageUrl ? `url('${imageUrl}')` : 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)'};
            background-size: cover;
            background-position: center;
            border-radius: 4px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 1.5rem;
            border: 1px solid #0088ff;
        ">${imageUrl ? '' : '🔗'}</div>
        <div class="title-row" style="color: #0088ff;">${title.toUpperCase()}</div>
        <div class="content-preview" style="font-size: 10px;">${description}</div>
        <div style="font-size: 9px; color: #0088ff; margin-top: 8px; opacity: 0.6;">↗ ${domain}</div>
    `;
        
        card.onclick = (e) => {
            if (!card.classList.contains('dragging')) {
                e.stopPropagation();
                
                if (confirm(`Aprire ${domain}?`)) {
                    window.open(url, '_blank');
                }
            }
        };
        
    } else if (note.type === 'LISTA') {
        const lines = note.content.split('\n');
        const totalItems = lines.filter(l => l.startsWith('☐') || l.startsWith('☑')).length;
        const checkedItems = lines.filter(l => l.startsWith('☑')).length;
        
        // Estrai titolo: prima riga dopo [LISTA] che non è una checkbox
        const contentLines = lines.filter(l => l !== '[LISTA]');
        const titleLine = contentLines.find(l => !l.startsWith('☐') && !l.startsWith('☑') && l.trim());
        const displayTitle = titleLine || note.title || "LISTA";
        
        card.innerHTML = `
            ${isPinned ? `<div class="pin-indicator" onclick="event.stopPropagation(); togglePinFromCard('${note.id}')"><i class="fas fa-thumbtack"></i></div>` : ''}
            <div class="title-row" style="color: #00ff41;">📋 ${displayTitle.toUpperCase()}</div>
            <div class="content-preview">${note.content.substring(0, 100)}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                <div class="label" style="font-size:9px; opacity:0.4;">
                    ${new Date(note.date).toLocaleDateString('it-IT', {day:'2-digit', month:'short'})}
                </div>
                <div style="font-size: 10px; color: #00ff41;">
                    ${checkedItems}/${totalItems} ✓
                </div>
            </div>
        `;
        
        card.onclick = () => {
            if (!card.classList.contains('dragging')) openNoteByIndex(index);
        };
        
    } else {
        card.innerHTML = `
            ${isPinned ? `<div class="pin-indicator" onclick="event.stopPropagation(); togglePinFromCard('${note.id}')"><i class="fas fa-thumbtack"></i></div>` : ''}
            <div class="title-row">${(note.title || "NOTA").toUpperCase()}</div>
            <div class="content-preview">${note.content}</div>
            <div class="label" style="font-size:9px; margin-top:5px; opacity:0.4;">
                ${new Date(note.date).toLocaleDateString('it-IT', {day:'2-digit', month:'short'})}
            </div>
        `;
        
        card.onclick = () => {
            if (!card.classList.contains('dragging')) openNoteByIndex(index);
        };
    }

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

        fragment.appendChild(card);
    });

    grid.innerHTML = "";
    grid.appendChild(fragment);
}

function formattaData(d) {
    if (!d) return "";
    const date = new Date(d);
    return date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
}

function confirmDelete(id, type, event) {
    if(event) event.stopPropagation();
    
    if(confirm("ELIMINARE DEFINITIVAMENTE QUESTA NOTA?")) {
        executeDeleteSecure(id, type);
    }
}

async function executeDeleteSecure(id, type) {
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

    console.log("sendCmd ricevuto:", val);

    if (val.startsWith('-') || val.startsWith('spesa ')) {
        handleFinanceCommand(val);
        input.value = "";
        return;
    }

    const isExtraCmd = /\+\d/.test(val);
    const isWeightCmd = /^\d+(\.\d+)?\s?kg/i.test(val);

    if (!isExtraCmd && !isWeightCmd) {
        const grid = document.getElementById('keep-grid');
        if (grid) {
            const tempCard = document.createElement('div');
            tempCard.className = "keep-card bg-default blink temp-note";
            tempCard.id = 'temp-note-' + Date.now();
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
    
try {
    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({ service: "note", text: val })
    });

    input.placeholder = "> COMMAND_SENT.";
    
    setTimeout(async () => {
        await loadStats();
        document.querySelectorAll('.temp-note').forEach(el => el.remove());
        
        const noteDetail = document.getElementById('note-detail');
        if (noteDetail && noteDetail.style.display === 'flex') {
            if (isExtraCmd) openExtraDetail();
        }
    }, 2000);

} catch (e) {
    console.error("Errore sendCmd:", e);
    input.placeholder = "!! SYNC_ERROR !!";
    document.querySelectorAll('.temp-note').forEach(el => el.remove());
}
}

function handleFinanceCommand(rawText) {
    console.log("Finance command:", rawText);
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

    const modal = document.getElementById('note-detail');
    const detailType = document.getElementById('detail-type');
    const detailText = document.getElementById('detail-text');
    const detailExtraList = document.getElementById('detail-extra-list');
    const backdrop = document.getElementById('modal-backdrop');
    const linkContainer = document.getElementById('link-view-container');
    const todoContainer = document.getElementById('interactive-todo-container');
    
    const todoModal = document.getElementById('todo-modal');
    const linkModal = document.getElementById('link-modal');
    const ghostModal = document.getElementById('ghost-modal');

    if (detailExtraList) detailExtraList.style.display = 'none';
    if (linkContainer) linkContainer.style.display = 'none';
    if (todoContainer) todoContainer.style.display = 'none';
    if (detailText) detailText.style.display = 'block'; 

    if (todoModal) todoModal.style.display = 'none';
    if (linkModal) linkModal.style.display = 'none';
    if (ghostModal) ghostModal.style.display = 'none';

    currentNoteData = { 
        id: note.id, 
        type: note.type, 
        color: note.color, 
        index: index 
    };
    
    const colorBtn = document.querySelector('.color-selector-container');
    const pinTool = document.querySelector('.tool-icon i.fa-thumbtack')?.parentElement;
    const pinIcon = document.querySelector('.tool-icon i.fa-thumbtack');

    if (!modal || !detailType || !detailText || !detailExtraList) return;

    if(colorBtn) colorBtn.style.display = "block";
    if(pinTool) pinTool.style.display = "flex";
    
    detailType.innerText = note.title || "NOTA";
    
    if (note.type === 'LINK') {
        const lines = note.content.split('\n');
        const url = lines[1] || '';
        const imageUrl = lines[2] || '';
        const description = lines.slice(4).join('\n') || '';
        
        detailText.style.display = 'none';
        
        let linkView = document.getElementById('link-view-container');
        if (!linkView) {
            linkView = document.createElement('div');
            linkView.id = 'link-view-container';
            linkView.style.cssText = 'flex: 1; padding: 20px; display: flex; flex-direction: column; gap: 20px; overflow-y: auto;';
            detailText.parentElement.appendChild(linkView);
        }
        
        linkView.style.display = 'flex';
        linkView.innerHTML = `
            ${imageUrl ? `<div style="width: 100%; height: 200px; background: url('${imageUrl}'); background-size: cover; background-position: center; border-radius: 8px; border: 1px solid #0088ff;"></div>` : ''}
            <div style="background: #0a0a0a; padding: 20px; border-radius: 8px; border-left: 3px solid #0088ff;">
                <div style="font-size: 10px; color: #666; margin-bottom: 5px;">LINK SALVATO</div>
                <a href="${url}" target="_blank" style="color: #0088ff; font-size: 14px; text-decoration: none; word-break: break-all; display: block; margin-bottom: 15px;">${url}</a>
                <button onclick="window.open('${url}', '_blank')" style="background: #0088ff; color: #000; border: none; padding: 12px 24px; border-radius: 4px; cursor: pointer; font-family: 'Rajdhani'; font-weight: bold; width: 100%;">APRI_LINK ↗</button>
            </div>
            ${description ? `<div style="color: #aaa; font-size: 13px; line-height: 1.6; padding: 15px; background: rgba(255,255,255,0.02); border-radius: 4px;">${description}</div>` : ''}
        `;
    } else if (note.content.includes('☐') || note.content.includes('☑') || note.content.startsWith('[LISTA]')) {
        renderInteractiveTodo(note);
    } else {
        detailText.value = note.content;
        detailText.style.display = "block";
    }
    
    if(pinIcon) pinIcon.style.color = (note.type === "PINNED") ? "var(--accent)" : "var(--dim)";
    modal.className = `note-overlay bg-${note.color}`;
    modal.style.display = 'flex';
    if (backdrop) backdrop.style.display = 'block';
}

function openExtraDetail() {
    const todoModal = document.getElementById('todo-modal');
    const linkModal = document.getElementById('link-modal');
    const ghostModal = document.getElementById('ghost-modal');
    const noteModal = document.getElementById('note-detail');
    
    if (todoModal) todoModal.style.display = 'none';
    if (linkModal) linkModal.style.display = 'none';
    if (ghostModal) ghostModal.style.display = 'none';
    if (noteModal) noteModal.style.display = 'none';

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
        
        const todoContainer = document.getElementById('interactive-todo-container');
        let newText;

        const linkContainer = document.getElementById('link-view-container');

        if (linkContainer && linkContainer.style.display !== 'none') {
            const oldNote = loadedNotesData[currentNoteData.index];
            newText = oldNote.content;
            console.log("LINK - Mantengo contenuto originale:", newText.substring(0, 50));
            
        } else if (todoContainer && todoContainer.style.display !== 'none') {
            newText = saveTodoStateSync();
        } else {
            newText = textArea.value.trim();
            console.log("NOTA - Testo da textarea:", newText);
        }
        
        const oldNote = loadedNotesData[currentNoteData.index];

        if (oldNote) {
            oldNote.content = newText;
            oldNote.color = currentNoteData.color;
            renderGrid(lastStatsData);
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

    modal.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
    
    const colorPicker = document.getElementById('color-picker-bubble');
    const deleteModal = document.getElementById('delete-modal');
    if (colorPicker) colorPicker.style.display = 'none';
    if (deleteModal) deleteModal.style.display = 'none';
    
    const todoContainer = document.getElementById('interactive-todo-container');
    if (textArea) textArea.style.display = 'block';
    if (todoContainer) todoContainer.style.display = 'none';
    
    currentNoteData = null;
    detailMonthOffset = 0;
}

async function saveAndClose() {
    const text = document.getElementById('detail-text').value.trim();

    if (currentNoteData && currentNoteData.id) {
        closeNoteDetail(true);
        return;
    }
    
    if (!text) {
        closeNoteDetail(false);
        return;
    }
    
    const saveBtn = document.querySelector('.tool-icon[onclick="saveAndClose()"]');
    if (saveBtn) {
        saveBtn.innerHTML = '<span class="blink">...</span>';
        saveBtn.style.pointerEvents = 'none';
    }
    
    const fakeId = 'temp_' + Date.now();
    const fakeNote = {
        id: fakeId,
        date: new Date(),
        type: 'NOTE',
        content: text,
        color: currentNoteData.color || 'default',
        title: 'SALVANDO...'
    };
    
    loadedNotesData.unshift(fakeNote);
    lastStatsData.notes = loadedNotesData;
    renderGrid(lastStatsData);
    closeNoteDetail(false);
    
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ service: "note", text: text })
        });
        
        setTimeout(() => loadStats(), 2000);
        
    } catch(e) {
        console.error("Errore:", e);
        loadedNotesData = loadedNotesData.filter(n => n.id !== fakeId);
        renderGrid({ notes: loadedNotesData });
    }
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
    
    const note = loadedNotesData[currentNoteData.index];
    if (note) {
        note.color = color;
    }
    
    const card = document.getElementById(`card-${currentNoteData.id}`);
    if (card) {
        card.className = `keep-card bg-${color}${currentNoteData.type === 'PINNED' ? ' pinnato' : ''}`;
    }
}

async function togglePin() {
    if (!currentNoteData || currentNoteData.type === "EXTRA") return;

    const nuovoStato = (currentNoteData.type === "PINNED") ? "NOTE" : "PINNED";
    currentNoteData.type = nuovoStato;
    
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
    
    renderGrid(lastStatsData);
}

async function togglePinFromCard(id) {
    const noteIndex = loadedNotesData.findIndex(n => String(n.id) === String(id));
    if (noteIndex === -1) return;
    
    const note = loadedNotesData[noteIndex];
    const newType = note.type === "PINNED" ? "NOTE" : "PINNED";

    note.type = newType;
    renderGrid(lastStatsData);

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
    
    const noteModal = document.getElementById('note-detail');
    const backdrop = document.getElementById('modal-backdrop');
    if (noteModal) noteModal.style.display = 'none';
    if (backdrop) backdrop.style.display = 'none';
    
    const card = document.getElementById(`card-${deleteTarget.id}`);
    if (card) {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.8)';
        card.style.transition = 'all 0.3s ease';
        
        setTimeout(() => {
            card.style.display = 'none';
        }, 300);
    }
    
    const indexToRemove = loadedNotesData.findIndex(n => String(n.id) === String(deleteTarget.id));
    if (indexToRemove !== -1) {
        loadedNotesData.splice(indexToRemove, 1);
    }
    
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
        loadStats();
    });
    
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

function toggleBrainSearch() {
    const overlay = document.getElementById('brain-search-overlay');
    const input = document.getElementById('brain-search-input');
    
    if (overlay.style.display === 'none' || !overlay.style.display) {
        overlay.style.display = 'block';
        setTimeout(() => {
            overlay.style.transform = 'translateY(0)';
            input.focus();
        }, 10);
    } else {
        overlay.style.transform = 'translateY(100%)';
        setTimeout(() => {
            overlay.style.display = 'none';
            input.value = '';
            filterNotes('');
        }, 300);
    }
}

function filterNotes(query) {
    const searchTerm = query.toLowerCase().trim();
    const allCards = document.querySelectorAll('.keep-card');
    
    if (!searchTerm) {
        allCards.forEach(card => card.style.display = 'flex');
        return;
    }
    
    allCards.forEach(card => {
        const title = card.querySelector('.title-row')?.textContent.toLowerCase() || '';
        const content = card.querySelector('.content-preview')?.textContent.toLowerCase() || '';
        
        if (title.includes(searchTerm) || content.includes(searchTerm)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
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
// 7. FINANCE
// ============================================

async function handleFinanceSubmit(event) {
    if (event.key !== 'Enter') return;
    const input = document.getElementById('finance-input');
    const rawText = input.value.trim();
    if (!rawText) return;

    input.blur();
    toggleFinanceInput(false);
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    text.innerText = "NEURAL_PROCESSING_IN_PROGRESS...";
    bubble.classList.add('active');
    input.value = '';

    try {
        const textLower = rawText.toLowerCase();
        // Priorità: keyword nel testo > wallet selezionato nell'UI
        let targetWallet = window.activeWallet || "BANK";

        if (textLower.includes('*cash') || (textLower.includes('cash') && !textLower.includes('cashback'))) {
            targetWallet = "CASH";
        } else if (textLower.includes('*tin') || textLower.includes('tinaba')) {
            targetWallet = "TINABA";
        } else if (textLower.includes('*pay') || textLower.includes('paypal')) {
            targetWallet = "PAYPAL";
        } else if (textLower.includes('*bank') || textLower.includes('banca')) {
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

        const responseData = await response.text();
        
        try {
            const result = JSON.parse(responseData);
            if (result.status === "SUCCESS") {
                text.innerText = result.advice.toUpperCase();
                if (typeof loadStats === "function") await loadStats();
            } else {
                text.innerText = "DANGER: " + (result.message || "SYNC_ERROR");
            }
        } catch (e) {
            console.error("Server Error Raw:", responseData);
            text.innerText = "CRITICAL_ERROR: APPS_SCRIPT_CRASHED";
        }

    } catch (err) {
        text.innerText = "CONNECTION_LOST: SYNC_FAILED";
        console.error(err);
    }
    
    setTimeout(() => bubble.classList.remove('active'), 6000);
}

function toggleAnalyst() {
    const bubble = document.getElementById('analyst-bubble');
    const inputZone = document.getElementById('finance-input-zone');
    
    inputZone.classList.remove('active');
    bubble.classList.toggle('active');
}

function toggleFinanceInput(show) {
    const inputZone = document.getElementById('finance-input-zone');
    const input = document.getElementById('finance-input');
    
    if (show) {
        inputZone.style.display = 'block';
        setTimeout(() => {
            inputZone.classList.add('active');
            input.focus();
        }, 10);
    } else {
        input.blur();
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
        const color = t.amt < 0 ? "#ff0055" : "#00ff88";

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

async function showTransactionNote(noteText, description, advice) {
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    if (!bubble || !text) return;

    bubble.classList.remove('active');
    void bubble.offsetWidth; 
    bubble.classList.add('active');

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
    
    setTimeout(() => bubble.classList.remove('active'), 8000);
}

let allTransactions = [];

function toggleFilters(show) {
    const overlay = document.getElementById('filter-overlay');
    const input = document.getElementById('log-search');
    const container = document.getElementById('filtered-results');
    
    if(show) {
        overlay.style.display = 'block';
        input.value = '';
        input.focus();
        container.innerHTML = `<div style="text-align:center; color:#444; margin-top:30px; font-size:12px;">DIGITA E PREMI INVIO PER CERCARE NEL DATABASE COMPLETO</div>`;
    } else {
        overlay.style.display = 'none';
        input.blur();
    }
}

function applyFilters() {
    const query = document.getElementById('log-search').value.toLowerCase();
    const allData = lastStatsData.finance.full_history || [];
    
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

function quickFilter(tag) {
    const input = document.getElementById('finance-search');
    const currentVal = input.value.trim();

    if (!currentVal.includes(tag)) {
        input.value = currentVal ? `${currentVal} ${tag}` : tag;
    }

    aiSearchActive = false; 
    const aiStatus = document.getElementById('fin-ai-status');
    if(aiStatus) aiStatus.innerText = 'OFF';
    
    document.getElementById('search-clear').style.display = 'block';
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
    container.innerHTML = ''; 
}

function switchPage(pageId) {
    document.querySelectorAll('.app-page').forEach(p => p.style.display = 'none');
    
    const target = document.getElementById(pageId + '-page');
    if (target) {
        target.style.display = 'block';
    }

    if (pageId === 'log') {
        if (lastStatsData) renderFilteredItems(lastStatsData.finance.transactions);
    }
    
    if (window.lucide) lucide.createIcons();
}

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

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const weightModal = document.getElementById('weight-log-modal');
        if (weightModal && weightModal.style.display !== 'none') {
            closeWeightLog();
        }
        
        const workoutModal = document.getElementById('workout-feeling-modal');
        if (workoutModal && workoutModal.style.display === 'block') {
            closeWorkoutFeeling();
        }
    }
});

function switchFinanceTab(target) {
    const dashboard = document.getElementById('finance-home-view');
    const searchView = document.getElementById('finance-search-view');
    const statsView = document.getElementById('finance-stats-view');

    // Toggle: se già aperta la stessa vista, torna alla home
    if (target === 'stats' && statsView && statsView.style.display === 'block') {
        [searchView, statsView].forEach(v => { if(v) v.style.display = 'none'; });
        if(dashboard) dashboard.style.display = 'block';
        if (window.lucide) lucide.createIcons();
        return;
    }
    if (target === 'log' && searchView && searchView.style.display === 'block') {
        [searchView, statsView].forEach(v => { if(v) v.style.display = 'none'; });
        if(dashboard) dashboard.style.display = 'block';
        if (window.lucide) lucide.createIcons();
        return;
    }

    [dashboard, searchView, statsView].forEach(v => { if(v) v.style.display = 'none' });

    if (target === 'log') {
        searchView.style.display = 'block';
    } else if (target === 'stats') {
        statsView.style.display = 'block';
        
        if (cachedFinanceStats) {
            renderFinanceStatsView(cachedFinanceStats);
        } else {
            showCustomAlert("DATI_NON_DISPONIBILI");
        }
    } else {
        dashboard.style.display = 'block';
    }
    
    if (window.lucide) lucide.createIcons();
}

function renderFinanceStats(financeData) {
    const stats = {
        categories: financeData.categories || {},
        income: financeData.income || 0,
        spent: financeData.spent || 0
    };
    
    window.preCalculatedStats = stats;
}

let myChart = null;

function toggleStats() {
    const listView = document.getElementById('finance-list-view');
    const statsView = document.getElementById('finance-stats-view');
    
    if (statsView.style.display === 'block') {
        statsView.style.display = 'none';
        listView.style.display = 'block';
        return;
    }
    
    if (!cachedFinanceStats) {
        showCustomAlert("DATI_NON_DISPONIBILI");
        return;
    }
    
    renderFinanceStatsView(cachedFinanceStats);
    
    statsView.style.display = 'block';
    listView.style.display = 'none';
}

function renderFinanceStatsView(stats) {
    console.log("=== DEBUG STATS ===");
    console.log("stats completo:", stats);
    console.log("categories:", stats.categories);
    console.log("topCategories:", stats.topCategories);
    console.log("===================");
    const container = document.getElementById('finance-stats-view');
    
    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 10px;">
            
            <div style="background: #0a0a0a; border: 1px solid #1a1a1a; padding: 12px; border-radius: 4px;">
                <h3 style="color: #ff0055; font-family: 'Rajdhani'; font-size: 0.9rem; margin-bottom: 10px;">💸 SPESO</h3>
                <div style="font-size: 1.5rem; color: #ff0055; font-family: 'JetBrains Mono';">${stats.spent.toFixed(2)}€</div>
            </div>
            
            <div style="background: #0a0a0a; border: 1px solid #1a1a1a; padding: 12px; border-radius: 4px;">
                <h3 style="color: var(--accent); font-family: 'Rajdhani'; font-size: 0.9rem; margin-bottom: 10px;">💰 ENTRATE</h3>
                <div style="font-size: 1.5rem; color: var(--accent); font-family: 'JetBrains Mono';">${stats.income.toFixed(2)}€</div>
            </div>
            
            <div style="grid-column: 1 / -1; background: #0a0a0a; border: 1px solid #1a1a1a; padding: 15px; border-radius: 4px;">
                <h3 style="color: var(--accent); font-family: 'Rajdhani'; font-size: 0.9rem; margin-bottom: 10px;">🛡️ AUTONOMIA</h3>
                <div style="font-size: 0.85rem; color: #aaa; margin-bottom: 8px;">
                    Saldo: ${stats.total.toFixed(2)}€ | Spesa media: ${stats.spent.toFixed(2)}€
                </div>
                <div style="font-size: 2rem; color: ${stats.isNegative ? '#ff0055' : 'var(--accent)'}; font-family: 'Rajdhani'; font-weight: 700;">
                    ${stats.isNegative ? '⚠️ ' : ''}${stats.survivalMonths} ${stats.survivalMonths === '∞' ? '' : 'MESI'}
                </div>
                <div style="width: 100%; height: 8px; background: #111; border-radius: 4px; margin-top: 10px; overflow: hidden;">
                    <div style="width: ${stats.isNegative ? '100%' : Math.min(100, parseFloat(stats.survivalMonths) * 10) + '%'}; height: 100%; background: ${stats.isNegative ? '#ff0055' : 'var(--accent)'};"></div>
                </div>
            </div>
            
            <div style="grid-column: 1 / -1; background: #0a0a0a; border: 1px solid #1a1a1a; padding: 15px; border-radius: 4px;">
                <h3 style="color: var(--accent); font-family: 'Rajdhani'; font-size: 0.9rem; margin-bottom: 15px;">📊 CATEGORIE</h3>
                <canvas id="categoryChart" style="max-height: 180px;"></canvas>
            </div>
            
            <div style="grid-column: 1 / -1; background: #0a0a0a; border: 1px solid #1a1a1a; padding: 15px; border-radius: 4px;">
                <h3 style="color: var(--accent); font-family: 'Rajdhani'; font-size: 0.9rem; margin-bottom: 15px;">🔥 TOP 3</h3>
                ${stats.topCategories.map((cat, idx) => `
                    <div style="display: flex; justify-content: space-between; padding: 10px; background: rgba(255,255,255,0.02); margin-bottom: 6px; border-radius: 4px; border-left: 3px solid ${['#ff0055', '#ff9500', '#ffcc00'][idx]};">
                        <span style="font-size: 0.9rem;">${idx + 1}. ${cat[0]}</span>
                        <span style="color: ${['#ff0055', '#ff9500', '#ffcc00'][idx]}; font-family: 'JetBrains Mono';">${cat[1].toFixed(2)}€</span>
                    </div>
                `).join('')}
            </div>
            
        </div>
    `;
    
    setTimeout(() => {
        if (stats.categories && Object.keys(stats.categories).length > 0) {
            renderCategoryChart(stats.categories);
        }
    }, 100);
}

let financeChart = null;

function renderCategoryChart(categories) {
    const canvas = document.getElementById('categoryChart');
    if (!canvas) {
        console.error("Canvas categoryChart non trovato!");
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    if (financeChart) {
        financeChart.destroy();
    }

    financeChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categories),
            datasets: [{
                data: Object.values(categories),
                backgroundColor: ['#00f3ff', '#ff0055', '#9d00ff', '#00ff88', '#ffb300'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { color: '#aaa', font: { family: 'Rajdhani', size: 10 } } 
                }
            }
        }
    });
}

function updateUI(data) {
    loadedNotesData = data.notes; 
    renderGrid();

    if (data.extraTotal) {
        document.getElementById('extra-hours-val').innerText = data.extraTotal + "h";
    }
    
    if (data.finance) {
        document.getElementById('bank-val').innerText = "€ " + data.finance.bank;
    }
}

function toggleQuickMenu() {
    const menu = document.getElementById('quick-menu');
    menu.classList.toggle('active');
}

document.addEventListener('click', function(e) {
    const menu = document.getElementById('quick-menu');
    const entryBtn = document.querySelector('#nav-entry');
    
    if (menu.classList.contains('active') && 
        !menu.contains(e.target) && 
        !entryBtn?.contains(e.target)) {
        menu.classList.remove('active');
    }
});

async function createNew(type) {
    const noteDetail = document.getElementById('note-detail');
    const detailText = document.getElementById('detail-text');
    const detailExtraList = document.getElementById('detail-extra-list');
    const linkViewContainer = document.getElementById('link-view-container');
    const todoContainer = document.getElementById('interactive-todo-container');
    const backdrop = document.getElementById('modal-backdrop');

    if (noteDetail && noteDetail.style.display === 'flex') {
        closeNoteDetail(false);
    }

    if (type === 'NOTE') {
        if (backdrop) backdrop.style.display = 'block';
        
        if (detailExtraList) detailExtraList.style.display = 'none';
        if (linkViewContainer) linkViewContainer.style.display = 'none';
        if (todoContainer) todoContainer.style.display = 'none';
        
        if (detailText) {
            detailText.style.display = 'block';
            detailText.value = "";
        }
        
        currentNoteData = { id: null, type: 'NOTE', text: '', color: 'default', index: null };
        
        document.getElementById('detail-type').innerText = 'NOTA';
        noteDetail.className = 'note-overlay bg-default';
        noteDetail.style.display = 'flex';
        
        setTimeout(() => detailText.focus(), 50);
        changeNoteColor('default');
    }

    if (type === 'LISTA') {
        try {
            todoItems = [];
            const modalTodo = document.getElementById('todo-modal');
            
            if (!modalTodo) return console.error("todo-modal mancante!");
            
            modalTodo.style.display = 'flex';
            if (backdrop) backdrop.style.display = 'block';
            
            document.getElementById('todo-items-container').innerHTML = '';
            
            // Reset titolo
            const titleInput = document.getElementById('todo-list-title');
            if (titleInput) titleInput.value = '';
            
            const input = document.getElementById('new-todo-item');
            if (input) {
                input.value = '';
                setTimeout(() => input.focus(), 50);
            }
        } catch(e) {
            console.error("Errore LISTA:", e);
        }
    }

    if (type === 'GHOST') {
        const modalGhost = document.getElementById('ghost-modal');
        if (!modalGhost) return;
        
        modalGhost.style.display = 'flex';
        if (backdrop) backdrop.style.display = 'block';
        
        const ghostInput = document.getElementById('ghost-input');
        ghostInput.value = '';
        document.getElementById('ghost-output-container').style.display = 'none';
        
        ghostGeneratedText = '';
        setTimeout(() => ghostInput.focus(), 50);
    }
}

let todoItems = [];

function addTodoItem() {
    const input = document.getElementById('new-todo-item');
    const text = input.value.trim();
    
    if (!text) return;
    
    const id = 'item_' + Date.now();
    todoItems.push({ id: id, text: text, checked: false });
    
    input.style.borderColor = 'var(--accent)';
    input.style.background = 'rgba(0,255,65,0.1)';
    
    setTimeout(() => {
        input.style.borderColor = 'var(--accent)';
        input.style.background = '#0a0a0a';
    }, 200);
    
    renderTodoItems();
    input.value = '';
    input.focus();
}

function renderTodoItems() {
    const container = document.getElementById('todo-items-container');
    
    container.innerHTML = todoItems.map(item => `
        <div style="
            display: flex; 
            align-items: center; 
            gap: 12px; 
            padding: 12px; 
            background: rgba(255,255,255,0.02); 
            margin-bottom: 8px; 
            border-radius: 4px;
            border-left: 2px solid ${item.checked ? '#00ff41' : '#333'};
        ">
            <div 
                onclick="toggleTodoItem('${item.id}')" 
                style="
                    min-width: 20px;
                    width: 20px; 
                    height: 20px; 
                    border: 2px solid ${item.checked ? 'var(--accent)' : '#444'};
                    background: ${item.checked ? 'var(--accent)' : 'transparent'};
                    border-radius: 3px;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                "
            >
                ${item.checked ? '<i data-lucide="check" style="width: 14px; color: #000;"></i>' : ''}
            </div>
            <span style="
                flex: 1; 
                font-family: 'JetBrains Mono';
                font-size: 13px;
                ${item.checked ? 'text-decoration: line-through; opacity: 0.4;' : 'color: #eee;'}
            ">${item.text}</span>
            <i 
                data-lucide="x" 
                style="width: 16px; color: #666; cursor: pointer; opacity: 0.5;" 
                onclick="removeTodoItem('${item.id}')"
            ></i>
        </div>
    `).join('');
    
    if(window.lucide) lucide.createIcons();
}

function toggleTodoItem(id) {
    const item = todoItems.find(i => i.id === id);
    if (item) item.checked = !item.checked;
    renderTodoItems();
}

function removeTodoItem(id) {
    todoItems = todoItems.filter(i => i.id !== id);
    renderTodoItems();
}

async function saveTodoList() {
    if (todoItems.length === 0) {
        showCustomAlert("ADD_AT_LEAST_ONE_ITEM");
        return;
    }
    
    const saveBtn = document.querySelector('button[onclick="saveTodoList()"]');
    saveBtn.innerHTML = '<span class="blink">SAVING...</span>';
    saveBtn.disabled = true;
    
    // Includi titolo opzionale
    const titleInput = document.getElementById('todo-list-title');
    const listTitle = titleInput ? titleInput.value.trim() : '';
    const titleLine = listTitle ? listTitle + '\n' : '';
    
    const todoText = "[LISTA]\n" + titleLine + todoItems.map(i => `${i.checked ? '☑' : '☐'} ${i.text}`).join('\n');
    
    const fakeId = 'temp_' + Date.now();
    const fakeNote = {
        id: fakeId,
        date: new Date(),
        type: 'LISTA',
        content: todoText,
        color: 'default',
        title: listTitle || 'TODO_LIST'
    };
    
    loadedNotesData.unshift(fakeNote);
    lastStatsData.notes = loadedNotesData;
    
    const grid = document.getElementById('keep-grid');
    if (grid) {
        const totalItems = todoItems.length;
        const checkedItems = todoItems.filter(i => i.checked).length;
        
        const cardHTML = `
            <div class="keep-card bg-default" id="card-${fakeId}" style="cursor: pointer; border-left: 3px solid #00ff41;">
                <div class="title-row" style="color: #00ff41;">📋 ${(listTitle || 'TODO_LIST').toUpperCase()}</div>
                <div class="content-preview">${todoText.substring(0, 100)}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 10px;">
                    <div class="label" style="font-size:9px; opacity:0.4;">JUST_NOW</div>
                    <div style="font-size: 10px; color: #00ff41;">${checkedItems}/${totalItems} ✓</div>
                </div>
            </div>
        `;
        
        const lastPinned = grid.querySelector('.pinnato:last-of-type');
        if (lastPinned) {
            lastPinned.insertAdjacentHTML('afterend', cardHTML);
        } else {
            grid.insertAdjacentHTML('afterbegin', cardHTML);
        }
    }
    
    closeTodoModal();
    
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ 
                service: "note", 
                text: todoText 
            })
        });
        
        showCustomAlert("NOTA_INVIATA", true);
        setTimeout(() => loadStats(), 2000);
        
    } catch(e) {
        console.error("Errore salvataggio:", e);
        const fakeCard = document.getElementById(`card-${fakeId}`);
        if (fakeCard) fakeCard.remove();
        showCustomAlert("SAVE_ERROR");
    }
}

function closeTodoModal() {
    document.getElementById('todo-modal').style.display = 'none';
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.style.display = 'none'; 
    todoItems = [];
    document.getElementById('todo-items-container').innerHTML = '';
    const titleInput = document.getElementById('todo-list-title');
    if (titleInput) titleInput.value = '';
}

function openNoteDetail(noteId) {
    const note = loadedNotesData.find(n => String(n.id) === String(noteId));
    
    if (!note) {
        console.error("Nota non trovata:", noteId);
        return;
    }
    
    currentNoteData = note;
    
    document.getElementById('modal-backdrop').style.display = 'block';
    const modal = document.getElementById('note-detail');
    modal.style.display = 'flex';
    
    document.getElementById('detail-type').innerText = note.type || 'NOTA';
    
    const textArea = document.getElementById('detail-text');
    
    if (note.content.includes('☐') || note.content.includes('☑') || note.content.startsWith('[LISTA]')) {
        renderInteractiveTodo(note);
    } else {
        textArea.style.display = 'block';
        textArea.value = note.content;
        
        const todoContainer = document.getElementById('interactive-todo-container');
        if (todoContainer) todoContainer.style.display = 'none';
    }
    
    changeNoteColor(note.color || 'default');
}

function renderInteractiveTodo(note) {
    const textArea = document.getElementById('detail-text');
    textArea.style.display = 'none';
    
    let todoContainer = document.getElementById('interactive-todo-container');
    if (!todoContainer) {
        todoContainer = document.createElement('div');
        todoContainer.id = 'interactive-todo-container';
        todoContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px;';
        textArea.parentElement.appendChild(todoContainer);
    }
    
    todoContainer.style.display = 'block';
    
    const lines = note.content.split('\n');
    
    // Filtra [LISTA] tag
    const contentLines = lines.filter(l => l !== '[LISTA]');
    
    // Prima riga non-checkbox = titolo
    const titleLine = contentLines.find(l => !l.startsWith('☐') && !l.startsWith('☑') && l.trim());
    const checkboxLines = contentLines.filter(l => l.startsWith('☐') || l.startsWith('☑'));
    
    const items = checkboxLines.map((line, idx) => {
        const checked = line.startsWith('☑');
        // Detect URL nel testo
        const text = line.replace(/^[☐☑]\s*/, '');
        return { id: 'saved_' + idx, text, checked };
    }).filter(i => i.text.trim());
    
    const titleHTML = titleLine ? `
        <input 
            type="text" 
            id="todo-title-edit" 
            value="${titleLine.replace(/"/g, '&quot;')}"
            placeholder="NOME_LISTA..."
            style="width:100%; background:transparent; border:none; border-bottom:1px solid #333; 
                   color:#00ff41; font-family:'Rajdhani'; font-size:1rem; font-weight:bold;
                   letter-spacing:1px; padding:8px 0; margin-bottom:12px; outline:none; box-sizing:border-box;"
            onchange="saveTodoState()"
        >
    ` : `
        <input 
            type="text" 
            id="todo-title-edit" 
            value=""
            placeholder="AGGIUNGI_TITOLO..."
            style="width:100%; background:transparent; border:none; border-bottom:1px solid #222; 
                   color:#555; font-family:'Rajdhani'; font-size:0.9rem;
                   letter-spacing:1px; padding:6px 0; margin-bottom:12px; outline:none; box-sizing:border-box;"
            onchange="saveTodoState()"
        >
    `;
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    
    todoContainer.innerHTML = titleHTML + items.map(item => {
        // Render URL come link cliccabili
        const textWithLinks = item.text.replace(urlRegex, (url) => {
            let domain = url;
            try { domain = new URL(url).hostname.replace('www.', ''); } catch(e) {}
            return `<a href="${url}" target="_blank" onclick="event.stopPropagation()" 
                       style="color:#00d4ff; text-decoration:none; font-size:11px;">↗ ${domain}</a>`;
        });
        
        return `
        <div style="
            display: flex; 
            align-items: flex-start; 
            gap: 12px; 
            padding: 12px; 
            background: rgba(255,255,255,0.02); 
            margin-bottom: 8px; 
            border-radius: 4px;
        ">
            <div 
                onclick="toggleSavedTodo(this, '${item.id}')" 
                style="
                    min-width: 20px; width: 20px; height: 20px; margin-top: 2px;
                    border: 2px solid ${item.checked ? 'var(--accent)' : '#444'};
                    background: ${item.checked ? 'var(--accent)' : 'transparent'};
                    border-radius: 3px; cursor: pointer;
                    display: flex; align-items: center; justify-content: center;
                "
                data-checked="${item.checked}"
            >
                ${item.checked ? '<i data-lucide="check" style="width: 14px; color: #000;"></i>' : ''}
            </div>
            <span style="
                flex: 1; font-family: 'JetBrains Mono'; font-size: 13px; line-height: 1.5;
                ${item.checked ? 'text-decoration: line-through; opacity: 0.4;' : 'color: #eee;'}
            " data-text="${item.text.replace(/"/g, '&quot;')}">${textWithLinks}</span>
        </div>`;
    }).join('');
    
    if(window.lucide) lucide.createIcons();
}

function toggleSavedTodo(checkbox, id) {
    const isChecked = checkbox.getAttribute('data-checked') === 'true';
    const newChecked = !isChecked;
    
    checkbox.setAttribute('data-checked', newChecked);
    checkbox.style.background = newChecked ? 'var(--accent)' : 'transparent';
    checkbox.style.borderColor = newChecked ? 'var(--accent)' : '#444';
    
    const textSpan = checkbox.nextElementSibling;
    if (newChecked) {
        checkbox.innerHTML = '<i data-lucide="check" style="width: 14px; color: #000;"></i>';
        textSpan.style.textDecoration = 'line-through';
        textSpan.style.opacity = '0.4';
    } else {
        checkbox.innerHTML = '';
        textSpan.style.textDecoration = 'none';
        textSpan.style.opacity = '1';
    }
    
    if(window.lucide) lucide.createIcons();
    saveTodoState();
}

// Versione sincrona per closeNoteDetail
function saveTodoStateSync() {
    const container = document.getElementById('interactive-todo-container');
    if (!container) return '';
    
    const titleInput = document.getElementById('todo-title-edit');
    const titleLine = titleInput ? titleInput.value.trim() : '';
    
    const items = Array.from(container.querySelectorAll('[data-text]')).map(span => {
        const checkbox = span.previousElementSibling;
        const checked = checkbox ? checkbox.getAttribute('data-checked') === 'true' : false;
        const text = span.getAttribute('data-text');
        return `${checked ? '☑' : '☐'} ${text}`;
    });
    
    return '[LISTA]\n' + (titleLine ? titleLine + '\n' : '') + items.join('\n');
}

async function saveTodoState() {
    const container = document.getElementById('interactive-todo-container');
    if (!container || !currentNoteData || !currentNoteData.id) return;
    
    const newContent = saveTodoStateSync();
    
    // Aggiorna dati locali
    const note = loadedNotesData[currentNoteData.index];
    if (note) note.content = newContent;
    
    await fetch(SCRIPT_URL, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify({
            service: 'update_note',
            id: currentNoteData.id,
            text: newContent
        })
    });
}

function filterArchive() {
    const navArchive = document.getElementById('nav-stats');
    
    if (currentFilter === 'ARCHIVE') {
        currentFilter = 'ALL';
        if (navArchive) navArchive.style.color = 'var(--dim)';
    } else {
        currentFilter = 'ARCHIVE';
        if (navArchive) navArchive.style.color = 'var(--accent)';
    }
    
    renderGrid(lastStatsData);
}

function toggleGhostAI() {
    const qMenu = document.getElementById('quick-menu');
    if (qMenu && !qMenu.classList.contains('quick-menu-hidden')) {
        qMenu.classList.add('quick-menu-hidden');
    }

    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    if (!bubble || !text) return;

    bubble.classList.remove('active');
    void bubble.offsetWidth;
    
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
    
    setTimeout(() => {
        text.innerHTML = `
            <div style="font-size:0.7rem; color:var(--dim);">GHOST_RESPONSE:</div>
            <div style="color:#fff; margin-top:8px;">Gemini non ancora collegato.<br>
            <span style="color:var(--accent);">Query ricevuta: "${query}"</span></div>
        `;
    }, 1000);
}

// ============================================
// 8. REVIEWS
// ============================================

function isWish(r) {
    if (!r || !r.categoria) return false;
    return r.categoria.toUpperCase().includes("WISH");
}

function getCleanCat(r) {
    if (!r || !r.categoria) return "VARIE";
    const parts = r.categoria.split(",").map(p => p.trim().toUpperCase());
    return parts.find(p => p !== "WISH") || "VARIE";
}

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
    const parts = dateStr.split('-');
    if (parts.length < 3) return dateStr;
    const months = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUGL", "AGO", "SET", "OTT", "NOV", "DIC"];
    return `${parts[2]} ${months[parseInt(parts[1]) - 1]}`;
}

let allReviews = [];
let isWishlistView = false;
let isStatsView = false;

function loadReviews() {
    isWishlistView = false;
    const headerTitle = document.querySelector('#reviews .header h1');
    if (headerTitle) headerTitle.innerText = 'REVIEWS';

    if (lastStatsData && lastStatsData.reviews) {
        allReviews = lastStatsData.reviews;
        
        const allChip = document.querySelector('.filter-chip');
        if (allChip) filterByCategory('ALL', allChip);
    } else {
        const list = document.getElementById('reviews-list');
        if (list) list.innerHTML = `<div style="text-align:center; opacity:0.3; padding:40px;">SYNCING...</div>`;
        
        setTimeout(() => {
            if (lastStatsData && lastStatsData.reviews) {
                allReviews = lastStatsData.reviews;
                const allChip = document.querySelector('.filter-chip');
                if (allChip) filterByCategory('ALL', allChip);
            }
        }, 2000);
    }
}

function renderReviews(data, showOnlyWish = false) {
    const list = document.getElementById('reviews-list');
    if (!list) return;

    const filteredData = showOnlyWish 
        ? data.filter(item => isWish(item))
        : data;

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
    const color = catColors[getCleanCat(item)] || 'var(--accent)';
    const dateStr = formatItalianDate(item.data);
    
    const itemIsWish = isWish(item);
    const starsHtml = itemIsWish 
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
    if (!input) return showCustomAlert("SCRIVI_QUALCOSA");

    closeReviewEntry();

    const list = document.getElementById('reviews-list');
    const tempId = "temp_" + Date.now();
    const loadingCard = document.createElement('div');
    loadingCard.id = tempId;
    loadingCard.className = "review-card";
    loadingCard.style.opacity = "0.5";
    loadingCard.style.borderLeft = "3px solid var(--accent)";
    loadingCard.innerHTML = `
        <div class="poster-mini" style="background: #111;">
            <div class="blink" style="color: var(--accent);">AI_PROCESSING...</div>
        </div>
        <div class="review-info">
            <div class="review-title" style="color: var(--accent);">ANALISI_IN_CORSO...</div>
        </div>
    `;
    list.prepend(loadingCard);

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                service: 'processReviewAI',
                text: input 
            })
        });
        
        const result = await response.json();
        
        if (result.status === "SUCCESS") {
            const ai = result.data;
            
            loadingCard.style.opacity = "1";
            loadingCard.innerHTML = `
                <div class="poster-mini" style="background-image: url('${ai.image_url || ''}'); background-size: cover; background-position: center;">
                    ${!ai.image_url ? '<span style="font-size: 2rem;">🎬</span>' : ''}
                </div>
                <div class="review-info">
                    <div class="review-top">
                        <span class="review-title" style="color: #00d4ff;">${(ai.titolo || "").toUpperCase()}</span>
                        <span class="rating-stars">${renderStars(ai.rating, '#00d4ff')}</span>
                    </div>
                    <div class="review-comment">${ai.commento_breve || ""}</div>
                    <div class="review-meta">
                        <span>${ai.categoria}</span>
                        <span>${new Date().toLocaleDateString('it-IT', {day: '2-digit', month: 'short'})}</span>
                    </div>
                </div>
            `;
            
            if (window.lucide) lucide.createIcons();
            setTimeout(() => loadStats(), 2000);
            
        } else {
            loadingCard.innerHTML = `<div style="padding:10px; color:#ff4d4d;">ERRORE: ${result.message || 'SYNC_FAILED'}</div>`;
        }
    } catch (error) {
        console.error("Review error:", error);
        loadingCard.innerHTML = `<div style="padding:10px; color:#ff4d4d;">ERRORE_CONNESSIONE</div>`;
    }
}

function toggleWishlist() {
    if (isStatsView) toggleStats(); 

    isWishlistView = !isWishlistView;
    
    const wishBtn = document.getElementById('nav-wish');
    const headerTitle = document.querySelector('#reviews .header h1');
    
    if (headerTitle) {
        headerTitle.innerText = isWishlistView ? 'WISHLIST' : 'REVIEWS';
    }

    if (wishBtn) {
        wishBtn.style.color = isWishlistView ? "var(--accent)" : "var(--dim)";
        const icon = wishBtn.querySelector('i');
        if (icon) icon.setAttribute('data-lucide', isWishlistView ? 'bookmark-check' : 'bookmark-plus');
    }

    const allChip = Array.from(document.querySelectorAll('.filter-chip')).find(el => el.innerText.includes('ALL'));
    filterByCategory('ALL', allChip);

    if(window.lucide) lucide.createIcons();
}

function openReviewDetail(id) {
    if (!allReviews || allReviews.length === 0) return;
    
    const item = allReviews.find(r => String(r.id) === String(id));
    if (!item) return;

    const itemIsWish = isWish(item);
    const cleanCat = getCleanCat(item);
    const catColors = { 'FILM': '#00d4ff', 'SERIE': '#ff0055', 'GAME': '#00ff44', 'COMIC': '#ffcc00', 'WISH': '#888888' };
    const color = catColors[cleanCat] || 'var(--accent)';
    
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
                        ${itemIsWish ? `
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

                <div class="review-text-zone">${(item.commento_full || item.commento || 'Nessun testo.').trim()}
                    
                    ${itemIsWish ? `
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

function promoteToReview(id) {
    const item = allReviews.find(r => String(r.id) === String(id));
    if (!item) return;
    closeReviewDetail();
    openReviewEntry();
    document.getElementById('ai-review-input').value = `Ho completato ${item.titolo}. Ecco il mio voto e parere: `;
}

function toggleStats() {
    isStatsView = !isStatsView;
    
    const statsBtn = document.getElementById('nav-stats');
    const wishBtn = document.getElementById('nav-wish');
    const list = document.getElementById('reviews-list');
    const statsCont = document.getElementById('reviews-stats-container');
    const headerTitle = document.querySelector('#reviews .header h1');

    if (isStatsView) {
        isWishlistView = false; 
        if (headerTitle) headerTitle.innerText = 'DATA_INTELLIGENCE';
        
        if (statsBtn) {
            statsBtn.style.setProperty('color', 'var(--accent)', 'important');
            statsBtn.style.opacity = "1";
        }
        if (wishBtn) {
            wishBtn.style.setProperty('color', 'var(--dim)', 'important');
            wishBtn.style.opacity = "0.5";
        }
        
        list.style.display = 'none';
        statsCont.style.display = 'block';
        
        const allChip = Array.from(document.querySelectorAll('.filter-chip')).find(el => el.innerText.includes('ALL'));
        document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
        if (allChip) allChip.classList.add('active');
        
        generateStatsHTML('6M', 'ALL'); 
    } else {
        if (headerTitle) headerTitle.innerText = 'REVIEWS';
        if (statsBtn) {
            statsBtn.style.setProperty('color', 'var(--dim)', 'important');
            statsBtn.style.opacity = "0.5";
        }
        list.style.display = 'flex';
        statsCont.style.display = 'none';
        
        const allChip = Array.from(document.querySelectorAll('.filter-chip')).find(el => el.innerText.includes('ALL'));
        filterByCategory('ALL', allChip);
    }
    
    if(window.lucide) lucide.createIcons();
}

function generateStatsHTML(period = '6M', filterCat = 'ALL') {
    const container = document.getElementById('reviews-stats-container');
    const isAll = filterCat === 'ALL';
    
    let activeReviews = allReviews.filter(r => {
        const itemIsWish = isWish(r);
        const cleanCat = getCleanCat(r);
        return !itemIsWish && (isAll || cleanCat === filterCat.toUpperCase());
    });

    const categoryWishCount = allReviews.filter(r => {
        const itemIsWish = isWish(r);
        const cleanCat = getCleanCat(r);
        return itemIsWish && (isAll || cleanCat === filterCat.toUpperCase());
    }).length;

    const counts = { FILM: 0, SERIE: 0, GAME: 0, COMIC: 0 };
    let totalRating = 0;
    
    activeReviews.forEach(r => {
        const cat = getCleanCat(r);
        if(counts[cat] !== undefined) counts[cat]++;
        totalRating += parseFloat(r.rating || 0);
    });

    const avgRating = activeReviews.length ? (totalRating / activeReviews.length).toFixed(1) : 0;
    const colors = { FILM: '#00d4ff', SERIE: '#ff0055', GAME: '#00ff44', COMIC: '#ffcc00' };

    let trendData = {};
    let trendHTML = '';
    const now = new Date();

    if (period === 'ALL') {
        trendHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; height: 120px;">
                ${Object.entries(counts).map(([cat, val]) => `
                    <div style="background: rgba(255,255,255,0.02); border: 1px solid #1a1a1a; padding: 10px; display: flex; flex-direction: column; justify-content: center; opacity: ${isAll || filterCat === cat ? 1 : 0.2}">
                        <div style="font-size: 8px; color: ${colors[cat]}; letter-spacing: 1px;">${cat}_TOTAL</div>
                        <div style="font-size: 20px; font-family: 'Rajdhani'; color: #fff;">${val}</div>
                    </div>
                `).join('')}
            </div>`;
    } else {
        const mesi = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUGL", "AGO", "SET", "OTT", "NOV", "DIC"];
        if (period === '1Y') {
            mesi.forEach(m => trendData[m] = 0);
            activeReviews.forEach(r => {
                const d = new Date(r.data);
                if(!isNaN(d) && d.getFullYear() === now.getFullYear()) {
                    trendData[mesi[d.getMonth()]]++;
                }
            });
        } else {
            for(let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                trendData[d.toLocaleString('it-IT', { month: 'short' }).toUpperCase()] = 0;
            }
            activeReviews.forEach(r => {
                const d = new Date(r.data);
                if(!isNaN(d)) {
                    const label = d.toLocaleString('it-IT', { month: 'short' }).toUpperCase();
                    if(trendData.hasOwnProperty(label)) trendData[label]++;
                }
            });
        }

        const maxVal = Math.max(...Object.values(trendData), 1);
        trendHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-end; height:100px; gap:4px; padding-bottom:10px;">
                ${Object.entries(trendData).map(([label, val]) => {
                    const h = (val / maxVal) * 100;
                    return `
                        <div style="flex:1; display:flex; flex-direction:column; align-items:center; gap:5px; height:100%; justify-content:flex-end;">
                            <div style="font-size:7px; color:var(--accent);">${val > 0 ? val : ''}</div>
                            <div style="width:100%; height:${h}%; background:var(--accent); opacity:${val > 0 ? 0.6 : 0.05}; border-radius:1px;"></div>
                            <div style="font-size:7px; color:#333; transform:rotate(-45deg); margin-top:10px; white-space:nowrap;">${label}</div>
                        </div>`;
                }).join('')}
            </div>`;
    }

    container.innerHTML = `
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-bottom: 20px;">
            <div style="background:#0a0a0a; border:1px solid #1a1a1a; padding:12px; border-radius:4px; text-align:center;">
                <div style="font-size:8px; color:#444; margin-bottom:5px;">LOGS [${filterCat}]</div>
                <div style="font-size:18px; font-family:'Rajdhani'; color:#fff;">${activeReviews.length}</div>
            </div>
            <div style="background:#0a0a0a; border:1px solid #1a1a1a; padding:12px; border-radius:4px; text-align:center;">
                <div style="font-size:8px; color:#444; margin-bottom:5px;">SCORE AVG</div>
                <div style="font-size:18px; font-family:'Rajdhani'; color:#ffcc00;">${avgRating}</div>
            </div>
            <div style="background:#0a0a0a; border:1px solid #1a1a1a; padding:12px; border-radius:4px; text-align:center;">
                <div style="font-size:8px; color:#444; margin-bottom:5px;">WISH [${filterCat}]</div>
                <div style="font-size:18px; font-family:'Rajdhani'; color:var(--accent);">${categoryWishCount}</div>
            </div>
        </div>

        <div style="background:#0a0a0a; border:1px solid #1a1a1a; padding:15px; border-radius:4px; margin-bottom:20px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                <h3 style="font-family:'Rajdhani'; font-size:10px; color:#444; letter-spacing:1px; margin:0;">${filterCat}_ACTIVITY</h3>
                <div style="display:flex; gap:10px; font-size:9px; font-family:'JetBrains Mono';">
                    <span onclick="generateStatsHTML('6M', '${filterCat}')" style="cursor:pointer; color:${period==='6M'?'var(--accent)':'#444'}">6M</span>
                    <span onclick="generateStatsHTML('1Y', '${filterCat}')" style="cursor:pointer; color:${period==='1Y'?'var(--accent)':'#444'}">1Y</span>
                    <span onclick="generateStatsHTML('ALL', '${filterCat}')" style="cursor:pointer; color:${period==='ALL'?'var(--accent)':'#444'}">ALL</span>
                </div>
            </div>
            ${trendHTML}
        </div>

        <div style="background:#0a0a0a; border:1px solid #1a1a1a; padding:15px; border-radius:4px; display: ${isAll ? 'block' : 'none'}">
            <h3 style="font-family:'Rajdhani'; font-size:10px; color:#444; margin-bottom:15px; letter-spacing:1px;">MEDIA_DISTRIBUTION</h3>
            ${Object.entries(counts).map(([cat, count]) => {
                const p = activeReviews.length ? (count / activeReviews.length * 100) : 0;
                return `
                    <div style="margin-bottom:12px;">
                        <div style="display:flex; justify-content:space-between; font-size:9px; margin-bottom:4px; font-family:'JetBrains Mono'; color:#888;">
                            <span style="color:${colors[cat]}">${cat}</span>
                            <span>${count}</span>
                        </div>
                        <div style="width:100%; height:3px; background:#111; border-radius:2px; overflow:hidden;">
                            <div style="width:${p}%; height:100%; background:${colors[cat]};"></div>
                        </div>
                    </div>`;
            }).join('')}
        </div>`;
    
    if(window.lucide) lucide.createIcons();
}

function filterByCategory(cat, element) {
    document.querySelectorAll('.filter-chip').forEach(el => el.classList.remove('active'));
    if (element) element.classList.add('active');

    if (isStatsView) {
        generateStatsHTML('6M', cat);
    } else {
        const filtered = allReviews.filter(r => {
            const itemIsWish = isWish(r);
            const cleanCat = getCleanCat(r);
            const matchView = isWishlistView ? itemIsWish : !itemIsWish;
            const matchCat = (cat === 'ALL') ? true : (cleanCat === cat);
            return matchView && matchCat;
        });

        renderReviews(filtered, false);
    }
    if(window.lucide) lucide.createIcons();
}

let currentSearchQuery = "";

function handleSearch(query) {
    currentSearchQuery = query.toLowerCase().trim();
    
    const activeChip = document.querySelector('.filter-chip.active');
    const currentCat = activeChip ? activeChip.innerText.split(' ')[0] : 'ALL';
    
    filterByCategory(currentCat, activeChip);
}

// ============================================
// 9. BODY MODULE
// ============================================

let bodyData = {
    currentWeight: null,
    weightHistory: [],
    workouts: [],
    todayLog: {}
};

let currentBodyView = 'dashboard';
let selectedMood = null;
let selectedEnergy = null;

async function loadBodyData() {
    if (!lastStatsData || !lastStatsData.body) {
        console.log("Body data not available yet");
        return;
    }
    
    bodyData.currentWeight = lastStatsData.body.weight || 94.5;
    bodyData.workouts = lastStatsData.body.workouts || [];
    bodyData.weightHistory = lastStatsData.body.weightHistory || [];
    
    renderBodyDashboard();
}

function renderBodyDashboard() {
    const weightEl = document.getElementById('body-current-weight');
    if (weightEl && bodyData.currentWeight) {
        weightEl.innerText = bodyData.currentWeight.toFixed(1);
    }
    
    const deltaEl = document.getElementById('body-weight-delta');
    if (deltaEl) {
        if (bodyData.weightHistory && bodyData.weightHistory.length > 1) {
            const current = bodyData.currentWeight;
            const previous = bodyData.weightHistory[bodyData.weightHistory.length - 2].weight;
            const delta = current - previous;
            const arrow = delta < 0 ? '↓' : delta > 0 ? '↑' : '→';
            const color = delta < 0 ? '#00ff41' : delta > 0 ? '#ff4d4d' : '#666';
            deltaEl.innerHTML = `<span style="color:${color};">${arrow} ${Math.abs(delta).toFixed(1)} kg</span>`;
        } else {
            deltaEl.innerHTML = '<span style="color:#666;">Aggiungi più dati peso</span>';
        }
    }
    
    const streakEl = document.getElementById('body-streak');
    if (streakEl) {
        const streak = calculateStreak(bodyData.workouts);
        streakEl.innerText = streak;
    }
    
    renderTodayLog();
    renderRecentWorkouts();
}

function calculateStreak(workouts) {
    if (!workouts || workouts.length === 0) return 0;
    
    const today = new Date();
    const TARGET_WORKOUTS_PER_WEEK = 3;
    const weeklyWorkouts = {};
    
    workouts.forEach(w => {
        const date = new Date(w.date);
        const weekNum = getWeekNumber(date);
        const weekKey = `${date.getFullYear()}-W${weekNum}`;
        weeklyWorkouts[weekKey] = (weeklyWorkouts[weekKey] || 0) + 1;
    });
    
    let streak = 0;
    let currentDate = new Date(today);
    const currentWeekKey = `${currentDate.getFullYear()}-W${getWeekNumber(currentDate)}`;

    if ((weeklyWorkouts[currentWeekKey] || 0) < TARGET_WORKOUTS_PER_WEEK) {
        currentDate.setDate(currentDate.getDate() - 7);
    }

    while (true) {
        const weekNum = getWeekNumber(currentDate);
        const weekKey = `${currentDate.getFullYear()}-W${weekNum}`;
        
        if ((weeklyWorkouts[weekKey] || 0) >= TARGET_WORKOUTS_PER_WEEK) {
            streak++;
            currentDate.setDate(currentDate.getDate() - 7);
        } else {
            break; 
        }
        
        if (streak > 52) break;
    }
    
    return streak;
}

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function renderTodayLog() {
    const container = document.getElementById('body-today-log');
    if (!container) return;
    
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    
    const todayWorkout = bodyData.workouts.find(w => {
        const wDate = new Date(w.date).toISOString().split('T')[0];
        return wDate === todayStr;
    });
    
    const todayWeight = bodyData.weightHistory && bodyData.weightHistory.length > 0 
        && new Date(bodyData.weightHistory[bodyData.weightHistory.length - 1].date).toISOString().split('T')[0] === todayStr;
    
    const todayLogs = [];
    
    if (todayWorkout) {
        const exCount = Array.isArray(todayWorkout.exercises) && typeof todayWorkout.exercises[0] === 'object' 
            ? todayWorkout.exercises.length 
            : 'Completato';

        todayLogs.push({ 
            type: 'workout', 
            time: new Date(todayWorkout.date).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'}), 
            text: typeof exCount === 'number' ? `Allenamento (${exCount} esercizi)` : `Allenamento: ${exCount}`, 
            status: 'done' 
        });
    }
    
    if (todayWeight) {
        todayLogs.push({ 
            type: 'weight', 
            time: new Date(bodyData.weightHistory[bodyData.weightHistory.length - 1].date).toLocaleTimeString('it-IT', {hour: '2-digit', minute: '2-digit'}), 
            text: `Peso: ${bodyData.currentWeight}kg`, 
            status: 'done' 
        });
    }
    
    if (todayLogs.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#333; padding:20px; font-size:10px;">NESSUN_LOG_OGGI</div>';
        return;
    }
    
    container.innerHTML = todayLogs.map(log => {
        const icon = log.type === 'workout' ? '💪' : '⚖️';
        const statusIcon = log.status === 'done' ? '✓' : '⏳';
        
        return `
            <div style="display: flex; align-items: center; gap: 12px; padding: 10px 0; border-bottom: 1px solid #111;">
                <div style="font-size: 1.2rem;">${icon}</div>
                <div style="flex: 1;">
                    <div style="font-size: 0.85rem; color: #fff;">${log.text}</div>
                    <div style="font-size: 0.7rem; color: var(--dim); margin-top: 2px;">${log.time}</div>
                </div>
                <div style="font-size: 1rem; color: #00ff41;">${statusIcon}</div>
            </div>
        `;
    }).join('');
}

function renderRecentWorkouts() {
    const container = document.getElementById('body-recent-workouts');
    if (!container) return;
    
    if (!bodyData.workouts || bodyData.workouts.length === 0) {
        container.innerHTML = '<div style="text-align:center; color:#333; padding:20px; font-size:10px;">NESSUN_WORKOUT_REGISTRATO</div>';
        return;
    }
    
    const lastW = bodyData.workouts[0]; 
    
    const moodEmoji = { "-2": "😫", "-1": "😐", "0": "😊", "1": "😄", "2": "🔥" };
    const date = new Date(lastW.date);
    const dateStr = date.toLocaleDateString('it-IT', {day: '2-digit', month: 'long', year: 'numeric'}).toUpperCase();
    
    const textContent = lastW.exercises_json || lastW.raw || 'Dettagli non disponibili';
    const formattedText = textContent
        .replace(/;/g, '<br>')
        .replace(/\(↑\)/g, '<b style="color: #00ff41;">↑</b>')
        .replace(/\(↓\)/g, '<b style="color: #ff4d4d;">↓</b>')
        .replace(/\(=\)/g, '<b style="color: #666;">=</b>')
        .replace(/\(new\)/g, '<b style="color: #666;">NEW</b>');
    
    container.innerHTML = `
        <div style="background: #111; padding: 15px; border-radius: 6px; border-left: 3px solid #00d4ff;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 0.7rem; color: #555; font-family: 'JetBrains Mono'; margin-bottom: 2px;">DATA_SESSIONE</div>
                    <div style="font-size: 0.85rem; color: #fff; font-family: 'JetBrains Mono';">${dateStr}</div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 1.5rem;">${moodEmoji[String(lastW.mood)] || '😊'}</div>
                </div>
            </div>

            <div style="color: #aaa; font-size: 0.85rem; line-height: 1.6; font-family: 'JetBrains Mono'; margin-bottom: 10px;">
                ${formattedText.split('<br>').slice(0, 3).join('<br>')}
                ${formattedText.split('<br>').length > 3 ? '<div style="color:#444; font-size:0.7rem; margin-top:4px;">...e altri esercizi nella History</div>' : ''}
            </div>

            <div style="display: flex; gap: 15px; border-top: 1px solid #222; pt-10px; margin-top: 10px; padding-top: 10px;">
                <div style="font-size: 0.7rem; color: var(--dim);">
                    <span style="color: #00d4ff;">ENERGY:</span> ${String(lastW.energy).toUpperCase()}
                </div>
                <div style="font-size: 0.7rem; color: var(--dim);">
                    <span style="color: #00d4ff;">TIME:</span> ${lastW.duration || '--'} MIN
                </div>
            </div>
        </div>
    `;

    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectWorkoutMood(value, btn) {
    selectedMood = value;
    
    document.querySelectorAll('#mood-selector button').forEach(b => {
        b.style.borderColor = '#333';
    });
    
    btn.style.borderColor = '#00ff41';
}

function selectWorkoutEnergy(value, btn) {
    selectedEnergy = value;
    
    document.querySelectorAll('#energy-selector button').forEach(b => {
        b.style.borderColor = '#333';
        b.style.color = '#666';
    });
    
    btn.style.borderColor = '#ff9500';
    btn.style.color = '#ff9500';
}

function openQuickLog(type) {
    if (type === 'workout') {
        document.getElementById('workout-feeling-modal').style.display = 'block';
        
        selectedMood = null;
        selectedEnergy = null;
        
        document.querySelectorAll('#mood-selector button').forEach(b => b.style.borderColor = '#333');
        document.querySelectorAll('#energy-selector button').forEach(b => {
            b.style.borderColor = '#333';
            b.style.color = '#666';
        });
        
        setTimeout(() => document.getElementById('workout-feeling-input').focus(), 300);
    } else if (type === 'weight') {
        const modal = document.getElementById('weight-log-modal');
        modal.style.display = 'flex';
        modal.style.position = 'fixed';
        modal.style.top = '0';
        modal.style.left = '0';
        modal.style.width = '100%';
        modal.style.height = '100%';
        modal.style.background = 'rgba(0,0,0,0.9)';
        modal.style.zIndex = '10000';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        
        setTimeout(() => document.getElementById('weight-input').focus(), 300);
    }
}

function closeWeightLog() {
    document.getElementById('weight-log-modal').style.display = 'none';
    document.getElementById('weight-input').value = '';
}

function closeWorkoutFeeling() {
    document.getElementById('workout-feeling-modal').style.display = 'none';
    document.getElementById('workout-feeling-input').value = '';
    document.getElementById('coach-response-zone').style.display = 'none';
}

async function submitWorkoutFeeling() {
    const input = document.getElementById('workout-feeling-input').value.trim();
    if (!input) return;
    
    const btn = document.querySelector('#workout-feeling-modal button[onclick="submitWorkoutFeeling()"]');
    btn.innerHTML = '<span class="blink">ANALISI & SALVATAGGIO...</span>';
    btn.disabled = true;
    
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                service: 'save_workout',
                raw_input: input,
                manual_mood: selectedMood,
                manual_energy: selectedEnergy
            })
        });

        const coachRes = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                action: 'ask_body_coach',
                query: input,
                mood: selectedMood,
                energy: selectedEnergy
            })
        });
        const coachText = await coachRes.text();

        const coachZone = document.getElementById('coach-response-zone');
        coachZone.style.display = 'block';
        coachZone.innerHTML = `<p style="color:#00ff41; font-family:'JetBrains Mono'; font-size:0.85rem; line-height:1.4;">${coachText}</p>
                               <button onclick="location.reload()" style="width:100%; margin-top:10px; padding:10px; background:transparent; border:1px solid #00ff41; color:#00ff41; font-family:'Rajdhani'; cursor:pointer;">CHIUDI_SESSIONE</button>`;
        
    } catch (e) {
        console.error(e);
        btn.innerHTML = 'ERRORE_SINC';
        btn.disabled = false;
    }
}

async function submitWeight() {
    const input = document.getElementById('weight-input');
    const weight = parseFloat(input.value);
    
    if (!weight || weight < 30 || weight > 300) {
        showCustomAlert("PESO_NON_VALIDO");
        return;
    }
    
    input.disabled = true;
    const originalValue = input.value;
    input.value = "SAVING...";
    
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'log_weight', 
                weight: weight
            })
        });
        
        lastStatsData.body.weight = weight;
        bodyData.currentWeight = weight;
        
        if (bodyData.weightHistory) {
            bodyData.weightHistory.push({ date: new Date().toISOString(), weight: weight });
        }

        const bodyCurrentWeightEl = document.getElementById('body-current-weight');
        if (bodyCurrentWeightEl) bodyCurrentWeightEl.innerText = weight.toFixed(1);
        
        const widgetWeight = document.getElementById('widget-weight');
        if (widgetWeight) widgetWeight.innerText = weight.toFixed(1);
        
        showCustomAlert(`PESO_REGISTRATO: ${weight}kg`, true);

        setTimeout(() => {
            closeWeightLog();
            if (typeof renderBodyDashboard === 'function') {
                renderBodyDashboard(); 
            }
        }, 1500);
        
    } catch (e) {
        console.error("Errore peso:", e);
        showCustomAlert("ERRORE_CONNESSIONE");
        input.disabled = false;
        input.value = originalValue;
    }
}

function toggleBodyCoach() {
    const bubble = document.getElementById('body-coach-bubble');
    const text = document.getElementById('body-coach-text');
    const navItem = document.getElementById('body-nav-ai');
    
    if (!bubble || !text) return;

    if (bubble.classList.contains('active')) {
        bubble.classList.remove('active');
        if (navItem) navItem.style.color = 'var(--dim)';
        return;
    }
    
    bubble.classList.add('active');
    if (navItem) navItem.style.color = '#00ff41';
    
    text.innerHTML = `
        <div style="font-size: 0.7rem; color: var(--dim); margin-bottom: 8px; letter-spacing: 2px; font-family: 'Rajdhani';">COACH_AI // READY</div>
        <div style="color: #00ff41; font-size: 0.9rem; margin-bottom: 12px; font-family: 'JetBrains Mono';">
            Che c'è? Hai bisogno di una spinta o vuoi solo lamentarti?
        </div>
        <input type="text" id="coach-input" placeholder="Scrivi qui..." 
               style="width: 100%; background: #111; border: 1px solid #222; color: #fff; padding: 12px; font-family: 'JetBrains Mono'; font-size: 0.85rem; outline: none; border-radius: 4px; box-sizing: border-box;"
               onkeypress="handleCoachInput(event)">
    `;
    
    setTimeout(() => document.getElementById('coach-input')?.focus(), 200);
}

async function handleCoachInput(event) {
    if (event.key !== 'Enter') return;
    
    const input = document.getElementById('coach-input');
    const query = input.value.trim();
    if (!query) return;
    
    const text = document.getElementById('body-coach-text');
    
    text.innerHTML = `<div style="font-size: 0.7rem; color: var(--dim); margin-bottom: 8px; letter-spacing: 2px;">COACH_AI // ANALYZING</div>
                      <div style="color: #00ff41;" class="blink">PENSANDO... (Sii pronto a piangere)</div>`;
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'ask_body_coach',
                query: query
            })
        });
        
        const coachResponse = await response.text();
        
        text.innerHTML = `
            <div style="font-size: 0.7rem; color: var(--dim); margin-bottom: 6px; font-family: 'Rajdhani';">COACH_AI // RESPONSE:</div>
            <div style="color: #fff; line-height: 1.6; font-family: 'JetBrains Mono'; font-size: 0.9rem; margin-bottom: 15px;">
                "${coachResponse}"
            </div>
            <input type="text" id="coach-input" placeholder="Rispondi al coach..." 
                   style="width: 100%; background: #111; border: 1px solid #222; color: #fff; padding: 12px; font-family: 'JetBrains Mono'; font-size: 0.85rem; outline: none; border-radius: 4px; box-sizing: border-box;"
                   onkeypress="handleCoachInput(event)">
            <div onclick="document.getElementById('body-coach-bubble').classList.remove('active'); document.getElementById('body-nav-ai').style.color = 'var(--dim)';" 
                 style="margin-top: 15px; font-size: 0.7rem; color: var(--dim); cursor: pointer; text-align: right; font-family: 'JetBrains Mono';">
                [CHIUDI_SESSIONE]
            </div>
        `;
        
        setTimeout(() => document.getElementById('coach-input')?.focus(), 100);
        
    } catch (e) {
        text.innerHTML = `<div style="color: #ff4d4d;">ERRORE_CONNESSIONE_COACH</div>
                          <div onclick="toggleBodyCoach()" style="cursor:pointer; color:#fff; font-size:0.7rem; margin-top:10px;">[RIPROVA]</div>`;
    }
}

function switchBodyView(view) {
    if (currentBodyView === view) {
        view = 'dashboard';
    }
    
    currentBodyView = view;
    
    document.getElementById('body-dashboard').style.display = 'none';
    document.getElementById('body-stats-view').style.display = 'none';
    document.getElementById('body-history-view').style.display = 'none';
    
    document.querySelectorAll('#body .nav-item').forEach(el => el.style.color = 'var(--dim)');
    
    if (view === 'dashboard') {
        document.getElementById('body-dashboard').style.display = 'block';
    } else if (view === 'stats') {
        document.getElementById('body-stats-view').style.display = 'block';
        document.getElementById('body-nav-stats').style.color = '#00ff41'; 
        renderBodyCharts(); 
    } else if (view === 'history') {
        document.getElementById('body-history-view').style.display = 'block';
        document.getElementById('body-nav-history').style.color = '#00ff41';
        renderBodyHistory();
    }
}

function initBodyModule() {
    console.log("initBodyModule called, lastStatsData:", lastStatsData);
    
    if (!lastStatsData) {
        setTimeout(() => {
            if (lastStatsData) {
                loadBodyData();
                switchBodyView('dashboard');
            } else {
                const dashboard = document.getElementById('body-dashboard');
                if (dashboard) {
                    dashboard.innerHTML = '<div style="text-align:center; padding:40px; color:var(--dim);" class="blink">SYNCING_BODY_DATA...</div>';
                }
            }
        }, 1000);
    } else {
        loadBodyData();
        switchBodyView('dashboard');
    }
}

let weightChartInstance = null;
let workoutChartInstance = null;
let currentViewMonth = new Date().getMonth();
let currentViewYear = new Date().getFullYear();
let weightViewMonth = new Date().getMonth();
let weightViewYear = new Date().getFullYear();

const monthNames = ["GENNAIO", "FEBBRAIO", "MARZO", "APRILE", "MAGGIO", "GIUGNO", "LUGLIO", "AGOSTO", "SETTEMBRE", "OTTOBRE", "NOVEMBRE", "DICEMBRE"];

function renderBodyCharts() {
    const weightCtx = document.getElementById('weight-chart');
    if (weightCtx && bodyData.weightHistory) {
        if (window.weightChartInstance) window.weightChartInstance.destroy();
        
        const filteredWeight = bodyData.weightHistory.filter(h => {
            const d = new Date(h.date);
            return d.getMonth() === weightViewMonth && d.getFullYear() === weightViewYear;
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        const wLabels = filteredWeight.map(h => new Date(h.date).toLocaleDateString('it-IT', {day:'2-digit'}));
        const wValues = filteredWeight.map(h => h.weight);

        window.weightChartInstance = new Chart(weightCtx, {
            type: 'line',
            data: {
                labels: wLabels,
                datasets: [{
                    data: wValues,
                    borderColor: '#00d4ff',
                    backgroundColor: 'rgba(0, 212, 255, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.3,
                    pointRadius: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { grid: { color: '#111' }, ticks: { color: '#666', font: { size: 9 } } },
                    x: { grid: { display: false }, ticks: { color: '#666', font: { size: 9 } } }
                }
            }
        });
        document.getElementById('weight-month-display').innerText = `${monthNames[weightViewMonth]} ${weightViewYear}`;
    }

    const workoutCtx = document.getElementById('workout-chart');
    if (workoutCtx && bodyData.workouts) {
        if (window.workoutChartInstance) window.workoutChartInstance.destroy();

        const filteredWorkouts = bodyData.workouts.filter(w => {
            const d = new Date(w.date);
            return d.getMonth() === currentViewMonth && d.getFullYear() === currentViewYear;
        }).sort((a, b) => new Date(a.date) - new Date(b.date));

        if (filteredWorkouts.length > 0) {
            const labels = filteredWorkouts.map(w => new Date(w.date).toLocaleDateString('it-IT', {day:'2-digit'}));
            const moodValues = filteredWorkouts.map(w => Number(w.mood || 0) + 2); 
            const backgroundFill = moodValues.map(v => 4 - v);
            
            const energyMap = { 'low': 0.8, 'medium': 2, 'mid': 2, 'high': 3.2 };
            const energyValues = filteredWorkouts.map(w => energyMap[String(w.energy).toLowerCase()] || 2);

            window.workoutChartInstance = new Chart(workoutCtx, {
                data: {
                    labels: labels,
                    datasets: [
                        {
                            type: 'line',
                            label: 'Energia',
                            data: energyValues,
                            borderColor: '#00d4ff',
                            borderWidth: 2,
                            pointRadius: 2,
                            tension: 0.4,
                            order: 1
                        },
                        {
                            type: 'bar',
                            label: 'Mood',
                            data: moodValues,
                            backgroundColor: moodValues.map(v => v > 2 ? '#00ff41' : v < 2 ? '#ff4d4d' : '#555'),
                            borderRadius: 4,
                            order: 2
                        },
                        {
                            type: 'bar',
                            label: 'Capsula',
                            data: backgroundFill,
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: 4,
                            order: 3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { stacked: true, grid: { display: false }, ticks: { color: '#444', font: { size: 9 } } },
                        y: { stacked: true, display: false, max: 4 }
                    }
                }
            });
        }
        document.getElementById('current-month-display').innerText = `${monthNames[currentViewMonth]} ${currentViewYear}`;
    }

    renderTopImprovements();
}

function changeMonth(delta) {
    currentViewMonth += delta;
    if (currentViewMonth > 11) { currentViewMonth = 0; currentViewYear++; }
    if (currentViewMonth < 0) { currentViewMonth = 11; currentViewYear--; }
    renderBodyCharts();
}

function changeWeightMonth(delta) {
    weightViewMonth += delta;
    if (weightViewMonth > 11) { weightViewMonth = 0; weightViewYear++; }
    if (weightViewMonth < 0) { weightViewMonth = 11; weightViewYear--; }
    renderBodyCharts();
}

function renderTopImprovements() {
    let topContainer = document.getElementById('body-top-exercises');
    if (!topContainer) {
        topContainer = document.createElement('div');
        topContainer.id = 'body-top-exercises';
        topContainer.style = "background: #0a0a0a; border: 1px solid #222; padding: 20px; border-radius: 8px; margin-top: 20px;";
        document.getElementById('body-stats-view').appendChild(topContainer);
    }

    const stats = {};

    [...bodyData.workouts].reverse().forEach(w => {
        const text = w.exercises_json || w.exercises_text || w.exercises || "";
        if (!text) return;        

        const items = text.split(';');
        items.forEach(item => {
            const match = item.match(/^([^:(]+).*?(\d+(?:\.\d+)?)\s*kg/);
            if (match) {
                const name = match[1].trim();
                const weight = parseFloat(match[2]);

                if (!stats[name]) {
                    stats[name] = { first: weight, last: weight, count: 0 };
                }
                stats[name].last = weight;
                if (item.includes('↑')) stats[name].count++;
            }
        });
    });

    const top3 = Object.entries(stats)
        .map(([name, data]) => ({
            name,
            diff: data.last - data.first,
            last: data.last,
            score: data.count
        }))
        .filter(ex => ex.diff > 0 || ex.score > 0)
        .sort((a, b) => b.diff - a.diff || b.score - a.score)
        .slice(0, 3);

    if (top3.length === 0) {
        topContainer.innerHTML = `<h3 style="font-family:'Rajdhani'; font-size:1rem; color:var(--dim); margin:0;">TOP_PROGRESSION</h3>
                                  <div style="color:#444; font-size:0.8rem; margin-top:10px;">Dati insufficienti per il calcolo progressione.</div>`;
        return;
    }

    topContainer.innerHTML = `
        <h3 style="font-family:'Rajdhani'; font-size:1rem; color:var(--dim); margin:0 0 15px 0;">TOP_PROGRESSION</h3>
        ${top3.map(ex => `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <div style="flex:1;">
                    <div style="color:#fff; font-size:0.85rem;">${ex.name}</div>
                    <div style="color:var(--dim); font-size:0.7rem;">Massimo attuale: ${ex.last}kg</div>
                </div>
                <div style="text-align:right;">
                    <div style="color:#00ff41; font-family:'Rajdhani'; font-weight:bold; font-size:1rem;">
                        ${ex.diff > 0 ? `+${ex.diff}kg` : 'STABILE'} 
                    </div>
                    <div style="font-size:0.6rem; color:#00ff41; opacity:0.7;">GAINS_DETECTED</div>
                </div>
            </div>
        `).join('')}
    `;
}

function renderBodyHistory() {
    const container = document.getElementById('history-list-container');
    const totalSpan = document.getElementById('stat-total-workouts');
    const avgMoodSpan = document.getElementById('stat-avg-mood');
    const avgTimeSpan = document.getElementById('stat-avg-time');
    
    if (!container || !bodyData.workouts) return;

    container.innerHTML = '';
    const workouts = [...bodyData.workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    totalSpan.innerText = workouts.length;

    const avgMood = workouts.length > 0 
        ? (workouts.reduce((acc, curr) => acc + Number(curr.mood || 0), 0) / workouts.length).toFixed(1)
        : 0;
    avgMoodSpan.innerText = (avgMood > 0 ? '+' : '') + avgMood;

    const avgTime = workouts.length > 0
        ? Math.round(workouts.reduce((acc, curr) => acc + Number(curr.duration || 0), 0) / workouts.length)
        : 0;
    if (avgTimeSpan) avgTimeSpan.innerText = avgTime + 'm';

workouts.forEach(w => {
        const dateObj = new Date(w.date);
        const day = dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
        
        const moodEmojis = { "-2": "💀", "-1": "🫠", "0": "😐", "1": "🙂", "2": "🔥" };
        const energyEmojis = { "low": "🪫", "medium": "⚡", "mid": "⚡", "high": "🚀" };
        
const rawText = w.exercises_json || w.exercises_text || w.exercises || "Dettaglio non trovato";
const durationVal = w.duration || w.Duration || "--";

const exercises = rawText.split(';').map(ex => {
    return ex.trim()
        .replace(/\(new\)/g, '<i data-lucide="sparkles" style="width:14px;height:14px;color:#00d4ff;display:inline-block;margin:0 3px;"></i><span style="color: #00d4ff; font-weight: bold;">NEW</span><i data-lucide="sparkles" style="width:14px;height:14px;color:#00d4ff;display:inline-block;margin:0 3px;"></i>')
        .replace(/\(↑\)/g, '<i data-lucide="trending-up" style="width:14px;height:14px;color:#00ff41;display:inline-block;margin:0 3px;"></i>')
        .replace(/\(↓\)/g, '<i data-lucide="trending-down" style="width:14px;height:14px;color:#ff4d4d;display:inline-block;margin:0 3px;"></i>')
        .replace(/\(=\)/g, '<i data-lucide="equal" style="width:14px;height:14px;color:#666;display:inline-block;margin:0 3px;"></i>');
}).filter(Boolean);

const detailText = exercises.map(ex => `• ${ex}`).join('<br>');

const card = document.createElement('div');
        card.style = `
            background: #0a0a0a; 
            border: 1px solid #222; 
            border-left: 4px solid ${Number(w.mood) >= 1 ? '#00ff41' : Number(w.mood) <= -1 ? '#ff4d4d' : '#555'};
            padding: 15px; 
            border-radius: 8px;
            margin-bottom: 12px;
        `;

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-family: 'JetBrains Mono'; font-size: 0.8rem; color: #fff; background: #1a1a1a; padding: 2px 6px; border-radius: 4px;">${day.toUpperCase()}</span>
                    <span style="font-size: 0.9rem;">${moodEmojis[String(w.mood)] || '😐'}</span>
                    <span style="font-size: 0.8rem; opacity: 0.7;">${energyEmojis[String(w.energy).toLowerCase()] || '⚡'}</span>
                </div>
                <span style="font-family: 'JetBrains Mono'; font-size: 0.7rem; color: #00d4ff;">${durationVal} MIN</span>
            </div>
            
            <div style="font-family: 'JetBrains Mono'; font-size: 0.8rem; color: #ccc; line-height: 1.5; margin-bottom: 10px; padding-left: 5px;">
                ${detailText !== "Dettaglio non trovato" 
                    ? detailText
                    : `<span style="color: #444;">Dettaglio non trovato</span>`}
            </div>

            ${w.notes ? `
                <div style="border-top: 1px solid #1a1a1a; padding-top: 8px; margin-top: 5px; font-size: 0.7rem; color: #555; font-style: italic;">
                    ${w.notes}
                </div>
            ` : ''}
        `;
        
        container.appendChild(card);
    });
    
if (window.lucide) lucide.createIcons();
}

// ============================================
// 10. UTILITIES & HELPERS
// ============================================

function renderWithData(data) {
    if (!data) {
        console.warn("renderWithData chiamato senza dati");
        return;
    }
    
    if (data.status !== "ONLINE") return;
    
    historyData = data.history || [];
    extraItemsGlobal = data.extraDetails || [];
    loadedNotesData = data.notes || [];
    lastStatsData = data;
    allReviews = data.reviews || []; 

    if (document.getElementById('reviews')?.classList.contains('active')) {
        const activeChip = document.querySelector('.filter-chip.active');
        const currentCat = activeChip ? activeChip.innerText.split(' ')[0] : 'ALL';
        filterByCategory(currentCat, activeChip || document.querySelector('.filter-chip'));
    }
    
    if (document.getElementById('body')?.classList.contains('active')) {
        loadBodyData();
    }
    
    renderGrid(data);

    if (data.finance) {
        const widgetSpent = document.getElementById('widget-spent');
        
        if (widgetSpent) {
            const spent = parseFloat(data.finance.spent) || 0;
            const income = parseFloat(data.finance.income) || 0;
            
            widgetSpent.innerText = spent.toFixed(2);
            
            let color = '#00ff41';
            
            if (income > 0) {
                const spentPercent = (spent / income) * 100;
                
                if (spentPercent > 85) {
                    color = '#ff0055';
                } else if (spentPercent > 60) {
                    color = '#ff9500';
                } else {
                    color = '#00ff41';
                }
            } else if (spent > 0) {
                color = '#ff0055';
            }
            
            widgetSpent.style.color = color;
        }
        
        const widgetCash = document.getElementById('widget-cash');
        if (widgetCash) widgetCash.innerText = data.finance.cash || "--";

        const totalEl = document.getElementById('total-balance');
        const bankEl = document.getElementById('bank-val');
        const tinabaEl = document.getElementById('tinaba-val');
        const paypalEl = document.getElementById('paypal-val');
        const cashEl = document.getElementById('cash-val');

        const fmt = (v) => balanceHidden ? '***,** €' : (parseFloat(v) || 0).toFixed(2) + ' €';
        
        if (totalEl) totalEl.innerText = fmt(data.finance.total);
        if (bankEl) bankEl.innerText = fmt(data.finance.bank);
        if (tinabaEl) tinabaEl.innerText = fmt(data.finance.tinaba);
        if (paypalEl) paypalEl.innerText = fmt(data.finance.paypal);
        if (cashEl) cashEl.innerText = fmt(data.finance.cash);

        const icon = document.getElementById('balance-toggle');
        if (icon) {
            icon.setAttribute('data-lucide', balanceHidden ? 'eye-off' : 'eye');
            if (window.lucide) lucide.createIcons();
        }

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

        if (data.finance.transactions) {
            renderFinanceLog(data.finance.transactions);
        }

        if (data.finance) {
            cachedFinanceStats = calculateFinanceStats(data.finance);
        }
    }
}

function calculateFinanceStats(financeData) {
    const inc = parseFloat(financeData.income) || 0;
    const out = parseFloat(financeData.spent) || 0;
    const categories = financeData.categories || {};
    const total = parseFloat(financeData.total) || 0;
    
    let survivalMonths = '∞';
    let isNegative = false;
    
    if (out > 0) {
        survivalMonths = (total / out).toFixed(1);
        isNegative = parseFloat(survivalMonths) < 0;
    } else if (total < 0) {
        survivalMonths = '0';
        isNegative = true;
    }
    
    const sortedCats = Object.entries(categories)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
    
    return {
        income: inc,
        spent: out,
        categories: categories,
        survivalMonths: survivalMonths,
        isNegative: isNegative,
        topCategories: sortedCats,
        total: total
    };
}

function toggleBalanceVisibility() {
    balanceHidden = !balanceHidden;
    
    const icon = document.getElementById('balance-toggle');
    const totalEl = document.getElementById('total-balance');
    const bankEl = document.getElementById('bank-val');
    const tinabaEl = document.getElementById('tinaba-val');
    const paypalEl = document.getElementById('paypal-val');
    const cashEl = document.getElementById('cash-val');
    
    const fmt = (v) => balanceHidden ? '***,** €' : (parseFloat(v) || 0).toFixed(2) + ' €';

    if (balanceHidden) {
        if (totalEl) totalEl.innerText = '***,** €';
        if (bankEl) bankEl.innerText = '***,** €';
        if (tinabaEl) tinabaEl.innerText = '***,** €';
        if (paypalEl) paypalEl.innerText = '***,** €';
        if (cashEl) cashEl.innerText = '***,** €';
        if (icon) icon.setAttribute('data-lucide', 'eye-off');
    } else {
        if (lastStatsData?.finance) {
            if (totalEl) totalEl.innerText = fmt(lastStatsData.finance.total);
            if (bankEl) bankEl.innerText = fmt(lastStatsData.finance.bank);
            if (tinabaEl) tinabaEl.innerText = fmt(lastStatsData.finance.tinaba);
            if (paypalEl) paypalEl.innerText = fmt(lastStatsData.finance.paypal);
            if (cashEl) cashEl.innerText = fmt(lastStatsData.finance.cash);
        }
        if (icon) icon.setAttribute('data-lucide', 'eye');
    }
    
    if (window.lucide) lucide.createIcons();
}

const LINK_PREVIEW_API_KEY = "76862f86fbf805677b3ee8f57b38702e";
let currentLinkData = null;

async function fetchLinkPreview() {
    const input = document.getElementById('link-url-input');
    const url = input.value.trim();
    
    if (!url) return;
    
    try {
        new URL(url);
    } catch(e) {
        showCustomAlert("URL_NON_VALIDO");
        return;
    }
    
    input.style.borderColor = 'var(--accent)';
    input.style.background = 'rgba(0,255,65,0.1)';
    input.disabled = true;
    
    try {
        const response = await fetch(`https://api.linkpreview.net/?key=${LINK_PREVIEW_API_KEY}&q=${encodeURIComponent(url)}`);
        const data = await response.json();
        
        if (data.title) {
            currentLinkData = {
                url: url,
                title: data.title,
                description: data.description || '',
                image: data.image || '',
                domain: new URL(url).hostname
            };
            
            document.getElementById('link-preview-title').innerText = data.title;
            document.getElementById('link-preview-description').innerText = data.description || 'No description';
            document.getElementById('link-preview-domain').innerText = '🔗 ' + currentLinkData.domain;
            
            const imgEl = document.getElementById('link-preview-image');
            if (data.image) {
                imgEl.style.backgroundImage = `url(${data.image})`;
            } else {
                imgEl.style.background = '#111';
                imgEl.innerHTML = '<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#333; font-size:3rem;">🔗</div>';
            }
            
            document.getElementById('link-preview-container').style.display = 'block';
            document.getElementById('save-link-btn').disabled = false;
            document.getElementById('save-link-btn').style.opacity = '1';
        } else {
            showCustomAlert("IMPOSSIBILE_OTTENERE_PREVIEW");
        }
        
    } catch(e) {
        console.error("Errore fetch preview:", e);
        showCustomAlert("ERRORE_FETCH_PREVIEW");
    } finally {
        input.style.borderColor = 'var(--accent)';
        input.style.background = '#0a0a0a';
        input.disabled = false;
    }
}

async function saveLinkNote() {
    if (!currentLinkData) return;
    
    const saveBtn = document.getElementById('save-link-btn');
    saveBtn.innerHTML = '<span class="blink">SAVING...</span>';
    saveBtn.disabled = true;
    
    const linkText = `[LINK]\n🔗 ${currentLinkData.title}\n${currentLinkData.url}\n${currentLinkData.image || ''}\n\n${currentLinkData.description}`;
    
    const fakeId = 'temp_' + Date.now();
    const fakeNote = {
        id: fakeId,
        date: new Date(),
        type: 'LINK',
        content: linkText,
        color: 'default',
        title: currentLinkData.title
    };
    
    loadedNotesData.unshift(fakeNote);
    lastStatsData.notes = loadedNotesData;
    
    const grid = document.getElementById('keep-grid');
    if (grid) {
        const cardHTML = `
            <div class="keep-card bg-default" id="card-${fakeId}" style="cursor: pointer; border-left: 3px solid #0088ff;">
                <div style="width: 100%; height: 80px; background: ${currentLinkData.image ? `url('${currentLinkData.image}')` : 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)'}; background-size: cover; background-position: center; border-radius: 4px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; border: 1px solid #0088ff;">${currentLinkData.image ? '' : '🔗'}</div>
                <div class="title-row" style="color: #0088ff;">${currentLinkData.title.toUpperCase()}</div>
                <div class="content-preview" style="font-size: 10px;">${currentLinkData.description.substring(0, 80)}</div>
                <div style="font-size: 9px; color: #0088ff; margin-top: 8px; opacity: 0.6;">↗ ${currentLinkData.domain}</div>
            </div>
        `;
        
        const lastPinned = grid.querySelector('.pinnato:last-of-type');
        if (lastPinned) {
            lastPinned.insertAdjacentHTML('afterend', cardHTML);
        } else {
            grid.insertAdjacentHTML('afterbegin', cardHTML);
        }
    }
    
    closeLinkModal();
    
    try {
        await fetch(SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            body: JSON.stringify({ 
                service: "note", 
                text: linkText 
            })
        });
        
        showCustomAlert("LINK_SALVATO", true);
        setTimeout(() => loadStats(), 2000);
        
    } catch(e) {
        console.error("Errore salvataggio:", e);
        const fakeCard = document.getElementById(`card-${fakeId}`);
        if (fakeCard) fakeCard.remove();
        showCustomAlert("SAVE_ERROR");
    }
}

function closeLinkModal() {
    document.getElementById('link-modal').style.display = 'none';
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.style.display = 'none'; 
    currentLinkData = null;
    document.getElementById('link-url-input').value = '';
    document.getElementById('link-preview-container').style.display = 'none';
}

async function generateGhostText() {
    const input = document.getElementById('ghost-input').value.trim();
    if (!input) return showCustomAlert("SCRIVI_QUALCOSA");

    const btn = document.getElementById('ghost-generate-btn');
    const saveBtn = document.getElementById('ghost-save-btn');
    
    btn.innerHTML = '<span class="blink">AI_PROCESSING...</span>';
    btn.disabled = true;

    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'ghost_rewrite',
                text: input
            })
        });

        const result = await response.text();
        
        if (result && result.length > 0) {
            ghostGeneratedText = result;
            document.getElementById('ghost-output').innerText = result;
            document.getElementById('ghost-output-container').style.display = 'block';

            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
            saveBtn.style.filter = 'brightness(1.2)';
            saveBtn.style.cursor = 'pointer';
        }
    } catch(e) {
        console.error("Errore Ghost:", e);
        showCustomAlert("ERRORE_AI");
    } finally {
        btn.innerHTML = 'GENERA_AI';
        btn.disabled = false;
    }
}

async function saveGhostNote() {
    const input = document.getElementById('ghost-input').value.trim();
    
    if (!input) {
        showCustomAlert("SCRIVI_QUALCOSA_PRIMA");
        return;
    }
    
    const saveBtn = document.getElementById('ghost-save-btn');
    saveBtn.innerHTML = '<span class="blink">AI_PROCESSING...</span>';
    saveBtn.disabled = true;
    
    closeGhostModal();
    
    try {
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({
                action: 'ghost_rewrite',
                text: input
            })
        });
        
        const rewrittenText = await response.text();
        
        await fetch(SCRIPT_URL, {
            method: 'POST',
            body: JSON.stringify({ 
                service: "note", 
                text: `[GHOST]\n${rewrittenText}`
            })
        });
        
        showCustomAlert("NOTA_AI_SALVATA", true);
        setTimeout(() => loadStats(), 2000);
        
    } catch(e) {
        console.error("Errore Ghost:", e);
        showCustomAlert("ERRORE_GHOST");
    }
}

function closeGhostModal() {
    document.getElementById('ghost-modal').style.display = 'none';
    const backdrop = document.getElementById('modal-backdrop');
    if (backdrop) backdrop.style.display = 'none';
    ghostGeneratedText = '';
}

function closeAllModals() {
    document.getElementById('modal-backdrop').style.display = 'none';
    document.getElementById('note-detail').style.display = 'none';
    document.getElementById('todo-modal').style.display = 'none';
    document.getElementById('link-modal').style.display = 'none';
    document.getElementById('ghost-modal').style.display = 'none';
    
    const textArea = document.getElementById('detail-text');
    const todoContainer = document.getElementById('interactive-todo-container');
    const linkContainer = document.getElementById('link-view-container');
    
    if (textArea) textArea.style.display = 'block';
    if (todoContainer) todoContainer.style.display = 'none';
    if (linkContainer) linkContainer.style.display = 'none';
    
    currentNoteData = null;
}

async function toggleArchive() {
    if (!currentNoteData || !currentNoteData.id) return;
    
    const note = loadedNotesData[currentNoteData.index];
    if (!note) return;
    
    const newType = note.type === 'ARCHIVE' ? 'NOTE' : 'ARCHIVE';
    
    note.type = newType;
    currentNoteData.type = newType;
    
    await fetch(SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify({
            service: 'update_note_type',
            id: currentNoteData.id,
            type: newType
        })
    });
    
    showCustomAlert(newType === 'ARCHIVE' ? "ARCHIVIATA" : "RIPRISTINATA", true);
    closeNoteDetail(false);
    
    setTimeout(() => loadStats(), 1000);
}

function showCustomAlert(message, isSuccess = false) {
    const bubble = document.getElementById('analyst-bubble');
    const text = document.getElementById('analyst-text');
    
    if (!bubble || !text) return;
    
    text.innerHTML = `
        <div style="font-size:0.7rem; color:${isSuccess ? 'var(--accent)' : '#ff4d4d'}; 
                    margin-bottom:8px; letter-spacing:2px;">
            ${isSuccess ? '✓ OPERAZIONE_COMPLETATA' : '✗ ERRORE_SISTEMA'}
        </div>
        <div style="color:#fff; font-size:0.9rem; margin-top:10px;">
            ${message}
        </div>
    `;
    
    bubble.classList.add('active');
    setTimeout(() => bubble.classList.remove('active'), 3000);
}