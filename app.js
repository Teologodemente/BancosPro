/* ═══════════════════════════════════════════════════════════════
   BANKTRACKER PRO - Ultra Professional Logic
   ═══════════════════════════════════════════════════════════════ */

// ── Service Worker ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    // Precalienta la caché en background para aperturas instantáneas.
    if (reg.installing) {
      reg.installing.addEventListener('statechange', e => {
        if (e.target.state === 'activated') {
          e.target.postMessage('PRECACHE');
        }
      });
    } else if (reg.active) {
      reg.active.postMessage('PRECACHE');
    }
  }).catch(err => {
    console.log('[SW] Registration failed:', err);
  });
}

// ── Bank Configurations ──
const BANK_CONFIG = {
  'BanRegio':    { color: '#2563eb', gradient: 'linear-gradient(135deg, #2563eb, #1d4ed8)', abbr: 'BR', close: '17:00' },
  'Santander':   { color: '#dc2626', gradient: 'linear-gradient(135deg, #dc2626, #b91c1c)', abbr: 'ST', close: '16:00' },
  'BanBajío':    { color: '#e11d48', gradient: 'linear-gradient(135deg, #e11d48, #be123c)', abbr: 'BB', close: '16:00' },
};

// ── Company Configurations ──
const COMPANY_CONFIG = {
  'Sertecma':      { gradient: 'linear-gradient(135deg, #00d4ff, #0090ff)', abbr: 'S' },
  'Sertecgarce':   { gradient: 'linear-gradient(135deg, #a855f7, #7c3aed)', abbr: 'SG' },
  'Tecnología':    { gradient: 'linear-gradient(135deg, #22c55e, #16a34a)', abbr: 'T' },
};

// ── Jarvis Phrases ──
const JARVIS_PHRASES = {
  allComplete: [
    'Todos los retiros completados. Operación finalizada con éxito.',
    'Misión cumplida. Fondos retirados exitosamente.',
    'Sistemas reportan cero pendientes. Excelente trabajo.',
    'Todos los bancos en verde. Operación cerrada.',
  ],
  somePending: [
    'Aún hay trabajo por hacer. Mantenga el ritmo.',
    'Pendientes activos detectados. No baje la guardia.',
    'Retiros en proceso. El tiempo corre.',
  ],
  noneStarted: [
    'Ningún retiro iniciado. Los bancos esperan su orden.',
    'Sistemas listos, sin actividad. ¿Damos la orden?',
    'Todo pendiente. El día apenas comienza.',
  ],
  closingSoon: [
    '¡Atención! Un banco está por cerrar.',
    'Alerta. Queda poco tiempo en un banco.',
    'El reloj avanza. Un banco cierra pronto.',
  ],
  withdrawSuccess: [
    'Retiro registrado. Fondos actualizados.',
    'Transacción confirmada. Estado actualizado.',
    'Retiro procesado exitosamente.',
  ],
  bankAdded: [
    'Nuevo retiro registrado en el sistema.',
    'Retiro añadido al panel de control.',
  ],
};

// ── State ──
let banks = [];
let currentWithdrawBankId = null;
let currentDeleteBankId = null;
let currentEditRecordDate = null;
let currentEditRecordIndex = null;
let currentDayDetailDate = null;
let timerInterval = null;
let selectedCompany = null;
let selectedBank = null;
let currentStep = 1;
let currentEditBankId = null;
let currentEditChequeBankId = null;
let currentEditChequeId = null;
let currentEditWithdrawItem = null;

// ── DOM Elements ──
const $ = id => document.getElementById(id);
const bankList = $('bankList');
const emptyState = $('emptyState');
const summaryDashboard = $('summaryDashboard');
const jarvisMessage = $('jarvisMessage');
const modalAdd = $('modalAdd');
const modalWithdraw = $('modalWithdraw');
const modalDelete = $('modalDelete');
const modalFinalize = $('modalFinalize');
const modalHistory = $('modalHistory');
const modalDayDetail = $('modalDayDetail');
const modalEditRecord = $('modalEditRecord');
const modalEditBank = $('modalEditBank');
const modalEditCheque = $('modalEditCheque');
const toast = $('toast');

// ── Utility Functions ──
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Formato compacto para montos grandes: $152,000 en vez de $152,000.00.
// Los centavos solo se muestran cuando el monto es chico (donde importan).
function formatCurrency(amount) {
  const n = Number(amount) || 0;
  const hasCents = Math.abs(n % 1) >= 0.005;
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

// Igual que formatCurrency, pero con los centavos en tamaño reducido ($1,250.<span>50</span>).
// Sirve para las cifras grandes de las tarjetas: se leen mejor de un vistazo.
function formatCurrencyParts(amount) {
  const full = formatCurrency(amount);
  const i = full.lastIndexOf('.');
  if (i === -1) return full;
  return `${full.slice(0, i)}<span class="cents">${full.slice(i)}</span>`;
}

// Estimación mental-friendly de un porcentaje: 83%, 84.5%, 12.5%...
function formatPercent(value) {
  const v = Number(value) || 0;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
}

function getBankConfig(bankName) {
  return BANK_CONFIG[bankName] || { color: '#6b7280', gradient: 'linear-gradient(135deg, #6b7280, #4b5563)', abbr: '??', close: '16:00' };
}

function getCompanyConfig(companyName) {
  return COMPANY_CONFIG[companyName] || { gradient: 'linear-gradient(135deg, #6b7280, #4b5563)', abbr: '??' };
}

// Gradiente de la empresa para usarlo como etiqueta/fondo destacado.
function companyConfigGradient(companyName) {
  return getCompanyConfig(companyName).gradient;
}

function getBankStatus(bank) {
  if (bank.withdrawn <= 0) return 'red';
  if (bank.withdrawn < bank.totalAmount) return 'orange';
  return 'green';
}

function getRemaining(bank) {
  return Math.max(0, bank.totalAmount - bank.withdrawn);
}

function getProgress(bank) {
  if (bank.totalAmount <= 0) return 0;
  return Math.min((bank.withdrawn / bank.totalAmount) * 100, 100);
}

function getChequesTotal(bank) {
  if (!bank.cheques || bank.cheques.length === 0) return 0;
  return bank.cheques.reduce((sum, c) => sum + (c.amount || 0), 0);
}

// Efectivo registrado a mano (retiros sin cheque/tarjeta).
// El objeto guarda el monto base; withdrawn total = efectivo + cheques + tarjetas.
function getCashTotal(bank) {
  if (!bank.cash || bank.cash.length === 0) return 0;
  return bank.cash.reduce((sum, c) => sum + (c.amount || 0), 0);
}

function getMethodTotal(bank) {
  return getCashTotal(bank) + getChequesTotal(bank) + getCardsTotal(bank);
}

function getCardsTotal(bank) {
  if (!bank.cards || bank.cards.length === 0) return 0;
  return bank.cards.reduce((sum, c) => sum + (c.amount || 0), 0);
}

function formatCardLabel(card) {
  const brand = card.brand || 'Tarjeta';
  return card.last4 ? `${brand} •••• ${card.last4}` : brand;
}

function getTimeRemaining(closeTimeStr) {
  const now = new Date();
  const [hours, minutes] = closeTimeStr.split(':').map(Number);
  const closeTime = new Date(now);
  closeTime.setHours(hours, minutes, 0, 0);

  const diff = closeTime - now;
  if (diff <= 0) return null;

  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  return { hours: h, minutes: m, seconds: s, total: diff };
}

// Un banco tiene actividad cuando ya registró algún retiro.
function hasActivity(bank) {
  return (bank.withdrawn || 0) > 0 ||
    (bank.cheques && bank.cheques.length > 0) ||
    (bank.cards && bank.cards.length > 0) ||
    (bank.cash && bank.cash.length > 0);
}

function formatTimeRemaining(tr) {
  if (!tr) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(tr.hours)}:${pad(tr.minutes)}:${pad(tr.seconds)}`;
}

function randomPhrase(category) {
  const phrases = JARVIS_PHRASES[category];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

function saveBanks() {
  try {
    localStorage.setItem('banktracker_banks', JSON.stringify(banks));
    return true;
  } catch (e) {
    // Almacenamiento lleno / bloqueado: los datos siguen en memoria (banks),
    // el llamador decide cómo reintentar sin perder el registro en curso.
    console.error('[saveBanks]', e);
    return false;
  }
}

// ── Archive Functions ──
function getArchiveKey(dateStr) {
  return `banktracker_day_${dateStr}`;
}

function getTodayStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateDisplay(dateStr) {
  const [y, m, d] = dateStr.split('-');
  const date = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const str = date.toLocaleDateString('es-MX', options);
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getAllArchiveKeys() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('banktracker_day_')) {
      keys.push(key);
    }
  }
  return keys.sort().reverse();
}

function getArchiveData(dateStr) {
  const raw = localStorage.getItem(getArchiveKey(dateStr));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function saveArchiveData(dateStr, data) {
  localStorage.setItem(getArchiveKey(dateStr), JSON.stringify(data));
}

function deleteArchiveData(dateStr) {
  localStorage.removeItem(getArchiveKey(dateStr));
}

function finalizeDay() {
  if (banks.length === 0) {
    showToast('No hay retiros para archivar', '⚠️');
    return;
  }

  const todayStr = getTodayStr();

  // ── Respaldo de los datos activos ──
  // Si algo falla (localStorage lleno, memoria…), NUNCA se borran los retiros
  // activos: el respaldo permite restaurarlos y reintentar sin perder registros.
  const activeBackup = JSON.stringify(banks);

  try {
    // Build lightweight archive record (TODOS los bancos, TODOS sus cheques,
    // tarjetas y efectivos — nunca solo el primero).
    const dayBanks = banks.map(b => ({
      company: b.company,
      bankName: b.bankName,
      totalAmount: b.totalAmount,
      withdrawn: b.withdrawn,
      notes: b.notes || '',
      cheques: (b.cheques || []).map(c => ({
        number: c.number,
        amount: c.amount,
        name: c.name,
        alias: c.alias || '',
        notes: c.notes || '',
      })),
      cards: (b.cards || []).map(c => ({
        brand: c.brand || 'Tarjeta',
        last4: c.last4 || '',
        amount: c.amount || 0,
        number: c.number || '',
        notes: c.notes || '',
      })),
      cash: (b.cash || []).map(c => ({
        name: c.name || '',
        alias: c.alias || '',
        amount: c.amount || 0,
        number: c.number || '',
        notes: c.notes || '',
      })),
    }));

    // ── Fusionar con lo archivado previamente HOY ──
    // Si este día calendario ya se archivó (finalización anterior, otra pestaña,
    // otro dispositivo…), NO se sobrescribe: se fusionan los registros para que
    // ningún cheque se pierda. Nunca se importan registros de fechas distintas.
    const existing = getArchiveData(todayStr);
    let mergedBanks = dayBanks;
    if (existing && Array.isArray(existing.banks) && existing.banks.length > 0 &&
        existing.date === todayStr) {
      const activeIds = new Set(banks.map(b => b.id));
      // Solo los bancos que NO están en el corte activo (mismo id = mismo registro,
      // ya actualizado en este corte) se conservan desde el archivo previo.
      const extras = existing.banks.filter(b => b.id && !activeIds.has(b.id));
      mergedBanks = dayBanks.concat(extras);
    }

    const archiveData = {
      date: todayStr,
      banks: mergedBanks,
      finalizedAt: new Date().toISOString(),
    };

    saveArchiveData(todayStr, archiveData);

    // Verificación post-guardado: confirmar que TODO lo activo quedó en el archivo.
    const verify = getArchiveData(todayStr);
    const countCheques = list => (list || []).reduce((s, b) => s + (b.cheques ? b.cheques.length : 0), 0);
    const savedCheques = countCheques(verify && verify.banks);
    const activeCheques = countCheques(banks);
    if (!verify || !Array.isArray(verify.banks) || verify.banks.length === 0 ||
        savedCheques < activeCheques) {
      throw new Error(`El archivo quedó incompleto (${savedCheques}/${activeCheques} cheques)`);
    }

    // Éxito: recién ahora se limpian los retiros activos.
    banks = [];
    saveBanks();
    render();
    startTimers();

    const activeCards = banks.reduce((s, b) => s + (b.cards ? b.cards.length : 0), 0);
    showStickyToast(
      `Día archivado: ${activeCheques} cheque${activeCheques !== 1 ? 's' : ''}` +
      `${activeCards ? ` · ${activeCards} tarjeta${activeCards !== 1 ? 's' : ''}` : ''} ✅`,
      '📅'
    );
  } catch (err) {
    console.error('[finalizeDay]', err);
    // Restaurar los datos activos para que nada se pierda y se pueda reintentar.
    try {
      banks = JSON.parse(activeBackup);
      localStorage.setItem('banktracker_banks', JSON.stringify(banks));
    } catch (e) { /* no bloquear el reintento */ }
    render();
    showStickyToast('No se pudo archivar (almacenamiento lleno). Tus retiros siguen aquí — libera espacio e intenta de nuevo.', '⚠️');
  }
}

function openHistoryModal() {
  const keys = getAllArchiveKeys();
  const list = $('historyList');
  const empty = $('historyEmpty');
  list.innerHTML = '';

  if (keys.length === 0) {
    empty.style.display = 'block';
    list.style.display = 'none';
  } else {
    empty.style.display = 'none';
    list.style.display = 'flex';

    keys.forEach(key => {
      const dateStr = key.replace('banktracker_day_', '');
      const data = getArchiveData(dateStr);
      if (!data) return;

      const totalAmount = data.banks.reduce((s, b) => s + (b.totalAmount || 0), 0);
      const totalWithdrawn = data.banks.reduce((s, b) => s + (b.withdrawn || 0), 0);
      const totalCheques = data.banks.reduce((s, b) => s + (b.cheques ? b.cheques.length : 0), 0);
      const totalCards = data.banks.reduce((s, b) => s + (b.cards ? b.cards.length : 0), 0);

      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="history-item-left">
          <div class="history-date">${formatDateDisplay(dateStr)}</div>
          <div class="history-summary">${data.banks.length} banco${data.banks.length !== 1 ? 's' : ''} · ${totalCheques} cheque${totalCheques !== 1 ? 's' : ''}${totalCards > 0 ? ` · ${totalCards} tarjeta${totalCards !== 1 ? 's' : ''}` : ''}</div>
        </div>
        <div class="history-item-right">
          <div class="history-total">${formatCurrency(totalWithdrawn)}</div>
          <div class="history-total-label">de ${formatCurrency(totalAmount)}</div>
        </div>
      `;
      item.addEventListener('click', () => openDayDetail(dateStr));
      list.appendChild(item);
    });
  }

  modalHistory.classList.add('active');
}

function closeHistoryModal() {
  modalHistory.classList.remove('active');
}

// ── Compartir resumen del día (lo más pro y rápido) ──
// Arma un texto formateado (fecha, totales y detalle por banco con cheques,
// tarjetas y efectivo) listo para pegarse en WhatsApp o mandarse por Mensajes.
function buildDaySummary(dateStr) {
  const data = getArchiveData(dateStr);
  if (!data || !Array.isArray(data.banks) || data.banks.length === 0) return null;

  const totalAmount = data.banks.reduce((s, b) => s + (b.totalAmount || 0), 0);
  const totalWithdrawn = data.banks.reduce((s, b) => s + (b.withdrawn || 0), 0);
  const totalPending = Math.max(0, totalAmount - totalWithdrawn);

  const lines = [];
  lines.push(`📊 RESUMEN DEL DÍA — ${formatDateDisplay(dateStr)}`);
  lines.push('BANCOS STARK Pro');
  lines.push('');
  lines.push(`💰 Total a retirar: ${formatCurrency(totalAmount)}`);
  lines.push(`✅ Retirado: ${formatCurrency(totalWithdrawn)}`);
  lines.push(`⏳ Falta: ${formatCurrency(totalPending)}`);
  lines.push('');

  data.banks.forEach(b => {
    const pending = Math.max(0, (b.totalAmount || 0) - (b.withdrawn || 0));
    lines.push(`🏦 ${b.bankName} — ${b.company}`);
    lines.push(`   Total: ${formatCurrency(b.totalAmount || 0)} · Retirado: ${formatCurrency(b.withdrawn || 0)}${pending > 0 ? ` · Falta: ${formatCurrency(pending)}` : ' ✅'}`);

    (b.cheques || []).forEach(c => {
      const details = [c.number ? `#${c.number}` : '', c.name || '', c.alias || ''].filter(Boolean).join(' — ');
      lines.push(`   📄 ${details}${details ? ' — ' : ''}${formatCurrency(c.amount || 0)}`);
      if (c.notes) lines.push(`      📝 ${c.notes}`);
    });
    (b.cards || []).forEach(c => {
      lines.push(`   💳 ${formatCardLabel(c)} — ${formatCurrency(c.amount || 0)}`);
      if (c.notes) lines.push(`      📝 ${c.notes}`);
    });
    (b.cash || []).forEach(c => {
      lines.push(`   💰 Efectivo${c.name ? ` — ${c.name}` : ''} — ${formatCurrency(c.amount || 0)}`);
      if (c.notes) lines.push(`      📝 ${c.notes}`);
    });

    if (b.notes) lines.push(`   📝 ${b.notes}`);
    lines.push('');
  });

  return lines.join('\n').trim();
}

// Comparte el resumen vía share sheet nativo (iPhone: WhatsApp, Mensajes…).
// Si el navegador no lo soporta o el usuario cancela, copia el texto al
// portapapeles como respaldo para pegarlo a mano.
async function shareDaySummary(dateStr) {
  const text = buildDaySummary(dateStr);
  if (!text) {
    showToast('No hay datos para compartir', '⚠️');
    return;
  }

  // Copia al portapapeles con dos estrategias: API moderna y, si falla
  // (navigator.clipboard solo existe en contextos seguros/HTTPS), el viejo
  // truco de textarea + execCommand que funciona en cualquier lado.
  const copyToClipboard = async () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) { /* seguimos con el respaldo de abajo */ }
    }
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      const ok = document.execCommand && document.execCommand('copy');
      document.body.removeChild(ta);
      if (ok) return true;
    } catch (e) { /* nada más que intentar */ }
    return false;
  };

  const copyFallback = async () => {
    const ok = await copyToClipboard();
    showToast(ok ? 'Resumen copiado — pégalo donde quieras' : 'No se pudo copiar el resumen', ok ? '📋' : '⚠️');
  };

  // En escritorio/macOS suele abrir la hoja de compartir del sistema…
  if (navigator.share) {
    try {
      await navigator.share({ title: `Resumen ${dateStr}`, text });
      return;
    } catch (e) {
      // Si el usuario canceló la hoja de compartir, no copiamos nada.
      if (e && e.name === 'AbortError') return;
      // Cualquier otro fallo (o si no hay share) cae al portapapeles.
    }
  }
  await copyFallback();
}

function openDayDetail(dateStr) {
  const data = getArchiveData(dateStr);
  if (!data) return;

  currentDayDetailDate = dateStr;
  $('dayDetailTitle').textContent = `📅 ${formatDateDisplay(dateStr)}`;

  const content = $('dayDetailContent');
  let html = '';

  data.banks.forEach((b, idx) => {
    const chequesTotal = (b.cheques || []).reduce((s, c) => s + (c.amount || 0), 0);
    const cards = b.cards || [];
    const cardsTotal = cards.reduce((s, c) => s + (c.amount || 0), 0);
    const cashTotal = (b.cash || []).reduce((s, c) => s + (c.amount || 0), 0);
    html += `
      <div class="day-detail-bank">
        <div class="day-detail-bank-header">
          <div class="day-detail-bank-name">${b.bankName}</div>
          <div class="day-detail-bank-company">${b.company}</div>
        </div>
        <div class="day-detail-amounts">
          <div class="day-detail-row">
            <span>Total</span>
            <span>${formatCurrency(b.totalAmount)}</span>
          </div>
          <div class="day-detail-row">
            <span>Retirado</span>
            <span style="color:var(--status-green);">${formatCurrency(b.withdrawn)}</span>
          </div>
          ${cashTotal > 0 ? `
          <div class="day-detail-row">
            <span>💰 Efectivo</span>
            <span>${formatCurrency(cashTotal)}</span>
          </div>
          ` : ''}
          ${b.totalAmount > b.withdrawn ? `
          <div class="day-detail-row">
            <span>Sin retirar</span>
            <span style="color:var(--status-orange);">${formatCurrency(b.totalAmount - b.withdrawn)}</span>
          </div>
          ` : ''}
        </div>
        ${b.cheques && b.cheques.length > 0 ? `
          <div class="day-detail-cheques">
            <div class="day-detail-cheques-title">📄 Cheques (${b.cheques.length}) · Total: ${formatCurrency(chequesTotal)}</div>
            ${b.cheques.map(c => `
              <div class="day-detail-cheque">
                <div class="day-detail-cheque-left">
                  <span class="day-detail-cheque-num">#${c.number}</span>
                  <span class="day-detail-cheque-name">${c.name}</span>
                  ${c.alias ? `<span class="day-detail-cheque-alias">📍 ${c.alias}</span>` : ''}
                  ${c.notes ? `<span class="day-detail-cheque-alias">📝 ${c.notes}</span>` : ''}
                </div>
                <span class="day-detail-cheque-amount">${formatCurrency(c.amount)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${cards.length > 0 ? `
          <div class="day-detail-cheques day-detail-cards">
            <div class="day-detail-cheques-title">💳 Tarjetas (${cards.length}) · Total: ${formatCurrency(cardsTotal)}</div>
            ${cards.map(c => `
              <div class="day-detail-cheque">
                <div class="day-detail-cheque-left">
                  <span class="day-detail-cheque-num">💳 ${formatCardLabel(c)}</span>
                  ${c.notes ? `<span class="day-detail-cheque-alias">📝 ${c.notes}</span>` : ''}
                </div>
                <span class="day-detail-cheque-amount">${formatCurrency(c.amount)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
        <button class="day-detail-edit-btn" onclick="openEditRecord('${dateStr}', ${idx})">
          ✏️ Editar
        </button>
      </div>
    `;
  });

  content.innerHTML = html;
  closeHistoryModal();
  modalDayDetail.classList.add('active');

  // Botón Compartir: se inserta aquí (y NO en el HTML) porque este modal se
  // reconstruye en cada apertura. Se reemplaza en cada apertura para que el
  // handler siempre apunte al día que se está viendo (no a uno anterior).
  const oldShare = $('btnShareDay');
  if (oldShare) oldShare.remove();
  const shareBtn = document.createElement('button');
  shareBtn.id = 'btnShareDay';
  shareBtn.className = 'btn-share';
  shareBtn.innerHTML = '📤 Compartir resumen';
  shareBtn.addEventListener('click', () => shareDaySummary(currentDayDetailDate || dateStr));
  const group = $('modalDayDetail').querySelector('.btn-group');
  if (group) group.appendChild(shareBtn);
}

function closeDayDetail() {
  modalDayDetail.classList.remove('active');
  currentDayDetailDate = null;
}

function openEditRecord(dateStr, recordIndex) {
  const data = getArchiveData(dateStr);
  if (!data || !data.banks[recordIndex]) return;

  currentEditRecordDate = dateStr;
  currentEditRecordIndex = recordIndex;
  const b = data.banks[recordIndex];

  $('editRecordCompany').value = b.company;
  $('editRecordBank').value = b.bankName;
  $('editRecordTotal').value = b.totalAmount;
  $('editRecordWithdrawn').value = b.withdrawn;
  $('editRecordNotes').value = b.notes || '';

  closeDayDetail();
  modalEditRecord.classList.add('active');
  setTimeout(() => $('editRecordTotal').focus(), 400);
}

function closeEditRecord() {
  modalEditRecord.classList.remove('active');
  currentEditRecordDate = null;
  currentEditRecordIndex = null;
}

function saveEditRecord() {
  if (!currentEditRecordDate || currentEditRecordIndex === null) return;
  const data = getArchiveData(currentEditRecordDate);
  if (!data || !data.banks[currentEditRecordIndex]) return;

  const company = $('editRecordCompany').value;
  const bankName = $('editRecordBank').value;
  const total = parseFloat($('editRecordTotal').value);
  const withdrawn = parseFloat($('editRecordWithdrawn').value);

  if (!company) { $('editRecordCompany').focus(); return; }
  if (!bankName) { $('editRecordBank').focus(); return; }
  if (isNaN(total) || total < 0) {
    $('editRecordTotal').focus();
    return;
  }
  if (isNaN(withdrawn) || withdrawn < 0) {
    $('editRecordWithdrawn').focus();
    return;
  }

  data.banks[currentEditRecordIndex].company = company;
  data.banks[currentEditRecordIndex].bankName = bankName;
  data.banks[currentEditRecordIndex].totalAmount = total;
  data.banks[currentEditRecordIndex].withdrawn = Math.min(withdrawn, total);
  data.banks[currentEditRecordIndex].notes = $('editRecordNotes').value.trim() || '';
  saveArchiveData(currentEditRecordDate, data);

  closeEditRecord();
  showToast('Registro actualizado', '✅');

  // Reopen detail if still viewing that day
  if (currentDayDetailDate === currentEditRecordDate) {
    openDayDetail(currentEditRecordDate);
  }
}

function deleteDayArchive() {
  if (!currentDayDetailDate) return;
  deleteArchiveData(currentDayDetailDate);
  closeDayDetail();
  showToast('Día eliminado del historial', '🗑️');
}

// ── Delete Cheque Function ──
function deleteCheque(bankId, chequeId) {
  const bank = banks.find(b => b.id === bankId);
  if (!bank || !bank.cheques) return;
  const cheque = bank.cheques.find(c => c.id === chequeId);
  if (!cheque) return;

  const chequeAmount = cheque.amount || 0;
  const chequeLabel = cheque.number ? `#${cheque.number}` : (cheque.name || 'sin número');
  const confirmMsg = `¿Eliminar este cheque?\n\n📄 Cheque ${chequeLabel}\n💰 ${formatCurrency(chequeAmount)}\n👤 ${cheque.name || '-'}\n\nSe recalculará el total retirado.`;

  if (!confirm(confirmMsg)) return;

  bank.cheques = bank.cheques.filter(c => c.id !== chequeId);
  // Recalcular withdrawn desde los métodos registrados
  bank.withdrawn = Math.min(getMethodTotal(bank), bank.totalAmount);
  currentEditWithdrawItem = null;
  saveBanks();
  render();
  startTimers();
  showToast(`Cheque ${chequeLabel} eliminado. Retirado ahora: ${formatCurrency(bank.withdrawn)}`, '🗑️');
}

// ── Edit Bank Functions ──
function openEditBankModal(bankId) {
  console.log('[EditBank] Abriendo modal para:', bankId);
  const bank = banks.find(b => b.id === bankId);
  if (!bank) { console.log('[EditBank] Banco no encontrado'); return; }
  currentEditBankId = bankId;

  // Mostrar info del banco (solo lectura) — la empresa primero y en grande
  // para que siempre se vea a qué empresa pertenece el banco.
  const editCompany = $('editBankCompanyDisplay');
  editCompany.textContent = bank.company;
  editCompany.style.background = companyConfigGradient(bank.company);
  $('editBankNameDisplay').textContent = bank.bankName;
  const editBankInfo = $('editBankInfo');
  if (editBankInfo) editBankInfo.prepend(editCompany);
  $('editBankTotal').value = bank.totalAmount;
  $('editBankNotes').value = bank.notes || '';

  modalEditBank.classList.add('active');
  console.log('[EditBank] Modal abierto');
  setTimeout(() => $('editBankTotal').focus(), 400);
}

function closeEditBankModal() {
  modalEditBank.classList.remove('active');
  currentEditBankId = null;
}

function saveEditBank() {
  if (!currentEditBankId) return;
  const bank = banks.find(b => b.id === currentEditBankId);
  if (!bank) return;

  const total = parseFloat($('editBankTotal').value);

  if (isNaN(total) || total <= 0) { $('editBankTotal').focus(); return; }

  bank.totalAmount = total;
  bank.notes = $('editBankNotes').value.trim() || '';
  // Asegurar que withdrawn no exceda el nuevo total
  bank.withdrawn = Math.min(bank.withdrawn, total);

  if (!saveBanks()) {
    showStickyToast('No se pudo guardar (almacenamiento lleno). Libera espacio e inténtalo de nuevo.', '⚠️');
    return;
  }
  closeEditBankModal();
  render();
  startTimers();
  showToast(`Monto actualizado a ${formatCurrency(total)}`, '✅');
}

// ── Edit Cheque Functions ──
function openEditChequeModal(bankId, chequeId) {
  const bank = banks.find(b => b.id === bankId);
  if (!bank || !bank.cheques) return;
  const cheque = bank.cheques.find(c => c.id === chequeId);
  if (!cheque) return;

  currentEditChequeBankId = bankId;
  currentEditChequeId = chequeId;
  currentEditWithdrawItem = null; // modo cheque completo

  $('editChequeBankName').textContent = bank.bankName;
  $('editChequeBankCompany').textContent = bank.company;

  setEditFieldGroups('cheque');

  $('inputEditBrand').value = '';
  $('inputEditNumber').value = cheque.number;
  $('inputEditDigits').value = '';
  $('inputEditChequeAmount').value = cheque.amount;
  $('inputEditChequeName').value = cheque.name;
  $('inputEditChequeAlias').value = cheque.alias || '';
  $('inputEditNotes').value = cheque.notes || '';

  modalEditCheque.classList.add('active');
  setTimeout(() => $('inputEditNumber').focus(), 400);
}

function closeEditChequeModal() {
  modalEditCheque.classList.remove('active');
  currentEditChequeBankId = null;
  currentEditChequeId = null;
  currentEditWithdrawItem = null;
  setEditFieldGroups('cheque'); // estado por defecto para la próxima apertura
}

function saveEditCheque() {
  if (!currentEditChequeBankId || !currentEditChequeId) return;
  const bank = banks.find(b => b.id === currentEditChequeBankId);
  if (!bank) return;

  const amount = parseFloat($('inputEditChequeAmount').value);
  if (!amount || amount <= 0) { $('inputEditChequeAmount').focus(); return; }

  // ── Modo efectivo / tarjeta: monto + nombre/cliente + datos de tarjeta ──
  if (currentEditWithdrawItem) {
    const kind = currentEditWithdrawItem.kind;
    let list = kind === 'card' ? bank.cards : bank.cash;
    if (!list) { closeEditChequeModal(); return; }
    const item = list.find(c => c.id === currentEditChequeId);
    if (!item) { closeEditChequeModal(); return; }

    const oldAmount = item.amount || 0;
    const chequeNo = ($('inputEditNumber').value || '').trim();
    const digits4 = ($('inputEditDigits').value || '').replace(/\D/g, '').slice(0, 4);

    item.amount = amount;
    item.name = $('inputEditChequeName').value.trim() || '';
    item.alias = $('inputEditChequeAlias').value.trim() || '';
    item.notes = $('inputEditNotes').value.trim() || '';
    if (kind === 'card') {
      const brand = ($('inputEditBrand').value || '').trim();
      item.brand = brand || 'Tarjeta';
      item.last4 = digits4 || '';
      if (chequeNo) item.number = chequeNo; // opcional en tarjeta
    } else {
      // Efectivo: permite capturar el nº de cheque asociado
      item.number = chequeNo || (digits4 ? `•••• ${digits4}` : '');
    }
    bank.withdrawn = Math.min(getMethodTotal(bank), bank.totalAmount);

    if (!saveBanks()) {
      showStickyToast('No se pudo guardar (almacenamiento lleno). Libera espacio e inténtalo de nuevo.', '⚠️');
      return;
    }
    closeEditChequeModal();
    render();
    startTimers();

    const label = kind === 'card' ? formatCardLabel(item)
      : (item.name || 'Efectivo');
    const diff = amount - oldAmount;
    if (diff > 0) {
      showToast(`${label} actualizado. Se sumó ${formatCurrency(diff)} al retirado`, '✅');
    } else if (diff < 0) {
      showToast(`${label} actualizado. Se restó ${formatCurrency(Math.abs(diff))} del retirado`, '✅');
    } else {
      showToast(`${label} actualizado (monto/datos guardados)`, '✅');
    }
    return;
  }

  // ── Modo cheque: número + monto + nombre + alias (o últimos 4 si no hay número) ──
  if (!bank.cheques) return;
  const cheque = bank.cheques.find(c => c.id === currentEditChequeId);
  if (!cheque) return;

  const number = $('inputEditNumber').value.trim();
  const name = $('inputEditChequeName').value.trim();
  const alias = $('inputEditChequeAlias').value.trim();
  const digits = ($('inputEditDigits').value || '').replace(/\D/g, '').slice(0, 4);

  const oldAmount = cheque.amount || 0;

  cheque.number = number || (digits ? `•••• ${digits}` : '');
  cheque.amount = amount;
  cheque.name = name || '';
  cheque.alias = alias || '';
  cheque.notes = $('inputEditNotes').value.trim() || '';

  // Recalcular withdrawn desde los métodos registrados
  bank.withdrawn = Math.min(getMethodTotal(bank), bank.totalAmount);

  if (!saveBanks()) {
    showStickyToast('No se pudo guardar (almacenamiento lleno). Libera espacio e inténtalo de nuevo.', '⚠️');
    return;
  }
  closeEditChequeModal();
  render();
  startTimers();

  const chequeLabel = number ? `#${number}` : (name || 'cheque');
  const diff = amount - oldAmount;
  if (diff > 0) {
    showToast(`Cheque ${chequeLabel} actualizado. Se sumó ${formatCurrency(diff)} al retirado`, '✅');
  } else if (diff < 0) {
    showToast(`Cheque ${chequeLabel} actualizado. Se restó ${formatCurrency(Math.abs(diff))} del retirado`, '✅');
  } else {
    showToast(`Cheque ${chequeLabel} actualizado (monto sin cambio)`, '✅');
  }
}

function showToast(message, icon = '✅', duration = 2500) {
  $('toastIcon').textContent = icon;
  $('toastMessage').textContent = message;
  toast.classList.add('show');
  // Se auto-oculta a los `duration` ms. El siguiente toast cancela el anterior.
  if (showToast._timer) clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    toast.classList.remove('show');
    showToast._timer = null;
  }, duration);
}

// Toast que NO se auto-oculta (errores críticos y confirmaciones de guardado
// que el usuario debe poder leer). Se cierra solo al aparecer el siguiente toast.
function showStickyToast(message, icon = '✅') {
  showToast(message, icon, 0);
}

// ── Splash Screen ──
function initSplash() {
  const container = $('splashParticles');
  for (let i = 0; i < 20; i++) {
    const particle = document.createElement('div');
    particle.className = 'splash-particle';
    particle.style.left = Math.random() * 100 + '%';
    particle.style.animationDelay = Math.random() * 3 + 's';
    particle.style.animationDuration = (2 + Math.random() * 2) + 's';
    container.appendChild(particle);
  }

  const statuses = [
    'Inicializando sistemas...',
    'Cargando módulos financieros...',
    'Verificando datos...',
    'Sistema listo.',
  ];

  // Precarga el contenido de la app mientras el splash sigue visible,
  // para que aparezca ya renderizada al hacer fade-out.
  initApp();

  let i = 0;
  const statusInterval = setInterval(() => {
    i++;
    if (i < statuses.length) {
      $('splashStatus').textContent = statuses[i];
    }
  }, 220);

  setTimeout(() => {
    clearInterval(statusInterval);
    $('splashStatus').textContent = 'Sistema listo.';
    setTimeout(() => {
      $('splashScreen').classList.add('fade-out');
      setTimeout(() => {
        $('splashScreen').style.display = 'none';
        $('appContainer').style.display = 'block';
        $('appContainer').style.animation = 'fadeInUp 0.35s ease';
      }, 350);
    }, 150);
  }, 900);
}

// ── Initialize App ──
let appInitialized = false;

// Estado compartido (también lo expone en window para que el botón
// "Intentar de nuevo" del error crítico pueda reconstruirlo).
function loadActiveBanks() {
  let parsed = [];
  try {
    parsed = JSON.parse(localStorage.getItem('banktracker_banks') || '[]');
  } catch (e) {
    parsed = [];
  }
  if (!Array.isArray(parsed)) parsed = [];
  banks = parsed;
  window.banks = banks;
}
loadActiveBanks();

function initApp() {
  // Precarga temprana: renderiza el contenido ANTES de que el splash desaparezca,
  // para que la app aparezca instantánea al hacer fade-out.
  if (appInitialized) return;
  appInitialized = true;

  // Si el primer intento falló (dato corrupto, DOM no listo, etc.), este flag
  // permite reintentarlo desde el manejador de error crítico.
  try {
    updateHeaderDate();
    render();
    startTimers();
    initSplashGreeting();
  } catch (e) {
    console.error('[InitApp]', e);
    appInitialized = false;
    throw e;
  }
}

// ── Pantalla de error crítico (fallback si initApp() falla) ──
// Sin esto, cualquier error de arranque dejaba el splash congelado y la app "muerta",
// de modo que Finalizar Día u otras acciones dejaban de responder.
function showFatalError(err) {
  console.error('[Fatal]', err);
  const splash = document.getElementById('splashScreen');
  if (splash) {
    splash.style.display = 'flex';
    splash.classList.remove('fade-out');
    splash.innerHTML = `
      <div class="splash-content" style="text-align:center;max-width:420px;">
        <div style="font-size:48px;margin-bottom:12px;">⚠️</div>
        <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:8px;">Error al iniciar BANCOS STARK</div>
        <div style="font-size:12px;color:rgba(255,255,255,.7);line-height:1.5;margin-bottom:18px;">
          Los datos guardados no pudieron cargarse.<br>
          Verifica el almacenamiento del dispositivo e inténtalo de nuevo.
        </div>
        <button onclick="location.reload()"
          style="padding:12px 24px;border:none;border-radius:10px;background:#2563eb;color:#fff;font-weight:700;font-size:14px;cursor:pointer;">
          🔄 Reintentar
        </button>
      </div>`;
  }
  document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  const app = document.getElementById('appContainer');
  if (app) app.style.display = 'block';
}

function updateHeaderDate() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  const dateStr = now.toLocaleDateString('es-MX', options);
  $('headerDate').textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

function initSplashGreeting() {
  const now = new Date();
  const hour = now.getHours();
  let greeting = '';
  if (hour < 12) greeting = 'Buenos días';
  else if (hour < 18) greeting = 'Buenas tardes';
  else greeting = 'Buenas noches';

  const total = banks.length;
  if (total === 0) {
    jarvisMessage.innerHTML = `<span class="jefe">${greeting}, Jefe.</span> Sistema operativo. No hay retiros registrados.`;
  } else {
    let counts = { red: 0, orange: 0, green: 0 };
    banks.forEach(b => counts[getBankStatus(b)]++);
    const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;
    jarvisMessage.innerHTML = `<span class="jefe">${greeting}, Jefe.</span> ${plural(counts.red, 'pendiente')}, ${counts.orange} en proceso, ${plural(counts.green, 'completado')}.`;
  }
}

// ── Render ──
function render() {
  // Tras (re)construir las tarjetas, reconectar los listeners directos del
  // botón de retiro — los inline onclick del HTML ya cubren el caso normal.
  setTimeout(() => {
    document.querySelectorAll('[data-action="withdraw"]').forEach(bindWithdrawButton);
  }, 0);
  const hasBanks = banks.length > 0;
  emptyState.style.display = hasBanks ? 'none' : 'block';
  summaryDashboard.style.display = hasBanks ? 'block' : 'none';

  // ── Contadores globales: estados + montos + agrupación por banco ──
  const counts = { red: 0, orange: 0, green: 0 };
  let totalGeneral = 0;
  let totalRetirado = 0;
  const bankGroups = {};
  banks.forEach(b => {
    counts[getBankStatus(b)]++;
    totalGeneral += b.totalAmount;
    totalRetirado += b.withdrawn;
    const key = b.bankName || 'Otro banco';
    if (!bankGroups[key]) {
      bankGroups[key] = { total: 0, withdrawn: 0, count: 0 };
    }
    bankGroups[key].total += b.totalAmount;
    bankGroups[key].withdrawn += b.withdrawn;
    bankGroups[key].count++;
  });

  // Actualiza un número y, si el valor cambió, dispara el pulso ".counting"
  // (micro-interacción que hace visible al instante qué cifras se modificaron).
  const setNumber = (el, value) => {
    if (!el) return;
    if (el.dataset.value !== undefined && el.dataset.value !== String(value)) {
      el.classList.remove('counting');
      void el.offsetWidth; // reinicia la animación aunque se cambie rápido
      el.classList.add('counting');
    }
    el.dataset.value = String(value);
    el.textContent = value;
  };
  const setCurrency = (el, value) => {
    if (!el) return;
    if (el.dataset.value !== undefined && el.dataset.value !== String(value)) {
      el.classList.remove('counting');
      void el.offsetWidth;
      el.classList.add('counting');
    }
    el.dataset.value = String(value);
    el.innerHTML = formatCurrencyParts(value);
  };

  setNumber($('countRed'), counts.red);
  setNumber($('countOrange'), counts.orange);
  setNumber($('countGreen'), counts.green);
  setCurrency($('totalGeneral'), totalGeneral);
  setCurrency($('totalRetirado'), totalRetirado);
  setCurrency($('totalFalta'), totalGeneral - totalRetirado);
  // ── KPIs globales (fila compacta superior) ──
  $('totalSub').textContent = `${banks.length} retiro${banks.length !== 1 ? 's' : ''} programado${banks.length !== 1 ? 's' : ''}`;
  const kpiPercent = document.getElementById('kpiPercent');
  if (kpiPercent) {
    const pct = totalGeneral > 0 ? Math.round((totalRetirado / totalGeneral) * 100) : 0;
    kpiPercent.textContent = `${pct}% del total`;
  }
  const kpiBancos = document.getElementById('kpiBancos');
  if (kpiBancos) {
    const n = Object.keys(bankGroups).length;
    kpiBancos.textContent = `${n} banco${n !== 1 ? 's' : ''}`;
  }

  // Barra de progreso global.
  const summaryFill = document.getElementById('summaryProgressFill');
  if (summaryFill) {
    const globalPct = totalGeneral > 0 ? Math.min((totalRetirado / totalGeneral) * 100, 100) : 0;
    summaryFill.style.width = globalPct + '%';
    summaryFill.style.background = globalPct >= 100
      ? 'linear-gradient(90deg, var(--status-green), #4ade80)'
      : 'linear-gradient(90deg, var(--accent-cyan), var(--accent-blue))';
  }

  // ── Gráfico donut + leyenda: distribución POR BANCO ──
  renderDonut(bankGroups, totalGeneral);
  renderBankLegend(bankGroups, totalGeneral);

  // Tarjetas de totales POR BANCO: cada banco conserva sus propias cuentas
  // (Total · Retirado · Falta) sin mezclarse con los demás.
  renderBankTotals();

  // Update Jarvis
  updateJarvisMessage(counts);

  // Agrupar tarjetas por empresa para reducir el ruido visual.
  // Una sola línea de sección reemplaza repetir el nombre de la empresa
  // dentro de cada tarjeta (menos texto, menos desorden).
  const COMPANY_ICONS = {
    'Sertecma': '🛠️',
    'Sertecgarce': '🔧',
    'Tecnología': '💻',
  };
  const STATUS_ORDER = { red: 0, orange: 1, green: 2 };
  const orderedBanks = banks
    .map((bank, origIndex) => ({ bank, origIndex }))
    .sort((a, b) => {
      if (a.bank.company !== b.bank.company) return a.bank.company.localeCompare(b.bank.company, 'es');
      const s = STATUS_ORDER[getBankStatus(a.bank)] - STATUS_ORDER[getBankStatus(b.bank)];
      if (s !== 0) return s;
      return a.origIndex - b.origIndex;
    });

  // Render bank cards
  bankList.innerHTML = '';
  let lastCompany = null;
  orderedBanks.forEach(({ bank, origIndex }, index) => {
    if (bank.company !== lastCompany) {
      lastCompany = bank.company;
      const groupCount = orderedBanks.filter(x => x.bank.company === bank.company).length;
      const groupHead = document.createElement('div');
      groupHead.className = 'bank-group';
      groupHead.innerHTML = `
        <span class="bg-icon">${COMPANY_ICONS[bank.company] || '🏢'}</span>
        <span class="bg-name">${bank.company}</span>
        <span class="bg-count">${groupCount} ${groupCount === 1 ? 'banco' : 'bancos'}</span>
      `;
      bankList.appendChild(groupHead);
    }
    const originalIndex = origIndex;
    const status = getBankStatus(bank);
    const remaining = getRemaining(bank);
    const progress = getProgress(bank);
    const config = getBankConfig(bank.bankName);
    const tr = getTimeRemaining(bank.closeTime);

    const card = document.createElement('div');
    card.className = `bank-card status-${status}`;
    card.style.animationDelay = `${originalIndex * 0.06}s`;

    let timerHTML = '';
    if (status === 'green') {
      timerHTML = `
        <div class="timer-section">
          <span class="timer-label">⏱️ Tiempo</span>
          <span class="timer-complete">Completado</span>
        </div>`;
    } else if (!tr) {
      timerHTML = `
        <div class="timer-section">
          <span class="timer-label">Tiempo</span>
          <span class="timer-closed">Banco cerrado</span>
        </div>`;
    } else {
      timerHTML = `
        <div class="timer-section">
          <span class="timer-label">Cierre en</span>
          <span class="timer-value" data-bank-id="${bank.id}">${formatTimeRemaining(tr)}</span>
        </div>`;
    }

    // Cabecera: primero la EMPRESA en grande (etiqueta con su color), luego
    // el banco debajo. Así, al añadir retiros siempre se ve a qué empresa
    // se está trabajando.
    const closeLabel = tr ? `· Cierra ${bank.closeTime}` : '';
    card.innerHTML = `
      <div class="bank-header">
        <div class="bank-info">
          <div class="bank-logo" style="background: ${config.gradient};">${config.abbr}</div>
          <div class="bank-head-text">
            <span class="bank-company-tag" style="background:${companyConfigGradient(bank.company)};">${bank.company}</span>
            <div class="bank-name">${bank.bankName}${closeLabel ? ` <span class="bank-close-label">${closeLabel}</span>` : ''}</div>
          </div>
        </div>
        <span class="bank-status-badge">${
          status === 'red' ? 'Pendiente' :
          status === 'orange' ? 'Parcial' :
          'Completado'
        }</span>
      </div>

      <div class="amount-section">
        <div class="amount-display">
          <div class="amount-label">Total a retirar</div>
          <div class="amount-value">${formatCurrencyParts(bank.totalAmount)}</div>
        </div>
        <div class="amount-remaining">
          <div class="amount-label">${
            status === 'green' ? 'Retirado' : 'Falta por sacar'
          }</div>
          <div class="amount-value">${
            status === 'green'
              ? formatCurrencyParts(bank.withdrawn)
              : formatCurrencyParts(remaining)
          }</div>
        </div>
      </div>

      <div class="progress-bar" role="progressbar" aria-valuenow="${Math.min(progress, 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="Progreso de retiro">
        <div class="progress-fill status-${status}" style="width: ${Math.min(progress, 100)}%;"></div>
      </div>

      <div class="progress-info">
        <span class="progress-percent">${formatPercent(progress)} completado</span>
      </div>

      ${timerHTML}

      ${bank.notes ? `
        <div class="cheque-alias" style="margin-top:8px;">📝 ${bank.notes}</div>
      ` : ''}

      ${hasActivity(bank) ? `
        <div class="method-summary">
          ${getCashTotal(bank) > 0 ? `<span class="method-tag mt-cash">💰 Efectivo ${formatCurrency(getCashTotal(bank))}</span>` : ''}
          ${getChequesTotal(bank) > 0 ? `<span class="method-tag mt-cheque">📄 Cheques ${formatCurrency(getChequesTotal(bank))}</span>` : ''}
          ${getCardsTotal(bank) > 0 ? `<span class="method-tag mt-card">💳 Tarjetas ${formatCurrency(getCardsTotal(bank))}</span>` : ''}
        </div>
      ` : ''}

      <div class="bank-actions">
        <!-- SIEMPRE visible: el retiro se puede registrar aunque el banco
             esté completo (status green) — el modal ya no depende del estado. -->
        <button class="btn-action primary" data-action="withdraw" data-bank="${bank.id}" onclick="openWithdraw(this.dataset.bank)">
          Registrar Retiro
        </button>
        <button class="btn-action edit-btn" data-action="edit-bank" data-bank="${bank.id}">
          Editar
        </button>
        <button class="btn-action danger" data-action="delete-bank" data-bank="${bank.id}">
          Eliminar
        </button>
      </div>

      ${bank.cheques && bank.cheques.length > 0 ? `
        <div class="cheques-section">
          <div class="cheques-header">
            <span class="cheques-title">📄 Cheques (${bank.cheques.length})</span>
            <span class="cheques-total">Total: ${formatCurrency(getChequesTotal(bank))}</span>
          </div>
          <div class="cheques-list">
            ${bank.cheques.map(c => `
              <div class="cheque-item">
                <div class="cheque-item-left">
                  <div class="cheque-number">#${c.number}</div>
                  <div class="cheque-name">${c.name}</div>
                  ${c.alias ? `<div class="cheque-alias">📍 ${c.alias}</div>` : ''}
                  ${c.notes ? `<div class="cheque-alias">📝 ${c.notes}</div>` : ''}
                </div>
                <div class="cheque-item-right">
                  <div class="cheque-amount">${formatCurrency(c.amount)}</div>
                  <button class="cheque-edit-btn" data-action="edit-item" data-bank="${bank.id}" data-kind="cheque" data-item="${c.id}" aria-label="Editar cheque" title="Editar cheque">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="cheque-delete-btn" data-action="delete-item" data-bank="${bank.id}" data-kind="cheque" data-item="${c.id}" aria-label="Eliminar cheque">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${bank.cash && bank.cash.length > 0 ? `
        <div class="cheques-section cash-section">
          <div class="cheques-header">
            <span class="cheques-title">💰 Efectivo (${bank.cash.length})</span>
            <span class="cheques-total">Total: ${formatCurrency(getCashTotal(bank))}</span>
          </div>
          <div class="cheques-list">
            ${bank.cash.map(c => `
              <div class="cheque-item">
                <div class="cheque-item-left">
                  <div class="cheque-number">💰 ${c.name ? c.name : 'Retiro en efectivo'}</div>
                  ${c.number ? `<div class="cheque-name">📄 #${c.number}</div>` : ''}
                  ${c.alias ? `<div class="cheque-alias">📍 ${c.alias}</div>` : ''}
                  ${c.notes ? `<div class="cheque-alias">📝 ${c.notes}</div>` : ''}
                </div>
                <div class="cheque-item-right">
                  <div class="cheque-amount">${formatCurrency(c.amount)}</div>
                  <button class="cheque-edit-btn" data-action="edit-item" data-bank="${bank.id}" data-kind="cash" data-item="${c.id}" aria-label="Editar efectivo" title="Editar efectivo">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="cheque-delete-btn" data-action="delete-item" data-bank="${bank.id}" data-kind="cash" data-item="${c.id}" aria-label="Eliminar efectivo">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      ${bank.cards && bank.cards.length > 0 ? `
        <div class="cheques-section cards-section">
          <div class="cheques-header">
            <span class="cheques-title">💳 Tarjetas (${bank.cards.length})</span>
            <span class="cheques-total">Total: ${formatCurrency(getCardsTotal(bank))}</span>
          </div>
          <div class="cheques-list">
            ${bank.cards.map(c => `
              <div class="cheque-item">
                <div class="cheque-item-left">
                  <div class="cheque-number">💳 ${formatCardLabel(c)}</div>
                  ${c.name ? `<div class="cheque-name">👤 ${c.name}</div>` : ''}
                  ${c.number ? `<div class="cheque-name">📄 #${c.number}</div>` : ''}
                  ${c.alias ? `<div class="cheque-alias">📍 ${c.alias}</div>` : ''}
                  ${c.notes ? `<div class="cheque-alias">📝 ${c.notes}</div>` : ''}
                </div>
                <div class="cheque-item-right">
                  <div class="cheque-amount">${formatCurrency(c.amount)}</div>
                  <button class="cheque-edit-btn" data-action="edit-item" data-bank="${bank.id}" data-kind="card" data-item="${c.id}" aria-label="Editar tarjeta" title="Editar tarjeta">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="cheque-delete-btn" data-action="delete-item" data-bank="${bank.id}" data-kind="card" data-item="${c.id}" aria-label="Eliminar tarjeta">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    `;

    bankList.appendChild(card);
  });
}

// ── Orden estable de bancos (config primero, luego alfabético) ──
function sortedBankNames(names) {
  return names.sort((a, b) =>
    (BANK_CONFIG[a] ? 0 : 1) - (BANK_CONFIG[b] ? 0 : 1) || a.localeCompare(b, 'es'));
}

// ── Gráfico donut: distribución del monto programado por banco ──
// Cada segmento SVG representa el % que aporta ese banco al total general.
// En el centro se muestra el monto al pasar el puntero (o el total al salir).
function renderDonut(groups, total) {
  const segs = document.getElementById('donutSegments');
  const centerValue = document.getElementById('donutValue');
  const centerLabel = document.getElementById('donutLabel');
  if (!segs) return;

  const names = sortedBankNames(Object.keys(groups));
  const R = 52;
  const C = 2 * Math.PI * R;

  if (total <= 0 || names.length === 0) {
    segs.innerHTML = '';
    centerValue.textContent = '$0';
    centerLabel.textContent = 'Total';
    return;
  }

  let offset = 0;
  segs.innerHTML = names.map(name => {
    const g = groups[name];
    const frac = g.total / total;
    const len = frac * C;
    const config = getBankConfig(name);
    const dash = `${Math.max(len - 1.5, 0)} ${C - Math.max(len - 1.5, 0)}`;
    const seg = `
      <circle class="donut-seg" data-bank="${name}"
        cx="60" cy="60" r="${R}" fill="none"
        stroke="${config.color}" stroke-width="14" stroke-linecap="butt"
        stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"
        style="--seg-len:${len}px;"></circle>`;
    offset += len;
    return seg;
  }).join('');

  // Leyenda interactiva: al enfocar un banco, el centro muestra su cifra.
  const resetCenter = () => {
    centerValue.textContent = formatCurrency(total);
    centerLabel.textContent = 'Total general';
  };
  resetCenter();

  segs.querySelectorAll('.donut-seg').forEach(seg => {
    const name = seg.dataset.bank;
    const show = () => {
      const g = groups[name];
      centerValue.textContent = formatCurrency(g.total);
      centerLabel.textContent = `${name} · ${g.count} retiro${g.count !== 1 ? 's' : ''}`;
      segs.querySelectorAll('.donut-seg').forEach(s => s.classList.toggle('dim', s !== seg));
    };
    seg.addEventListener('mouseenter', show);
    seg.addEventListener('mouseleave', () => {
      segs.querySelectorAll('.donut-seg').forEach(s => s.classList.remove('dim'));
      resetCenter();
    });
  });

  // Animación de entrada de los segmentos (stroke-dasharray progresivo).
  segs.querySelectorAll('.donut-seg').forEach((seg, i) => {
    seg.style.animation = `donutDraw .7s cubic-bezier(.4,0,.2,1) ${i * 0.12}s backwards`;
  });
}

// ── Leyenda por banco (colores + cifras) junto al donut ──
function renderBankLegend(groups, total) {
  const legend = document.getElementById('bankLegend');
  if (!legend) return;

  const names = sortedBankNames(Object.keys(groups));
  if (names.length === 0) {
    legend.innerHTML = '<div class="legend-empty">Sin retiros registrados</div>';
    return;
  }

  legend.innerHTML = names.map(name => {
    const g = groups[name];
    const pct = total > 0 ? Math.round((g.total / total) * 100) : 0;
    const config = getBankConfig(name);
    return `
      <div class="legend-item" data-bank="${name}">
        <span class="legend-dot" style="background:${config.color};"></span>
        <span class="legend-name">${name}</span>
        <span class="legend-amount">${formatCurrency(g.total)}</span>
        <span class="legend-pct">${pct}%</span>
      </div>`;
  }).join('');
}

// ── Totales por banco (tarjetas compactas) ──
// Cada tarjeta muestra SOLO los montos de ese banco: Total · Retirado · Falta.
function renderBankTotals() {
  const container = $('bankTotals');
  if (!container) return;

  const groups = {};
  banks.forEach(b => {
    const key = b.bankName || 'Otro banco';
    if (!groups[key]) {
      groups[key] = { bankName: key, total: 0, withdrawn: 0, pending: 0, inProcess: 0, complete: 0, count: 0 };
    }
    const g = groups[key];
    g.total += b.totalAmount || 0;
    g.withdrawn += b.withdrawn || 0;
    g.count++;
    const status = getBankStatus(b);
    if (status === 'red') g.pending++;
    else if (status === 'orange') g.inProcess++;
    else g.complete++;
  });

  const names = sortedBankNames(Object.keys(groups));

  container.innerHTML = names.map(name => {
    const g = groups[name];
    const falta = Math.max(0, g.total - g.withdrawn);
    const pct = g.total > 0 ? Math.min((g.withdrawn / g.total) * 100, 100) : 0;
    const config = getBankConfig(name);
    const done = g.inProcess === 0 && g.complete === g.count;
    const barClass = g.pending === g.count ? 'btb-fill bt-red'
      : g.complete === g.count ? 'btb-fill bt-green'
      : 'btb-fill bt-orange';
    return `
      <div class="bank-total-card" role="group" aria-label="Totales de ${name}">
        <div class="btb-header">
          <div class="btb-logo" style="background:${config.gradient};">${config.abbr}</div>
          <div class="btb-names">
            <div class="btb-bank">${name}</div>
            <div class="btb-count">${g.count} retiro${g.count !== 1 ? 's' : ''}${done ? ' · ✓' : ''}</div>
          </div>
        </div>
        <div class="btb-figures">
          <div class="btb-row">
            <span class="btb-label">Total</span>
            <span class="btb-value">${formatCurrency(g.total)}</span>
          </div>
          <div class="btb-row">
            <span class="btb-label">Retirado</span>
            <span class="btb-value btb-green">${formatCurrency(g.withdrawn)}</span>
          </div>
          <div class="btb-row">
            <span class="btb-label">Falta</span>
            <span class="btb-value ${falta > 0 ? 'btb-orange' : 'btb-green'}">${formatCurrency(falta)}</span>
          </div>
        </div>
        <div class="btb-bar">
          <div class="${barClass}" style="width:${pct}%;"></div>
        </div>
        <div class="btb-status">
          <span class="btb-dot btb-dot-red">${g.pending}</span>
          <span class="btb-dot btb-dot-orange">${g.inProcess}</span>
          <span class="btb-dot btb-dot-green">${g.complete}</span>
        </div>
      </div>`;
  }).join('');
}

function updateJarvisMessage(counts) {
  const total = counts.red + counts.orange + counts.green;
  let msg = '';

  if (total === 0) {
    msg = '<span class="jefe">Jefe,</span> sistema en espera. No hay retiros registrados.';
  } else if (counts.red + counts.orange === 0) {
    msg = `<span class="jefe">Jefe,</span> ${randomPhrase('allComplete')}`;
  } else if (counts.red === total) {
    msg = `<span class="jefe">Jefe,</span> ${randomPhrase('noneStarted')}`;
  } else {
    let closingSoon = false;
    banks.forEach(bank => {
      const status = getBankStatus(bank);
      if (status !== 'green') {
        const tr = getTimeRemaining(bank.closeTime);
        if (tr && tr.total < 3600000) closingSoon = true;
      }
    });

    if (closingSoon) {
      msg = `<span class="jefe">Jefe,</span> ${randomPhrase('closingSoon')}`;
    } else {
      msg = `<span class="jefe">Jefe,</span> ${randomPhrase('somePending')}`;
    }
  }

  jarvisMessage.innerHTML = msg;
}

// ── Timer Update ──
function startTimers() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    banks.forEach(bank => {
      const status = getBankStatus(bank);
      if (status === 'green') return;

      const timerEl = document.querySelector(`[data-bank-id="${bank.id}"]`);
      if (!timerEl) return;

      const tr = getTimeRemaining(bank.closeTime);
      if (!tr) {
        timerEl.textContent = 'Cerrado';
        timerEl.style.color = 'var(--text-muted)';
        timerEl.style.animation = 'none';
        return;
      }

      timerEl.textContent = formatTimeRemaining(tr);

      if (tr.total < 1800000) {
        timerEl.style.color = 'var(--accent-cyan)';
        timerEl.style.animation = 'timerPulse 1s ease-in-out infinite';
      } else if (tr.total < 3600000) {
        timerEl.style.color = 'var(--accent-cyan)';
        timerEl.style.animation = 'timerPulse 2s ease-in-out infinite';
      } else {
        timerEl.style.color = 'var(--text-primary)';
        timerEl.style.animation = 'none';
      }
    });
  }, 1000);
}

// ── Step Navigation ──
function goToStep(step) {
  currentStep = step;

  // Update step indicators
  for (let i = 1; i <= 3; i++) {
    const indicator = $(`step${i}Indicator`);
    const stepEl = $(`step${i}`);
    indicator.classList.remove('active', 'completed');
    stepEl.classList.remove('active');

    if (i < step) {
      indicator.classList.add('completed');
    } else if (i === step) {
      indicator.classList.add('active');
      stepEl.classList.add('active');
    }
  }

  // Update step lines
  const lines = document.querySelectorAll('.step-line');
  lines.forEach((line, i) => {
    line.classList.toggle('active', i < step - 1);
  });
}

// ── Modal Controls ──
let currentBankDraftId = null;

function openAddModal() {
  selectedCompany = null;
  selectedBank = null;
  currentStep = 1;
  // Identidad del registro en curso: se genera una sola vez para que un
  // reintento tras un fallo de guardado NO duplique el banco.
  currentBankDraftId = generateId();

  // Reset selections
  document.querySelectorAll('.company-card').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.bank-option').forEach(b => b.classList.remove('selected'));
  $('btnStep1Next').disabled = true;
  $('btnStep2Next').disabled = true;
  $('inputAmount').value = '';
  $('inputCloseTime').value = '16:00';
  $('inputBankNotes').value = '';

  goToStep(1);
  modalAdd.classList.add('active');
}

function closeAddModal() {
  modalAdd.classList.remove('active');
}

function openWithdraw(bankId) {
  currentWithdrawBankId = bankId;

  // Si el banco no está en memoria (dato corrupto, otra pestaña, caché
  // vieja…), recargar el estado en lugar de fallar en silencio.
  let bank = banks.find(b => b.id === bankId);
  if (!bank) {
    loadActiveBanks();
    bank = banks.find(b => b.id === bankId);
  }

  // Rellenar el modal dentro de try/catch: un campo concreto que falle
  // (ID ausente en caché vieja) NO debe impedir que se abra el cuadro.
  try {
    if (bank) {
      const remaining = getRemaining(bank);
      const progress = getProgress(bank);
      $('withdrawBankName').textContent = bank.bankName;
      const wiCompany = $('withdrawBankCompany');
      wiCompany.textContent = bank.company;
      wiCompany.style.background = companyConfigGradient(bank.company);
      $('withdrawTotal').textContent = formatCurrency(bank.totalAmount);
      $('withdrawRetirado').textContent = formatCurrency(bank.withdrawn);
      $('withdrawRestante').textContent = formatCurrency(remaining);
      $('withdrawProgressFill').style.width = progress + '%';
      $('inputWithdrawAmount').max = remaining;
    }
    $('inputWithdrawAmount').value = '';

    // Resetear campos del cheque (siempre visibles, sin toggle)
    $('withdrawChequeNumber').value = '';
    $('withdrawChequeName').value = '';
    $('withdrawChequeAlias').value = '';
    $('withdrawChequeNotes').value = '';
  } catch (err) {
    console.error('[Withdraw] Error al rellenar el modal:', err);
  }

  // Forzar reflow para que el navegador pinte la transición aunque el DOM
  // haya cambiado justo antes (p. ej. tras un re-render de la lista).
  void modalWithdraw.offsetHeight;
  modalWithdraw.classList.add('active');

  // Respaldo anti-"no hace nada": si el modal no llega a quedar visible
  // (transición rota, caché de CSS obsoleto…), forzar la apertura.
  setTimeout(() => {
    if (!modalWithdraw.classList.contains('active')) {
      modalWithdraw.classList.add('active');
    }
  }, 500);
}

function closeWithdrawModal() {
  modalWithdraw.classList.remove('active');
  currentWithdrawBankId = null;
}

function openDeleteModal(bankId) {
  currentDeleteBankId = bankId;
  modalDelete.classList.add('active');
}

function closeDeleteModal() {
  modalDelete.classList.remove('active');
  currentDeleteBankId = null;
}

// ── Event Handlers ──
$('btnAdd').addEventListener('click', openAddModal);
$('btnEmptyAdd')?.addEventListener('click', openAddModal);
$('btnCancelAdd').addEventListener('click', closeAddModal);
$('btnCancelWithdraw').addEventListener('click', closeWithdrawModal);
$('btnCancelWithdrawAction').addEventListener('click', closeWithdrawModal);
$('btnCancelDelete').addEventListener('click', closeDeleteModal);

// Nota: los campos del cheque están SIEMPRE visibles (sin toggle) para
// registrar a la mayor velocidad. El método se deduce al guardar.

// Enter en los campos del modal de retiro → Guardar (flujo ágil)
modalWithdraw.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
  e.preventDefault();
  $('btnConfirmWithdraw').click();
});
modalEditCheque.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName === 'BUTTON') return;
  e.preventDefault();
  $('btnSaveEditCheque').click();
});

// ── Editar / eliminar retiros registrados (efectivo · cheques · tarjetas) ──
function setEditFieldGroups(mode) {
  // mode: 'cheque' | 'card' | 'cash'
  // Igual que el registro: todos los campos en su propia casilla.
  const show = (id, on) => { $(id).style.display = on ? '' : 'none'; };
  show('grpEditBrand', mode === 'card');
  show('grpEditNumber', mode !== 'card');  // efectivo también captura nº de cheque
  show('grpEditDigits', mode !== 'cheque');
  show('grpEditName', true);   // nombre/cliente siempre visible
  show('grpEditAlias', true);  // alias/sucursal siempre visible
  show('grpEditNotes', true);  // notas siempre visible

  if (mode === 'cheque') {
    $('editItemTitle').textContent = '✏️ Editar Cheque';
    $('lblEditNumber').innerHTML = 'Número de Cheque <span class="optional-tag">Opcional</span>';
    $('lblEditAmount').textContent = 'Monto del Cheque';
    $('btnSaveEditLabel').textContent = 'Guardar Cheque';
  } else if (mode === 'card') {
    $('editItemTitle').textContent = '💳 Editar Tarjeta';
    $('lblEditAmount').textContent = 'Monto del Pago';
    $('btnSaveEditLabel').textContent = 'Guardar Tarjeta';
  } else {
    $('editItemTitle').textContent = '💰 Editar Efectivo';
    $('lblEditAmount').textContent = 'Monto del Retiro';
    $('btnSaveEditLabel').textContent = 'Guardar Efectivo';
    $('lblEditNumber').innerHTML = 'Número de Cheque <span class="optional-tag">Opcional</span>';
  }
}

function openEditWithdrawItem(bankId, kind, itemId) {
  const bank = banks.find(b => b.id === bankId);
  if (!bank) return;

  let item = null;
  if (kind === 'cheque') item = (bank.cheques || []).find(c => c.id === itemId);
  else if (kind === 'card') item = (bank.cards || []).find(c => c.id === itemId);
  else if (kind === 'cash') item = (bank.cash || []).find(c => c.id === itemId);
  if (!item) return;

  if (kind === 'cheque') {
    openEditChequeModal(bankId, itemId);
    return;
  }

  // Efectivo / tarjeta: modal completo — se puede añadir nombre/cliente y cambiar monto
  currentEditChequeBankId = bankId;
  currentEditChequeId = itemId;
  currentEditWithdrawItem = { bankId, kind, itemId };

  $('editChequeBankName').textContent = bank.bankName;
  $('editChequeBankCompany').textContent =
    kind === 'card' ? `💳 ${formatCardLabel(item)}` : '💰 Efectivo';

  setEditFieldGroups(kind);

  $('inputEditBrand').value = kind === 'card' ? (item.brand || '') : '';
  $('inputEditNumber').value = item.number || '';
  $('inputEditDigits').value = kind === 'card' ? (item.last4 || '') : '';
  $('inputEditChequeAmount').value = item.amount || 0;
  $('inputEditChequeName').value = item.name || '';
  $('inputEditChequeAlias').value = item.alias || '';
  $('inputEditNotes').value = item.notes || '';

  modalEditCheque.classList.add('active');
  setTimeout(() => $('inputEditChequeAmount').focus(), 400);
}

function deleteWithdrawItem(bankId, kind, itemId) {
  const bank = banks.find(b => b.id === bankId);
  if (!bank) return;

  if (kind === 'cheque') return deleteCheque(bankId, itemId);

  let item = null;
  if (kind === 'card') item = (bank.cards || []).find(c => c.id === itemId);
  else if (kind === 'cash') item = (bank.cash || []).find(c => c.id === itemId);
  if (!item) return;

  const label = kind === 'card' ? formatCardLabel(item) : 'Efectivo';
  const confirmMsg = `¿Eliminar este retiro?\n\n${kind === 'card' ? '💳' : '💰'} ${label}\n💰 ${formatCurrency(item.amount || 0)}\n\nSe recalculará el total retirado.`;
  if (!confirm(confirmMsg)) return;

  if (kind === 'card') bank.cards = bank.cards.filter(c => c.id !== itemId);
  else bank.cash = bank.cash.filter(c => c.id !== itemId);
  bank.withdrawn = Math.min(getMethodTotal(bank), bank.totalAmount);

  saveBanks();
  render();
  startTimers();
  showToast(`${label} eliminado. Retirado ahora: ${formatCurrency(bank.withdrawn)}`, '🗑️');
}

// ── Delegación global de acciones de las tarjetas de banco ──
// Antes usábamos onclick="..." inline en el HTML generado. Ese atributo depende
// de que la función global exista en el momento exacto del tap (y de que la
// caché vieja del service worker no sirva un app.js desactualizado). La
// delegación de eventos funciona siempre, aunque la caché esté obsoleta:
// el listener vive en este archivo y recibe cualquier toque dentro de la lista.
// Listeners DIRECTOS en cada botón de la tarjeta (además de la delegación):
// son redundantes a propósito — si la caché del service worker sirve un
// app.js/HTML viejo, al menos uno de los dos caminos ejecuta openWithdraw.
function bindWithdrawButton(b) {
  if (!b || b.dataset.withdrawBound === '1') return;
  b.dataset.withdrawBound = '1';
  b.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    openWithdraw(b.dataset.bank);
  });
}
document.querySelectorAll('[data-action="withdraw"]').forEach(bindWithdrawButton);

document.addEventListener('click', e => {
  const btn = e.target.closest ? e.target.closest('[data-action]') : null;
  if (!btn) return;
  const bankId = btn.dataset.bank;
  const action = btn.dataset.action;
  // "data-bank" no es un id: los data-*.dataset de un <button> del modal
  // (p. ej. botón X) devolverían undefined. Sanearlo evita que una acción
  // reciba undefined por accidente.
  const safeBankId = bankId || null;
  try {
    switch (action) {
      case 'withdraw':
        openWithdraw(safeBankId);
        break;
      case 'edit-bank':
        openEditBankModal(safeBankId);
        break;
      case 'delete-bank':
        openDeleteModal(safeBankId);
        break;
      case 'edit-item':
        openEditWithdrawItem(safeBankId, btn.dataset.kind, btn.dataset.item);
        break;
      case 'delete-item':
        deleteWithdrawItem(safeBankId, btn.dataset.kind, btn.dataset.item);
        break;
    }
  } catch (err) {
    // Una acción concreta no debe tumbar el resto de la delegación.
    console.error('[Delegación] Error en action=' + action + ':', err);
  }
});

// Close modals on overlay click
modalAdd.addEventListener('click', e => {
  if (e.target === modalAdd) closeAddModal();
});
modalWithdraw.addEventListener('click', e => {
  if (e.target === modalWithdraw) closeWithdrawModal();
});
modalDelete.addEventListener('click', e => {
  if (e.target === modalDelete) closeDeleteModal();
});

// ── Company Selection ──
document.querySelectorAll('.company-card').forEach(card => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.company-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedCompany = card.dataset.company;
    $('btnStep1Next').disabled = false;
  });
});

// ── Bank Selection ──
document.querySelectorAll('.bank-option').forEach(option => {
  option.addEventListener('click', () => {
    document.querySelectorAll('.bank-option').forEach(b => b.classList.remove('selected'));
    option.classList.add('selected');
    selectedBank = option.dataset.bank;
    $('btnStep2Next').disabled = false;
  });
});

// ── Step Navigation Buttons ──
$('btnStep1Next').addEventListener('click', () => {
  if (selectedCompany) goToStep(2);
});

$('btnStep2Back').addEventListener('click', () => goToStep(1));
$('btnStep2Next').addEventListener('click', () => {
  if (selectedBank) {
    $('ssCompany').textContent = selectedCompany;
    $('ssBank').textContent = selectedBank;
    const bankConfig = getBankConfig(selectedBank);
    $('inputCloseTime').value = bankConfig.close;
    goToStep(3);
    setTimeout(() => $('inputAmount').focus(), 400);
  }
});

$('btnStep3Back').addEventListener('click', () => goToStep(2));

// ── Save Bank ──
$('btnSaveBank').addEventListener('click', () => {
  const amount = parseFloat($('inputAmount').value);
  const closeTime = $('inputCloseTime').value;

  if (!selectedCompany) {
    goToStep(1);
    return;
  }
  if (!selectedBank) {
    goToStep(2);
    return;
  }
  if (!amount || amount <= 0) {
    $('inputAmount').focus();
    return;
  }

  const bankConfig = getBankConfig(selectedBank);

  const newBank = {
    // Se conserva entre aperturas del modal para reintentar un guardado fallido
    // sin duplicar el registro (y así preservar la identidad al fusionar el archivo).
    id: currentBankDraftId || generateId(),
    company: selectedCompany,
    bankName: selectedBank,
    totalAmount: amount,
    withdrawn: 0,
    closeTime: closeTime || bankConfig.close,
    notes: ($('inputBankNotes').value || '').trim(),
    createdAt: new Date().toISOString(),
  };

  banks.push(newBank);
  // Guard con reintento: si localStorage falla (p. ej. almacenamiento lleno),
  // el registro NO se pierde — se conserva en memoria y se reintenta al confirmar.
  if (!saveBanks()) {
    showToast('⚠️ Almacenamiento lleno: el registro se conservó en memoria. Libera espacio y vuelve a pulsar Guardar.', '⚠️', 6000);
    return;
  }
  closeAddModal();
  render();
  startTimers();
  showToast('Retiro registrado exitosamente', '✅');
});

// ── Confirm Withdraw ──
$('btnConfirmWithdraw').addEventListener('click', () => {
  // Guard robusto: si el modal de retiro se abrió en otra pestaña/dispositivo
  // (o el banco fue eliminado), el banco activo puede no estar en memoria.
  // Recargamos el estado desde localStorage en lugar de perder el registro.
  if (!currentWithdrawBankId) return;
  let bank = banks.find(b => b.id === currentWithdrawBankId);
  if (!bank) {
    loadActiveBanks();
    bank = banks.find(b => b.id === currentWithdrawBankId);
  }
  if (!bank) {
    showStickyToast('El registro ya no está disponible. Vuelve a intentarlo.', '⚠️');
    closeWithdrawModal();
    return;
  }

  const amount = parseFloat($('inputWithdrawAmount').value);
  if (!amount || amount <= 0) {
    $('inputWithdrawAmount').focus();
    return;
  }

  // Método deducido de los datos capturados (sin toggles):
  // número/nombre/alias → cheque · solo notas → efectivo con concepto.
  const chequeNumber = $('withdrawChequeNumber').value.trim();
  const chequeName = $('withdrawChequeName').value.trim();
  const chequeAlias = $('withdrawChequeAlias').value.trim();
  const chequeNotes = $('withdrawChequeNotes').value.trim();
  const isCheque = Boolean(chequeNumber || chequeName || chequeAlias);
  let cheque = null;

  // Siempre recalcular desde TODOS los métodos registrados (cheques + efectivo + tarjetas).
  // Así el "Retirado"/"Falta" nunca depende del orden en que se registraron los retiros
  // ni de si un monto previo estaba guardado solo en withdrawn sin su detalle.
  if (isCheque) {
    cheque = {
      id: generateId(),
      number: chequeNumber,
      amount: amount,
      name: chequeName,
      alias: chequeAlias,
      notes: chequeNotes,
    };
    if (!bank.cheques) bank.cheques = [];
    bank.cheques.push(cheque);
  } else {
    // Efectivo: las notas del bloque de cheques funcionan como concepto.
    if (!bank.cash) bank.cash = [];
    bank.cash.push({
      id: generateId(),
      amount: amount,
      notes: chequeNotes,
    });
  }
  bank.withdrawn = Math.min(getMethodTotal(bank), bank.totalAmount);

  // Guard con reintento: si localStorage falla (p. ej. almacenamiento lleno),
  // el registro NO se pierde — se conserva en memoria y se reintenta al confirmar.
  if (!saveBanks()) {
    showToast('⚠️ Almacenamiento lleno: el retiro se conservó en memoria. Libera espacio y pulsa Guardar de nuevo.', '⚠️', 6000);
    return;
  }
  closeWithdrawModal();
  render();
  startTimers();

  const newRemaining = getRemaining(bank);
  if (newRemaining <= 0) {
    showToast('¡Retiro completado! Fondos retirados al 100%', '🎉');
  } else if (cheque) {
    showToast(`Cheque ${cheque.number ? '#' + cheque.number : ''} de ${formatCurrency(amount)} registrado`, '📄');
  } else {
    showToast(`Retiro en efectivo de ${formatCurrency(amount)} registrado`, '💰');
  }

  // Limpiar campos de notas para el próximo retiro
  $('withdrawChequeNotes').value = '';
});

// ── Delete Bank ──
$('btnConfirmDelete').addEventListener('click', () => {
  if (!currentDeleteBankId) return;
  const prevBanks = banks;
  banks = banks.filter(b => b.id !== currentDeleteBankId);
  if (!saveBanks()) {
    banks = prevBanks; // revertir en memoria: nada se pierde si el guardado falla
    showStickyToast('No se pudo eliminar (almacenamiento lleno). Inténtalo tras liberar espacio.', '⚠️');
    return;
  }
  closeDeleteModal();
  render();
  startTimers();
  showToast('Retiro eliminado', '🗑️');
});

// ── Finalize Day Button ──
$('btnFinalizeDay').addEventListener('click', openFinalizeModal);

// ── Finalize Day Events ──
$('btnHistory').addEventListener('click', openHistoryModal);
$('btnCloseHistory').addEventListener('click', closeHistoryModal);
modalHistory.addEventListener('click', e => {
  if (e.target === modalHistory) closeHistoryModal();
});

$('btnCloseDayDetail').addEventListener('click', closeDayDetail);
modalDayDetail.addEventListener('click', e => {
  if (e.target === modalDayDetail) closeDayDetail();
});

$('btnDeleteDay').addEventListener('click', () => {
  if (!currentDayDetailDate) return;
  deleteDayArchive();
});

$('btnEditDay').addEventListener('click', () => {
  showToast('Usa el botón ✏️ en cada banco para editar', '💡');
});

// ── Compartir desde el Historial: el día archivado más reciente ──
$('btnShareLatestDay').addEventListener('click', () => {
  const keys = getAllArchiveKeys(); // orden descendente: [0] = más reciente
  if (keys.length === 0) {
    showToast('No hay días archivados todavía', '⚠️');
    return;
  }
  shareDaySummary(keys[0].replace('banktracker_day_', ''));
});

// ── Edit Record Events ──
$('btnCloseEditRecord').addEventListener('click', closeEditRecord);
$('btnCancelEditRecord').addEventListener('click', closeEditRecord);
modalEditRecord.addEventListener('click', e => {
  if (e.target === modalEditRecord) closeEditRecord();
});
$('btnSaveEditRecord').addEventListener('click', saveEditRecord);

// ── Edit Bank Modal Events ──
$('btnCloseEditBank').addEventListener('click', closeEditBankModal);
$('btnCancelEditBank').addEventListener('click', closeEditBankModal);
modalEditBank.addEventListener('click', e => {
  if (e.target === modalEditBank) closeEditBankModal();
});
$('btnSaveEditBank').addEventListener('click', saveEditBank);

// ── Edit Cheque Modal Events ──
$('btnCloseEditCheque').addEventListener('click', closeEditChequeModal);
$('btnCancelEditCheque').addEventListener('click', closeEditChequeModal);
modalEditCheque.addEventListener('click', e => {
  if (e.target === modalEditCheque) closeEditChequeModal();
});
$('btnSaveEditCheque').addEventListener('click', saveEditCheque);

// Últimos 4 dígitos al editar tarjeta: solo números, máximo 4
$('inputEditDigits').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
});

// ── Finalize Day Modal ──
function openFinalizeModal() {
  if (banks.length === 0) {
    showToast('No hay retiros activos para finalizar', '⚠️');
    return;
  }
  modalFinalize.classList.add('active');
}

function closeFinalizeModal() {
  modalFinalize.classList.remove('active');
}

$('btnCancelFinalize').addEventListener('click', closeFinalizeModal);
$('btnConfirmFinalize').addEventListener('click', () => {
  closeFinalizeModal();
  finalizeDay();
});
modalFinalize.addEventListener('click', e => {
  if (e.target === modalFinalize) closeFinalizeModal();
});

// ── Keyboard handling ──
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeAddModal();
    closeWithdrawModal();
    closeDeleteModal();
    closeFinalizeModal();
    closeHistoryModal();
    closeDayDetail();
    closeEditRecord();
    closeEditBankModal();
    closeEditChequeModal();
  }
});

// ── Initialize ──
try {
  initSplash();
} catch (e) {
  showFatalError(e);
}

// Último recurso: si algo inesperado revienta el render u otra parte de la app,
// no dejar la app congelada — mostrar el error y ofrecer reintentar.
window.addEventListener('error', e => {
  if (!document.getElementById('splashScreen')?.classList.contains('fade-out') &&
      document.getElementById('splashScreen')?.style.display !== 'none') {
    // El splash aún domina la pantalla → error de arranque.
    showFatalError(e.error || e.message || e);
  }
});
