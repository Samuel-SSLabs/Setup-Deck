'use strict';
document.addEventListener('contextmenu', event => event.preventDefault());

// ═══════════════════════════════════════════════════════════════════
// 1. WAILS / GO API BRIDGE
// ═══════════════════════════════════════════════════════════════════

const api = {
  minimize:        () => window.runtime && window.runtime.WindowHide(),
  maximize:        () => window.runtime && window.runtime.WindowToggleMaximise(),
  close:           () => window.runtime && window.runtime.Quit(),

  lerDeck: async () => {
    if (window.go?.main?.App) return await window.go.main.App.LerConfigDaDeck();
    return "";
  },

  syncDeck: async (jsonConfig) => {
    if (window.go?.main?.App) return await window.go.main.App.SincronizarDeck(jsonConfig);
    return true;
  },

  toggleAutoStart: async (enabled) => {
    if (!window.go?.main?.App) return;
    return enabled
      ? await window.go.main.App.AtivarIniciacaoAutomatica()
      : await window.go.main.App.DesativarIniciacaoAutomatica();
  },

  checkAutoStart: async () => {
    if (window.go?.main?.App) return await window.go.main.App.VerificarAutoStart();
    return false;
  },

  ativarHook: async () => {
    if (window.go?.main?.App?.IniciarHookTeclado) return await window.go.main.App.IniciarHookTeclado();
  },

  pararHook: async () => {
    if (window.go?.main?.App?.PararHookTeclado) return await window.go.main.App.PararHookTeclado();
  },

  lerEstatisticas: async () => {
    if (window.go?.main?.App) return await window.go.main.App.LerEstatisticas();
    return null;
  },

  reiniciarConexao: async () => {
    if (window.go?.main?.App?.ReiniciarConexao) {
      await window.go.main.App.ReiniciarConexao();
    }
  }
};

// ═══════════════════════════════════════════════════════════════════
// 2. SISTEMA DE DIÁLOGO VISUAL DO APP (MODAL CUSTOMIZADO)
// ═══════════════════════════════════════════════════════════════════

function mostrarModal({ title, message, showInput, inputPlaceholder, onConfirm }) {
  const modal = document.getElementById('customModal');
  document.getElementById('modalTitle').innerText = title;
  document.getElementById('modalMessage').innerText = message || '';
  
  const inputCont = document.getElementById('modalInputContainer');
  const input = document.getElementById('modalInput');
  if (showInput) {
    inputCont.style.display = 'block';
    input.value = '';
    input.placeholder = inputPlaceholder || '';
    setTimeout(() => input.focus(), 50);
  } else {
    inputCont.style.display = 'none';
  }
  
  modal.style.display = 'flex';
  
  document.getElementById('modalBtnConfirm').onclick = () => {
    modal.style.display = 'none';
    if (onConfirm) onConfirm(showInput ? input.value : true);
  };
  document.getElementById('modalBtnCancel').onclick = () => {
    modal.style.display = 'none';
  };
}

// ═══════════════════════════════════════════════════════════════════
// 3. CONSTANTES E VARIÁVEIS DE ESTADO
// ═══════════════════════════════════════════════════════════════════

const THEMES = {
  'volt':   { main: '#e8ff47', dim: 'rgba(232,255,71,0.14)',    faint: 'rgba(232,255,71,0.06)' },
  'red':    { main: '#d73636', dim: 'rgba(215,54,54,0.14)',     faint: 'rgba(215,54,54,0.06)' },
  'green':  { main: '#00bf63', dim: 'rgba(0,191,99,0.14)',      faint: 'rgba(0,191,99,0.06)' },
  'purple': { main: '#8c52ff', dim: 'rgba(140,82,255,0.14)',    faint: 'rgba(140,82,255,0.06)' },
  'pink':   { main: '#ff66c4', dim: 'rgba(255,102,196,0.14)',   faint: 'rgba(255,102,196,0.06)' },
  'cyan':   { main: '#0097b2', dim: 'rgba(0,151,178,0.14)',     faint: 'rgba(0,151,178,0.06)' }
};

const PINS = ['GP28', 'GP27', 'GP26', 'GP4', 'GP5', 'GP6'];
const N = 6;
let selBtn   = 0;
let selPress = 'curto';
let visualizacaoAtalhos = 'curto'; // Estado global: 'curto' ou 'longo'

const BOTAO_IMGS = [
  './assets/botao-1.png', './assets/botao-2.png', './assets/botao-3.png',
  './assets/botao-4.png', './assets/botao-5.png', './assets/botao-6.png'
];

let cfg = Array.from({ length: N }, () => ({
  curto: { type: 'none' },
  longo: { type: 'none' },
}));

let currentDeviceType = "Desconectado";
let isCapturing   = false;
let capturedKeys  = [];
const _pressedKeys = new Set();
const _pressedVKs  = new Map(); 
let _captureTimer = null;
let _toastTimer   = null;

const KB_CATEGORIES = [
  { label: 'Windows',        id: 'windows'     },
  { label: 'Atalhos Gerais', id: 'geral'       },
  { label: 'CorelDRAW',      id: 'corel'       },
  { label: 'Inkscape',       id: 'inkscape'    },
  { label: 'Office',         id: 'office'      },
  { label: 'Formatação',     id: 'formato'     },
  { label: 'Navegação',      id: 'navegacao'   },
  { label: 'Documentos',     id: 'docs'        },
  { label: 'Atendimento',    id: 'atendimento' },
];

const KB_OPTIONS = {
  windows: [
    { label: 'Win + V — Histórico de área de clipboard', value: '["WINDOWS","V"]' },
    { label: 'Win + E — Explorador de Arquivos',         value: '["WINDOWS","E"]' },
    { label: 'Win + R — Executar',                       value: '["WINDOWS","R"]' },
    { label: 'Win + D — Mostrar desktop',                value: '["WINDOWS","D"]' },
    { label: 'Win + L — Bloquear tela',                  value: '["WINDOWS","L"]' },
    { label: 'Win + I — Configurações',                  value: '["WINDOWS","I"]' },
    { label: 'Win + S — Pesquisar',                      value: '["WINDOWS","S"]' },
  ],
  geral: [
    { label: 'Ctrl + C — Copiar',                        value: '["CONTROL","C"]' },
    { label: 'Ctrl + V — Colar',                         value: '["CONTROL","V"]' },
    { label: 'Ctrl + X — Recortar',                      value: '["CONTROL","X"]' },
    { label: 'Ctrl + Z — Desfazer',                      value: '["CONTROL","Z"]' },
    { label: 'Ctrl + Y — Refazer',                       value: '["CONTROL","Y"]' },
    { label: 'Ctrl + S — Salvar',                        value: '["CONTROL","S"]' },
    { label: 'Ctrl + Shift + Esc — Task Manager',        value: '["CONTROL","SHIFT","ESCAPE"]' },
    { label: 'Alt + F4 — Fechar janela',                 value: '["ALT","F4"]' },
    { label: 'PrintScreen — Capturar tela',              value: '["PRINT_SCREEN"]' },
    { label: 'Alt + PrintScreen — Capturar janela',      value: '["ALT","PRINT_SCREEN"]' },
  ],
  corel: [
    { label: 'Ctrl + D — Duplicar',                      value: '["CONTROL","D"]' },
    { label: 'Ctrl + G — Agrupar',                       value: '["CONTROL","G"]' },
    { label: 'Ctrl + U — Desagrupar',                    value: '["CONTROL","U"]' },
    { label: 'Ctrl + I — Importar',                      value: '["CONTROL","I"]' },
    { label: 'Ctrl + E — Exportar',                      value: '["CONTROL","E"]' },
    { label: 'P — Centralizar na página',                value: '["P"]' },
    { label: 'F10 — Editar nós',                         value: '["F10"]' },
  ],
  inkscape: [
    { label: 'Ctrl + D — Duplicar',                      value: '["CONTROL","D"]' },
    { label: 'Ctrl + G — Agrupar',                       value: '["CONTROL","G"]' },
    { label: 'Ctrl + Shift + G — Desagrupar',            value: '["CONTROL","SHIFT","G"]' },
    { label: 'Ctrl + Shift + C — Converter p/ caminho',  value: '["CONTROL","SHIFT","C"]' },
    { label: 'Ctrl + Shift + A — Alinhar e distribuir',  value: '["CONTROL","SHIFT","A"]' },
    { label: 'Ctrl + Shift + L — Preench e contorno',    value: '["CONTROL","SHIFT","L"]' },
    { label: 'Ctrl + Alt + Num5 — Centralizar',          value: '["CONTROL","ALT","NUMPAD5"]' },
    { label: '+ — Zoom in',                              value: '["+"]' },
    { label: '- — Zoom out',                             value: '["-"]' },
  ],
  office: [
    { label: 'Ctrl + N — Novo documento',                value: '["CONTROL","N"]' },
    { label: 'Ctrl + O — Abrir',                         value: '["CONTROL","O"]' },
    { label: 'Ctrl + P — Imprimir',                      value: '["CONTROL","P"]' },
  ],
  formato: [
    { label: 'Ctrl + B — Negrito',                       value: '["CONTROL","B"]' },
    { label: 'Ctrl + I — Itálico',                       value: '["CONTROL","I"]' },
    { label: 'Ctrl + U — Sublinhado',                    value: '["CONTROL","U"]' },
    { label: 'Ctrl + K — Inserir link',                  value: '["CONTROL","K"]' },
  ],
  navegacao: [
    { label: 'Ctrl + F — Localizar',                     value: '["CONTROL","F"]' },
    { label: 'Ctrl + H — Substituir',                    value: '["CONTROL","H"]' },
    { label: 'Ctrl + F5 — Recarregar página',            value: '["CONTROL","F5"]' },
    { label: 'Ctrl + T — Nova aba',                      value: '["CONTROL","T"]' },
    { label: 'Ctrl + W — Fechar aba',                    value: '["CONTROL","W"]' },
  ],
  docs: [
    { label: 'Ctrl + S — Salvar documento',              value: '["CONTROL","S"]' },
    { label: 'Ctrl + Z — Desfazer',                      value: '["CONTROL","Z"]' },
    { label: 'Ctrl + Y — Refazer',                       value: '["CONTROL","Y"]' },
    { label: '+ — Zoom in',                              value: '["+"]' },
    { label: '- — Zoom out',                             value: '["-"]' },
  ],
  atendimento: [
    { label: '/ + A — Como posso ajudar:',               value: '["DIVIDE","A","TAB"]' },
    { label: '/ + B — Algo mais que possa ajudar...:',   value: '["DIVIDE","B","TAB"]' },
    { label: '/ + C — Precisando estamos a disp...',     value: '["DIVIDE","C","TAB"]' },
    { label: '/ + D — Reconectar o Whatsapp',            value: '["DIVIDE","D","TAB"]' },
    { label: '/ + E — Por nada! Precisando...',          value: '["DIVIDE","E","TAB"]' },
    { label: '/ + F — Finalizado por ligação',           value: '["DIVIDE","F","TAB"]' },
    { label: '/ + H — Hora de muçar',                    value: '["DIVIDE","H","TAB"]' },
    { label: '/ + I — Por inatividade',                  value: '["DIVIDE","I","TAB"]' },
  ],
};

const MEDIA_OPTIONS = [
  { label: 'Play / Pause', value: '["MEDIA_PLAY_PAUSE"]' },
  { label: 'Próxima',      value: '["MEDIA_NEXT"]'       },
  { label: 'Anterior',     value: '["MEDIA_PREVIOUS"]'   },
  { label: 'Volume +',     value: '["MEDIA_VOLUME_UP"]'  },
  { label: 'Volume -',     value: '["MEDIA_VOLUME_DOWN"]'},
  { label: 'Mudo',         value: '["MEDIA_MUTE"]'       },
];

const MODIFIERS = ['Control', 'Shift', 'Alt', 'Meta'];
const CODE_TO_VK = {
  'ControlLeft':  'CONTROL', 'ControlRight': 'CONTROL',
  'ShiftLeft':    'SHIFT',   'ShiftRight':   'SHIFT',
  'AltLeft':      'ALT',     'AltRight':     'ALT',
  'MetaLeft':     'WINDOWS', 'MetaRight':    'WINDOWS',
  'Enter':        'ENTER',   'NumpadEnter':  'ENTER',
  'Escape':       'ESCAPE',  'Backspace':    'BACKSPACE',
  'Delete':       'DELETE',  'Tab':          'TAB',
  'Space':        'SPACE',   'Slash':        'OEM_2',   
  'IntlRo':       'OEM_2',   
  'Numpad0':      'NUMPAD0', 'Numpad1': 'NUMPAD1', 'Numpad2': 'NUMPAD2',
  'Numpad3':      'NUMPAD3', 'Numpad4': 'NUMPAD4', 'Numpad5': 'NUMPAD5',
  'Numpad6':      'NUMPAD6', 'Numpad7': 'NUMPAD7', 'Numpad8': 'NUMPAD8',
  'Numpad9':      'NUMPAD9', 'NumpadDecimal':  'DECIMAL',
  'NumpadAdd':      'ADD',   'NumpadSubtract': 'SUBTRACT',
  'NumpadMultiply': 'MULTIPLY', 'NumpadDivide':   'DIVIDE',
};

const VK_LABELS = {
  'CONTROL': 'Ctrl', 'SHIFT': 'Shift', 'ALT': 'Alt', 'WINDOWS': 'Win',
  'ENTER': 'Enter', 'ESCAPE': 'Esc', 'BACKSPACE': '⌫', 'DELETE': 'Del',
  'TAB': 'Tab', 'SPACE': 'Space', 'OEM_2': '/',
  'NUMPAD0': 'Num0', 'NUMPAD1': 'Num1', 'NUMPAD2': 'Num2',
  'NUMPAD3': 'Num3', 'NUMPAD4': 'Num4', 'NUMPAD5': 'Num5',
  'NUMPAD6': 'Num6', 'NUMPAD7': 'Num7', 'NUMPAD8': 'Num8',
  'NUMPAD9': 'Num9', 'DECIMAL': 'Num.', 'ADD': 'Num+', 'SUBTRACT': 'Num-',
  'MULTIPLY': 'Num*', 'DIVIDE': 'Num/',
};

function resolveKeyFromEvent(e) {
  if (CODE_TO_VK[e.code]) return CODE_TO_VK[e.code];
  const k = e.key;
  if (k.length === 1) return k.toUpperCase();     
  if (k.startsWith('F') && k.length <= 3) return k; 
  return k.toUpperCase();
}

function formatKey(vk) { return VK_LABELS[vk] || vk; }
function keyToCode(vk) { return vk; } 
function codeToKey(code) { return code; }

function parseAction(arr, tipoStr) {
  if (!arr || arr.length === 0) return { type: 'none' };
  const valStr = JSON.stringify(arr);
  if (valStr.includes('APP_TOGGLE')) return { type: 'app', value: valStr };
  if (tipoStr === 'midia' || arr[0].includes('MEDIA')) return { type: 'media', value: valStr };
  const isPredef = Object.values(KB_OPTIONS).flat().some(o => o.value === valStr);
  if (isPredef) return { type: 'keyboard', value: valStr };
  return { type: 'capture', value: valStr, keys: arr, display: arr.map(formatKey).join(' + ') };
}

// ═══════════════════════════════════════════════════════════════════
// 4. INTERFACE E MONITORAMENTO DE ESTATÍSTICAS
// ═══════════════════════════════════════════════════════════════════

async function fetchStats() {
  const stats = await api.lerEstatisticas();
  if (!stats) return;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  set('statTotalClicks', stats.total.toLocaleString('pt-BR'));
  set('statFirstUse',    stats.firstUse || '--/--/----');
  set('statBtn0', stats.btn0.toLocaleString('pt-BR'));
  set('statBtn1', stats.btn1.toLocaleString('pt-BR'));
  set('statBtn2', stats.btn2.toLocaleString('pt-BR'));
  set('statBtn3', stats.btn3.toLocaleString('pt-BR'));
  set('statBtn4', stats.btn4.toLocaleString('pt-BR'));
  set('statBtn5', stats.btn5.toLocaleString('pt-BR'));
}

window.toggleOrientation = function(isVertical) {
  const grid      = document.getElementById('btnGrid');
  const statsGrid = document.getElementById('statsGrid');
  grid      && grid.classList.toggle('layout-vertical', isVertical);
  statsGrid && statsGrid.classList.toggle('layout-vertical', isVertical);
};

window.toggleAutoStart = async function(enabled) { await api.toggleAutoStart(enabled); };

window.setTheme = async function(id, btnElement = null) {
  const t = THEMES[id];
  if (!t) return;
  document.documentElement.style.setProperty('--accent',       t.main);
  document.documentElement.style.setProperty('--accent-dim',   t.dim);
  document.documentElement.style.setProperty('--accent-faint', t.faint);
  const logoImg = document.getElementById('titlebarLogo');
  if (logoImg) logoImg.src = `./assets/icon-${id}.ico`;
  document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
  if (btnElement) btnElement.classList.add('active');
  else document.querySelector(`.theme-btn[data-theme="${id}"]`)?.classList.add('active');
  if (window.go?.main?.App) await window.go.main.App.MudarTema(id);
};

async function loadConfigFromDevice() {
  const jsonStr = await api.lerDeck();
  if (!jsonStr) return;
  try {
    const data = JSON.parse(jsonStr);
    const hapticEnabled = document.getElementById('hapticEnabled');
    if (hapticEnabled) {
      hapticEnabled.checked = data.vib_enabled !== false;
      document.getElementById('hapticShort').checked = data.hapticShort !== false;
      document.getElementById('hapticLong').checked  = data.hapticLong  !== false;
      const pct = data.hapticIntensityPct || 50;
      document.getElementById('hapticIntensityPct').value     = pct;
      document.getElementById('hapticIntVal').textContent     = pct + '%';
      document.getElementById('longPressTime').value          = (data.long_press_ms / 1000).toFixed(1);
      document.getElementById('longPressVal').textContent     = (data.long_press_ms / 1000).toFixed(1) + 's';
      document.getElementById('debounceTime').value           = data.short_press_ms;
      document.getElementById('debounceVal').textContent      = data.short_press_ms + 'ms';
    }

    const isVertical   = data.layout === "vertical";
    const layoutToggle = document.getElementById('layoutVertical');
    if (layoutToggle) layoutToggle.checked = isVertical;
    window.toggleOrientation(isVertical);

    if (data.perfis?.[0]) {
      const perfil = data.perfis[0];
      for (let i = 0; i < N; i++) {
        if (perfil[i]) {
          cfg[i].curto = parseAction(perfil[i].curto, perfil[i].tipo);
          cfg[i].longo = parseAction(perfil[i].longo, perfil[i].tipo);
        }
      }
    }
    render();
    loadForm();
    window.refreshPreview();

    document.getElementById('statusText').textContent  = `Conectado (${currentDeviceType} Deck)`;
    document.getElementById('lblDeckName').textContent = `${currentDeviceType.toUpperCase()} DECK DETECTADA`;
    document.getElementById('lblUsbBadge').innerHTML   = `<span class="status-dot"></span>USB SERIAL`;
    showToast("Configurações importadas da Deck!", "success");
  } catch (e) {
    showToast("Erro ao ler configuração da Deck", "error");
  }
}

function setDeviceStatus(isConnected, deviceName = "") {
  const statusDiv  = document.getElementById('connectionStatus');
  const statusText = document.getElementById('statusText');
  const lblName    = document.getElementById('lblDeckName');
  const lblBadge   = document.getElementById('lblUsbBadge');
  const motorCard  = document.getElementById('motorBehaviorCard');
  const lblModel   = document.getElementById('statDeviceModel');

  if (!isConnected) {
    currentDeviceType = "Desconectado";
    statusDiv.className        = 'titlebar-status disconnected';
    statusText.textContent     = 'Desconectado';
    lblName.textContent        = 'AGUARDANDO CONEXÃO...';
    lblBadge.className         = 'usb-badge disconnected';
    lblBadge.innerHTML         = `<span class="status-dot"></span>DESCONECTADO`;
    if (lblModel)  lblModel.textContent = "Aguardando...";
    if (motorCard) motorCard.classList.remove('disabled-item');
    return;
  }

  if (lblModel) lblModel.textContent = `${deviceName} Deck`;
  const isCore = deviceName === 'Core';

  if (currentDeviceType === "Desconectado") {
    currentDeviceType      = deviceName;
    statusDiv.className    = 'titlebar-status';
    statusText.textContent = 'Importando configurações...';
    lblName.textContent    = 'IMPORTANDO CONFIGURAÇÕES...';
    lblBadge.className     = 'usb-badge';
    lblBadge.innerHTML     = `<span class="status-dot" style="background:var(--orange);"></span>SINCRONIZANDO`;
    if (motorCard) motorCard.classList.toggle('disabled-item', isCore);
    setTimeout(loadConfigFromDevice, 500);
  } else {
    statusDiv.className    = 'titlebar-status';
    statusText.textContent = `Conectado (${deviceName} Deck)`;
    lblName.textContent    = `${deviceName.toUpperCase()} DECK DETECTADA`;
    lblBadge.className     = 'usb-badge';
    lblBadge.innerHTML     = `<span class="status-dot"></span>USB SERIAL`;
    if (motorCard) motorCard.classList.toggle('disabled-item', isCore);
  }
}

function showPage(id, navEl) {
  if (navEl?.classList.contains('disabled-item')) return;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  if (navEl) navEl.classList.add('active');
  if (id === 'stats') fetchStats();
  if (id === 'sobre') window.carregarInfoSobre(); 
}

function getLabel(action) {
  if (!action || action.type === 'none') return '—';
  if (action.type === 'capture') return action.display || action.keys?.join('+') || '—';
  if (action.type === 'app') return 'Abrir App';
  const found = [...Object.values(KB_OPTIONS).flat(), ...MEDIA_OPTIONS].find(o => o.value === action.value);
  return found ? found.label : (action.value || '—');
}

function getIcon(action) {
  if (!action || action.type === 'none') return '·';
  if (action.type === 'capture') return '⌨';
  if (action.type === 'app') return '⬡';
  if (action.value?.includes('MEDIA')) return '🎵';
  return '⌘';
}

function render() {
  const grid = document.getElementById('btnGrid');
  grid.innerHTML = '';
  for (let i = 0; i < N; i++) {
    const b = cfg[i];
    const hasAny = b.curto.type !== 'none' || b.longo.type !== 'none';
    const wrapper = document.createElement('div');
    wrapper.className = 'btn-wrapper';
    
    const div = document.createElement('div');
    div.className = `btn-tile ${i === selBtn ? 'selected' : ''} ${hasAny ? 'configured' : ''}`;
    div.onclick = () => selectBtn(i);
    
    div.innerHTML = `
      <button class="btn-delete-action" onclick="event.stopPropagation(); window.limparBotao(${i})" title="Limpar ação do botão">✕</button>
      <img src="${BOTAO_IMGS[i]}" class="bg-icon" onerror="this.style.opacity=0">
      <span class="btn-tile-num">${i + 1}</span>
      <span class="btn-tile-icon">${getIcon(b.curto)}</span>
      <div class="btn-tile-pips">
        <div class="pip ${b.curto.type !== 'none' ? 'on' : ''}"></div>
        <div class="pip ${b.longo.type !== 'none' ? 'on' : ''}"></div>
      </div>
    `;
    
    const label = document.createElement('div');
    label.className  = 'btn-label-outside';
    label.textContent = getLabel(b[visualizacaoAtalhos]);
    
    wrapper.appendChild(div);
    wrapper.appendChild(label);
    grid.appendChild(wrapper);
  }
}

window.alternarVisualizacaoAtalhos = function() {
  visualizacaoAtalhos = (visualizacaoAtalhos === 'curto') ? 'longo' : 'curto';
  
  const txt = document.getElementById('txtAlternar');
  const btn = document.getElementById('btnAlternarVisualizacao');
  
  if (txt) {
    txt.textContent = visualizacaoAtalhos.charAt(0).toUpperCase() + visualizacaoAtalhos.slice(1);
  }

  if (btn) {
    if (visualizacaoAtalhos === 'longo') {
      btn.style.borderColor = 'var(--accent)';
      btn.style.color = 'var(--text)'; // Mantém a cor branca/cinza clara
    } else {
      btn.style.borderColor = 'var(--border2)';
      btn.style.color = 'var(--text)'; // Mantém a cor branca/cinza clara
    }
  }
  
  render();
};
function selectBtn(i) {
  selBtn = i;
  document.getElementById('cfgTitle').textContent = `Botão ${i + 1}`;
  document.getElementById('cfgPin').textContent   = PINS[i];
  loadForm();
  render();
}

function setPress(type) {
  selPress = type;
  ['curto', 'longo'].forEach(t =>
    document.getElementById('tab-' + t).classList.toggle('active', t === type)
  );
  document.getElementById('cfgPressLabel').textContent =
    type === 'curto' ? 'Clique curto' : 'Clique longo';
  loadForm();
}

function onCategoryChange() {
  const cat = document.getElementById('catSelect').value;
  document.getElementById('field-keyboard').style.display    = cat === 'keyboard'    ? '' : 'none';
  document.getElementById('field-capture').style.display     = cat === 'capture'     ? '' : 'none';
  document.getElementById('field-media').style.display       = cat === 'media'       ? '' : 'none';
  document.getElementById('field-app-control').style.display = cat === 'app' ? '' : 'none';
  if (cat !== 'capture') stopCapture();
}

function onCategoryKbChange() {
  const cat = document.getElementById('kbCategory').value;
  const options = KB_OPTIONS[cat] || [];
  document.getElementById('kbSelect').innerHTML =
    options.map(o => `<option value='${o.value}'>${o.label}</option>`).join('');
}

function loadForm() {
  const action = cfg[selBtn][selPress];
  document.getElementById('catSelect').value = action.type || 'none';
  onCategoryChange();

  if (action.type === 'keyboard') {
    const catId = Object.keys(KB_OPTIONS).find(cat =>
      KB_OPTIONS[cat].some(o => o.value === action.value)
    ) || KB_CATEGORIES[0].id;
    document.getElementById('kbCategory').value = catId;
    onCategoryKbChange();
    document.getElementById('kbSelect').value = action.value || KB_OPTIONS[catId][0].value;
  }
  if (action.type === 'media') document.getElementById('mediaSelect').value = action.value || MEDIA_OPTIONS[0].value;
  if (action.type === 'app') document.getElementById('appControlSelect').value = action.value || '["APP_TOGGLE"]';

  if (action.type === 'capture') {
    capturedKeys = action.keys || [];
    renderCaptureKeys(capturedKeys);
  }
}

function saveAction() {
  const cat = document.getElementById('catSelect').value;
  let action = { type: cat };

  if (cat === 'keyboard') action.value = document.getElementById('kbSelect').value;
  else if (cat === 'media') action.value = document.getElementById('mediaSelect').value;
  else if (cat === 'app') action.value = document.getElementById('appControlSelect').value;
  else if (cat === 'capture') {
    if (!capturedKeys.length) return showToast('Capture uma combinação primeiro', 'error');
    action.keys    = [...capturedKeys];
    action.display = capturedKeys.map(formatKey).join(' + ');
    action.value   = JSON.stringify(capturedKeys);
  } else {
    action = { type: 'none' };
  }

  cfg[selBtn][selPress] = action;
  render();
  showToast('Ação salva!', 'success');
  stopCapture();
  window.refreshPreview();
}

// ═══════════════════════════════════════════════════════════════════
// 5. CAPTURA DE TECLAS EM SEGUNDO PLANO
// ═══════════════════════════════════════════════════════════════════
function toggleCapture() { isCapturing ? stopCapture() : startCapture(); }

function startCapture() {
  isCapturing = true;
  capturedKeys = [];
  _pressedKeys.clear();
  _pressedVKs.clear();
  api.ativarHook();
  document.getElementById('captureZone').classList.add('listening');
  document.getElementById('captureHint').textContent = 'Pressione as teclas...';
  renderCaptureKeys([]);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup',   onKeyUp);
}

function stopCapture() {
  if (isCapturing) api.pararHook();
  isCapturing = false;
  document.getElementById('captureZone').classList.remove('listening');
  document.getElementById('captureHint').textContent = 'Clique aqui para capturar';
  document.removeEventListener('keydown', onKeyDown);
  document.removeEventListener('keyup',   onKeyUp);
}

function onKeyDown(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
  const vk = resolveKeyFromEvent(e);
  _pressedKeys.add(e.code); 
  _pressedVKs.set(e.code, vk); 
  clearTimeout(_captureTimer);

  const modVKs = ['CONTROL','SHIFT','ALT','WINDOWS'];
  capturedKeys = [
    ...[..._pressedVKs.values()].filter(v => modVKs.includes(v)),
    ...[..._pressedVKs.values()].filter(v => !modVKs.includes(v)),
  ];
  renderCaptureKeys(capturedKeys);
}

function onKeyUp(e) {
  const vk = resolveKeyFromEvent(e);
  _pressedKeys.delete(e.code);
  _pressedVKs.delete(e.code);

  if (vk === 'WINDOWS') {
    clearTimeout(_captureTimer);
    _captureTimer = setTimeout(() => { if (isCapturing && capturedKeys.length > 0) stopCapture(); }, 600);
    return;
  }
  clearTimeout(_captureTimer);
  _captureTimer = setTimeout(() => { if (isCapturing && capturedKeys.length > 0) stopCapture(); }, 600);
}

function renderCaptureKeys(keys) {
  const zone = document.getElementById('captureKeys');
  if (!keys.length) {
    zone.innerHTML = '<span style="font-size:12px;color:var(--muted2);">Nenhuma tecla</span>';
    return;
  }
  zone.innerHTML = keys
    .map(k => `<span class="key-chip">${formatKey(k)}</span>`)
    .join('<span style="color:var(--muted);font-size:14px;padding:0 2px;">+</span>');
}

function clearCapture() {
  stopCapture();
  capturedKeys = [];
  renderCaptureKeys([]);
}

// ═══════════════════════════════════════════════════════════════════
// 6. INTEGRAÇÃO E SINCRONIZAÇÃO DE PAYLOADS
// ═══════════════════════════════════════════════════════════════════

function actionToArr(action) {
  if (!action || action.type === 'none') return null;
  try { return JSON.parse(action.value); } catch { return null; }
}

function buildJSON() {
  const pct              = parseInt(document.getElementById('hapticIntensityPct').value);
  const duracaoCalculada = (pct / 100) * 0.250;

  const out = {
    device_type:        currentDeviceType !== "Desconectado" ? currentDeviceType : "Wave",
    layout:             document.getElementById('layoutVertical')?.checked ? "vertical" : "horizontal",
    vib_enabled:        document.getElementById('hapticEnabled').checked,
    hapticShort:        document.getElementById('hapticShort').checked,
    hapticLong:         document.getElementById('hapticLong').checked,
    hapticIntensityPct: pct,
    vib_duration:       duracaoCalculada,
    long_press_ms:      parseFloat(document.getElementById('longPressTime').value) * 1000,
    short_press_ms:     parseInt(document.getElementById('debounceTime').value),
    perfis:             [[]]
  };

  for (let i = 0; i < N; i++) {
    const b = cfg[i];
    let tipoStr = 'teclado';
    if (b.curto.type === 'app' || b.longo.type === 'app') tipoStr = 'app';
    else if (b.curto.type === 'media' || b.longo.type === 'media') tipoStr = 'midia';

    out.perfis[0].push({ 
      tipo: tipoStr, 
      curto: actionToArr(b.curto), 
      longo: actionToArr(b.longo) 
    });
  }
  return JSON.stringify(out, null, 2);
}

window.refreshPreview = function() {
  const box = document.getElementById('jsonBox');
  if (box) box.textContent = buildJSON();
};

window.syncToDevice = async function() {
  const jsonStr = buildJSON();
  showToast("Sincronizando...", "");
  const result = await api.syncDeck(jsonStr);
  if (result) {
    showToast("Deck Atualizada com Sucesso!", "success");
    window.refreshPreview();
  } else {
    showToast("Falha ao comunicar com a Deck", "error");
  }
};

window.resetAll = async function() {
  try {
    const response = await fetch('./assets/config.default.json');
    const data     = await response.json();
    if (data.perfis?.[0]) {
      const perfil = data.perfis[0];
      for (let i = 0; i < N; i++) {
        if (perfil[i]) {
          cfg[i].curto = parseAction(perfil[i].curto, perfil[i].tipo);
          cfg[i].longo = parseAction(perfil[i].longo, perfil[i].tipo);
        }
      }
    }
    const pct = Math.round((data.vib_duration / 0.250) * 100);
    document.getElementById('hapticIntensityPct').value = pct;
    document.getElementById('hapticIntVal').textContent = pct + '%';
    document.getElementById('longPressTime').value      = (data.long_press_ms / 1000).toFixed(1);
    document.getElementById('longPressVal').textContent = (data.long_press_ms / 1000).toFixed(1) + 's';
    document.getElementById('debounceTime').value       = data.short_press_ms;
    document.getElementById('debounceVal').textContent  = data.short_press_ms + 'ms';
    loadForm();
    render();
    window.refreshPreview();
    showToast("Configuração padrão restaurada!", "success");
  } catch (e) {
    showToast("Erro ao carregar configuração padrão", "error");
  }
};

window.clearAllActions = function() {
  for (let i = 0; i < N; i++) {
    cfg[i].curto = { type: 'none' };
    cfg[i].longo = { type: 'none' };
  }
  loadForm();
  render();
  window.refreshPreview();
  showToast("Todas as ações foram limpas!", "success");
};

window.limparBotao = function(i) {
  cfg[i].curto = { type: 'none' };
  cfg[i].longo = { type: 'none' };
  
  // Atualiza o formulário da direita caso o usuário esteja editando este botão exato
  if (selBtn === i) loadForm(); 
  
  render();
  window.refreshPreview();
  showToast(`Ações do Botão ${i + 1} limpas!`, "success");
};

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  document.getElementById('toastMsg').textContent = msg;
  t.className = ['toast', 'show', type].filter(Boolean).join(' ');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => { t.className = 'toast'; }, 2500);
}
window.showToast = showToast;

// ═══════════════════════════════════════════════════════════════════
// 7. ARQUITETURA DE MÓDULOS (I, III, IV, V) INTEGRADOS
// ═══════════════════════════════════════════════════════════════════

// MÓDULO I: CONTRUTOR DE PERFIS LOCAIS
let perfilAtivo = "padrao";

function carregarListaDePerfis() {
  const container = document.getElementById('listaPerfis');
  if (!container) return;

  const perfisSalvos = JSON.parse(localStorage.getItem('setupDeckPerfis') || '{}');
  container.innerHTML = '';

  const criarItem = (nome, isPadrao) => {
    const div = document.createElement('div');
    div.className = `profile-item ${perfilAtivo === nome ? 'active' : ''}`;
    
    div.onclick = (e) => {
      if(e.target.tagName !== 'BUTTON') window.aplicarPerfil(nome);
    };

    const span = document.createElement('span');
    span.textContent = isPadrao ? "Perfil Padrão" : nome;
    div.appendChild(span);

    if (!isPadrao) {
      const btnX = document.createElement('button');
      btnX.className = 'btn-delete-profile';
      btnX.innerHTML = '✕';
      btnX.title = 'Excluir perfil';
      btnX.onclick = (e) => {
        e.stopPropagation();
        window.excluirPerfil(nome);
      };
      div.appendChild(btnX);
    }
    container.appendChild(div);
  };

  criarItem("padrao", true);
  for (const nomePerfil in perfisSalvos) {
    criarItem(nomePerfil, false);
  }
}

window.criarNovoPerfil = function() {
  mostrarModal({
    title: "Criar Novo Perfil",
    message: "Digite um nome customizado para o novo perfil de atalhos:",
    showInput: true,
    inputPlaceholder: "Ex: Photoshop, Premiere...",
    onConfirm: (nome) => {
      if (!nome || nome.trim() === "") return;
      if (nome.toLowerCase() === "padrao") {
        showToast("O nome 'Padrão' é reservado do sistema!", "error");
        return;
      }
      const perfisSalvos = JSON.parse(localStorage.getItem('setupDeckPerfis') || '{}');
      perfisSalvos[nome] = JSON.parse(JSON.stringify(cfg));
      localStorage.setItem('setupDeckPerfis', JSON.stringify(perfisSalvos));
      
      perfilAtivo = nome;
      carregarListaDePerfis();
      showToast(`Perfil '${nome}' criado com sucesso!`, "success");
    }
  });
};

window.aplicarPerfil = function(nome) {
  perfilAtivo = nome;
  if (nome === "padrao") {
    window.resetAll();
    carregarListaDePerfis(); 
    showToast("Configuração padrão carregada!", "success");
    return;
  }

  const perfisSalvos = JSON.parse(localStorage.getItem('setupDeckPerfis') || '{}');
  const perfil = perfisSalvos[nome];

  if (perfil) {
    for (let i = 0; i < N; i++) {
      if (perfil[i]) {
        cfg[i].curto = perfil[i].curto;
        cfg[i].longo = perfil[i].longo;
      }
    }
    render();
    loadForm();
    if (typeof window.refreshPreview === "function") window.refreshPreview();
    carregarListaDePerfis();
    showToast(`Perfil '${nome}' carregado!`, "success");
  }
};

window.excluirPerfil = function(nome) {
  mostrarModal({
    title: "Remover Perfil",
    message: `Tem certeza que deseja excluir permanentemente o perfil '${nome}'?`,
    showInput: false,
    onConfirm: () => {
      const perfisSalvos = JSON.parse(localStorage.getItem('setupDeckPerfis') || '{}');
      delete perfisSalvos[nome];
      localStorage.setItem('setupDeckPerfis', JSON.stringify(perfisSalvos));
      
      if (perfilAtivo === nome) {
        perfilAtivo = "padrao";
        window.resetAll();
        render();
        loadForm();
        if (typeof window.refreshPreview === "function") window.refreshPreview();
      }
      carregarListaDePerfis();
      showToast("Perfil excluído.", "success");
    }
  });
};

// MÓDULO III: CONVERSAÇÃO HARDWARE
window.forcarReconexao = async function() {
  showToast("Reiniciando comunicação USB...", "");
  setDeviceStatus(false);
  await api.reiniciarConexao();
};

window.atualizarPlaca = async function() {
  showToast("Verificando atualizações da placa...", "");
  if(window.go?.main?.App?.AtualizarFirmwareDaNuvem) {
    const resposta = await window.go.main.App.AtualizarFirmwareDaNuvem();
    if (resposta.startsWith("ERRO")) showToast(resposta, "error");
    else if (resposta.startsWith("INFO")) showToast(resposta.replace("INFO: ", ""), "success");
    else showToast(resposta.replace("SUCESSO: ", ""), "success");
  }
};

// MÓDULO IV: METADADOS DO SISTEMA (SOBRE)
window.carregarInfoSobre = async function() {
  if(window.go?.main?.App?.ObterInfoSistema) {
    const info = await window.go.main.App.ObterInfoSistema();
    document.getElementById('lblVersaoApp').innerText      = info.appVersion;
    document.getElementById('lblVersaoSobre').innerText    = info.appVersion;
    document.getElementById('lblVersaoTitlebar').innerText = info.appVersion;
    document.getElementById('lblNomeDeckSobre').innerText  = info.deckName;
    document.getElementById('lblVersaoDeck').innerText     = info.deckVersion;
  }
};

// MÓDULO V: AUTO-INSTALAÇÃO E FILTRAGEM PORTÁTIL
// Verifica se mostra o botão na barra lateral
window.checarModoInstalacao = async function() {
  if (window.go?.main?.App?.VerificarModoPortatil) {
    const isPortatil = await window.go.main.App.VerificarModoPortatil();
    document.getElementById('navInstalar').style.display = isPortatil ? 'flex' : 'none';
  }
};

// Abre a Janela Customizada do Instalador
window.abrirAssistenteInstalacao = async function() {
  const modal = document.getElementById('modalInstalador');
  const inputCaminho = document.getElementById('inputLocalInstalacao');
  
  // Pede ao Go uma sugestão de caminho oficial
  if(window.go?.main?.App?.ObterCaminhoPadraoInstalacao) {
    inputCaminho.value = await window.go.main.App.ObterCaminhoPadraoInstalacao();
  }
  
  modal.style.display = 'flex';
};

window.fecharAssistente = function() {
  document.getElementById('modalInstalador').style.display = 'none';
};

// Coleta as escolhas e manda pro Go
window.executarInstalacao = async function() {
  const caminho = document.getElementById('inputLocalInstalacao').value;
  const criarDesktop = document.getElementById('checkAtalhoDesktop').checked;
  const autoStart = document.getElementById('checkAutoStartInstall').checked;

  if (!caminho || caminho.trim() === "") return showToast("Por favor, defina um caminho válido.", "error");

  window.fecharAssistente();
  showToast("Copiando arquivos e criando atalhos...", "info");

  if(window.go?.main?.App?.InstalarCompleto) {
    const resposta = await window.go.main.App.InstalarCompleto(caminho, criarDesktop, autoStart);
    if (resposta.startsWith("ERRO")) {
      showToast(resposta, "error");
    }
    // Se for SUCESSO, o Go mata o app antes de chegar aqui e reabre instalado!
  }
};

window.checarAtualizacaoApp = async function() {
  if (window.go?.main?.App?.VerificarAtualizacaoApp) {
    const resposta = await window.go.main.App.VerificarAtualizacaoApp();
    
    console.log("Resposta do Go:", resposta);

    if (resposta.temAtualizacao) {
      mostrarModal({
        title: "Atualização de Software",
        message: `Uma nova versão (${resposta.versao}) está disponível! Deseja atualizar agora?`,
        showInput: false,
        onConfirm: async () => {
          showToast("Baixando atualização...", "info");
          const resultado = await window.go.main.App.ExecutarAtualizacaoApp(resposta.link);
          // ... resto do seu código
        }
      });
    }
  }
};

// ═══════════════════════════════════════════════════════════════════
// 8. ORQUESTRAÇÃO DE DOM (DOM READY)
// ═══════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('kbCategory').innerHTML =
    KB_CATEGORIES.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
  onCategoryKbChange();
  document.getElementById('mediaSelect').innerHTML =
    MEDIA_OPTIONS.map(o => `<option value='${o.value}'>${o.label}</option>`).join('');

  document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', () => showPage(item.dataset.page, item));
  });

  setDeviceStatus(false);

  if (window.runtime) {
    window.runtime.EventsOn("deckStatus", (isConnected, deviceType) => setDeviceStatus(isConnected, deviceType));
    window.runtime.EventsOn("keyCapturada", (key) => {
      if (!isCapturing) return;
      _pressedKeys.add(key);
      capturedKeys = [
        ...MODIFIERS.filter(m => _pressedKeys.has(m)),
        ...[..._pressedKeys].filter(k => !MODIFIERS.includes(k))
      ];
      renderCaptureKeys(capturedKeys);
    });
    window.runtime.EventsOn("statsUpdated", () => {
      if (document.getElementById('page-stats').classList.contains('active')) fetchStats();
    });
  }

  if (window.go?.main?.App) {
    api.checkAutoStart().then(isAuto => {
      const toggleUi = document.getElementById('autoStartOS');
      if (toggleUi) toggleUi.checked = isAuto;
    });
    
    window.go.main.App.LerTema().then(savedTheme => {
      window.setTheme(savedTheme, null);
    });
  }

  setTimeout(() => {
    checarModoInstalacao();
    checarAtualizacaoApp();
  }, 3000);

  carregarListaDePerfis();
  carregarInfoSobre();
  render();
  loadForm();
});
