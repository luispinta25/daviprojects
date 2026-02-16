// Variables de estado
let projects = [];
let currentProject = null;
let tasks = [];
let currentUserId = null; // Guardar ID del usuario actual
let currentReplyId = null; // ID del comentario al que se está respondiendo
let draggedTaskId = null;
let lastActiveView = 'kanban'; 
let currentHistoryFolder = null; 
let globalAllTasks = []; // Caché global para sincronización silenciosa
let taskElementsChannel = null; // Canal Realtime para elementos de tarea

// Mapa de colores persistente para usuarios
const userColorMap = new Map();
const AVATAR_COLORS = [
    '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#6366f1'
];

function getUserColor(userId) {
    if (!userColorMap.has(userId)) {
        const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
        userColorMap.set(userId, color);
    }
    return userColorMap.get(userId);
}

function getUserInitials(name) {
    if (!name) return '?';
    const words = name.trim().split(/\s+/);
    if (words.length >= 2) {
        return (words[0][0] + words[1][0]).toUpperCase();
    }
    return words[0].substring(0, 2).toUpperCase();
}

const STATUS_NAMES = {
    'TODO': 'Por Hacer',
    'DOING': 'En Progreso',
    'DONE': 'Finalizado',
    'REVIEW': 'En Revisión',
    'REJECTED': 'Rechazado'
};

// --- AUTO-SCROLL HORIZONTAL ---
let autoScrollInterval = null;


// --- IDEAS LOGIC ---
let ideas = [];
let currentIdeaAudioBlob = null;
let ideaRecorder = null;
let ideaAudioChunks = [];
let ideaTimerInterval = null;

async function showIdeasView() {
    try {
        currentProject = null;
        document.getElementById('current-project-name').textContent = "Banco de Ideas";
        
        // UI Navigation
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const ideasView = document.getElementById('ideas-view');
        if (ideasView) ideasView.classList.remove('hidden');
        
        document.getElementById('view-controls')?.classList.add('hidden');
        document.getElementById('sidebar')?.classList.add('closed');
        document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
        document.getElementById('nav-ideas')?.classList.add('active');

        // FAB: Mostrar en ideas también
        const fab = document.getElementById('btn-fab-project');
        if (fab) fab.classList.remove('hidden');

        renderIdeas();
        syncDataSilently();
    } catch (err) {
        console.error("Error en showIdeasView:", err);
    }
}

async function loadIdeas() {
    try {
        ideas = await Storage.getIdeas();
        renderIdeas();
    } catch (error) {
        console.error("Error loading ideas:", error);
    }
}

function renderIdeas() {
    const favGrid = document.getElementById('ideas-fav-grid');
    const mainGrid = document.getElementById('ideas-main-grid');
    const convGrid = document.getElementById('ideas-converted-grid');
    const labelOther = document.getElementById('label-other-ideas');
    const labelConv = document.getElementById('label-converted-ideas');

    if (!favGrid || !mainGrid) return;

    favGrid.innerHTML = '';
    mainGrid.innerHTML = '';
    convGrid.innerHTML = '';

    const favs = ideas.filter(i => i.es_favorito && !i.proyecto_id);
    const regular = ideas.filter(i => !i.es_favorito && !i.proyecto_id);
    const converted = ideas.filter(i => i.proyecto_id);

    if (labelOther) labelOther.style.display = (favs.length > 0 && regular.length > 0) ? 'block' : 'none';
    if (labelConv) labelConv.style.display = (converted.length > 0) ? 'block' : 'none';

    favs.forEach(idea => favGrid.appendChild(createIdeaCard(idea)));
    regular.forEach(idea => mainGrid.appendChild(createIdeaCard(idea)));
    converted.forEach(idea => convGrid.appendChild(createIdeaCard(idea)));
}

function createIdeaCard(idea) {
    const card = document.createElement('div');
    card.className = `idea-card ${idea.proyecto_id ? 'converted' : ''}`;
    card.style.background = idea.color || '#fff9c4';

    let contentHtml = '';
    if (idea.audio_url) {
        contentHtml = `
            <div class="idea-audio-box" onclick="event.stopPropagation();">
                <button class="idea-audio-play-btn" onclick="playIdeaAudio(this, '${idea.audio_url}')" title="Escuchar">
                    <i class="fas fa-play"></i>
                </button>
                <div class="idea-audio-wave"><div class="idea-audio-progress"></div></div>
            </div>
            ${idea.contenido ? `<div class="idea-body">${idea.contenido}</div>` : ''}
        `;
    } else {
        contentHtml = `<div class="idea-body">${idea.contenido || 'Sin contenido'}</div>`;
    }

    card.innerHTML = `
        ${idea.proyecto_id ? '<div class="converted-badge">PROYECTO</div>' : ''}
        <div class="idea-card-header">
            <h4>${idea.titulo || 'Sin Título'}</h4>
            <button class="idea-fav-btn ${idea.es_favorito ? 'active' : ''}" onclick="event.stopPropagation(); toggleIdeaFav('${idea.id}')">
                <i class="${idea.es_favorito ? 'fas' : 'far'} fa-star"></i>
            </button>
        </div>
        ${contentHtml}
        <div class="idea-footer">
            <div class="idea-actions">
                ${!idea.proyecto_id ? `
                    <button class="btn-idea-action delete" onclick="event.stopPropagation(); deleteIdea('${idea.id}')" title="Eliminar Pensamiento">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                ` : `
                    <button class="btn-idea-action" style="opacity:0.3; cursor:not-allowed;" title="No se puede eliminar porque ya es un proyecto">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                `}
            </div>
            ${!idea.proyecto_id && (typeof AuthService !== 'undefined' && AuthService.isAdmin()) ? `
                <button class="btn-convert-idea" onclick="event.stopPropagation(); prepareConversion('${idea.id}')">
                    <i class="fas fa-rocket"></i> Crear Proyecto
                </button>
            ` : ''}
        </div>
    `;
    return card;
}

function playIdeaAudio(btn, url) {
    const card = btn.closest('.idea-card');
    const progressBar = card.querySelector('.idea-audio-progress');
    const icon = btn.querySelector('i');

    if (window.activeAudio && window.activeAudio.src === url) {
        if (window.activeAudio.paused) {
            window.activeAudio.play();
            icon.className = 'fas fa-pause';
        } else {
            window.activeAudio.pause();
            icon.className = 'fas fa-play';
        }
    } else {
        if (window.activeAudio) window.activeAudio.pause();
        document.querySelectorAll('.idea-audio-play-btn i').forEach(i => i.className = 'fas fa-play');

        window.activeAudio = new Audio(url);
        window.activeAudio.play();
        icon.className = 'fas fa-pause';

        window.activeAudio.ontimeupdate = () => {
            const prog = (window.activeAudio.currentTime / window.activeAudio.duration) * 100;
            if (progressBar) progressBar.style.width = `${prog}%`;
        };

        window.activeAudio.onended = () => {
            icon.className = 'fas fa-play';
            if (progressBar) progressBar.style.width = '0%';
        };
    }
}

function openIdeaModal() {
    const modal = document.getElementById('modal-idea');
    if (modal) {
        modal.classList.remove('hidden');
        resetIdeaForm();
    }
}

function resetIdeaForm() {
    document.getElementById('idea-title').value = '';
    document.getElementById('idea-content').value = '';
    currentIdeaAudioBlob = null;
    document.getElementById('idea-audio-preview')?.classList.add('hidden');
    toggleIdeaMode('text');

    // Reset a Paso 1
    document.getElementById('idea-step-1')?.classList.remove('hidden');
    document.getElementById('idea-step-2')?.classList.add('hidden');
    const title = document.getElementById('idea-modal-title');
    const desc = document.getElementById('idea-modal-desc');
    if (title) title.textContent = "Anota tu Idea";
    if (desc) desc.textContent = "Captúrala rápido antes de que se escape.";
}

function toggleIdeaMode(mode) {
    const btnText = document.getElementById('btn-mode-text');
    const btnVoice = document.getElementById('btn-mode-voice');
    const boxText = document.getElementById('idea-text-box');
    const boxVoice = document.getElementById('idea-voice-box');

    if (mode === 'text') {
        if(btnText) btnText.classList.add('active');
        if(btnVoice) btnVoice.classList.remove('active');
        if(boxText) boxText.classList.remove('hidden');
        if(boxVoice) boxVoice.classList.add('hidden');
    } else {
        if(btnText) btnText.classList.remove('active');
        if(btnVoice) btnVoice.classList.add('active');
        if(boxText) boxText.classList.add('hidden');
        if(boxVoice) boxVoice.classList.remove('hidden');
    }
}

function initIdeasListeners() {
    const b1 = document.getElementById('btn-mode-text');
    const b2 = document.getElementById('btn-mode-voice');
    if (b1) b1.onclick = () => toggleIdeaMode('text');
    if (b2) b2.onclick = () => toggleIdeaMode('voice');

    // Navegación de pasos
    document.getElementById('btn-idea-next')?.addEventListener('click', () => {
        const contenido = document.getElementById('idea-content').value.trim();
        if (!contenido && !currentIdeaAudioBlob) {
            return showCustomAlert("¿Qué tienes en mente?", "Cuéntanos un poco sobre tu idea primero.", "warning");
        }
        document.getElementById('idea-step-1')?.classList.add('hidden');
        document.getElementById('idea-step-2')?.classList.remove('hidden');
        const title = document.getElementById('idea-modal-title');
        const desc = document.getElementById('idea-modal-desc');
        if (title) title.textContent = "Casi listo...";
        if (desc) desc.textContent = "Dale un nombre a este pensamiento.";
        document.getElementById('idea-title')?.focus();
    });

    document.getElementById('btn-idea-back')?.addEventListener('click', () => {
        document.getElementById('idea-step-1')?.classList.remove('hidden');
        document.getElementById('idea-step-2')?.classList.add('hidden');
        const title = document.getElementById('idea-modal-title');
        const desc = document.getElementById('idea-modal-desc');
        if (title) title.textContent = "Anota tu Idea";
        if (desc) desc.textContent = "Captúrala rápido antes de que se escape.";
    });

    // Dashboard shortcut
    const btnDash = document.getElementById('btn-dashboard-new-idea');
    if (btnDash) btnDash.onclick = () => openIdeaModal();

    const btnRec = document.getElementById('btn-idea-rec');
    const btnStop = document.getElementById('btn-idea-stop');

    if (btnRec) btnRec.onclick = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            ideaRecorder = new MediaRecorder(stream);
            ideaAudioChunks = [];
            ideaRecorder.ondataavailable = e => ideaAudioChunks.push(e.data);
            ideaRecorder.onstop = () => {
                currentIdeaAudioBlob = new Blob(ideaAudioChunks, { type: 'audio/webm' });
                const url = URL.createObjectURL(currentIdeaAudioBlob);
                const audioPlay = document.getElementById('audio-idea-play');
                if (audioPlay) audioPlay.src = url;
                document.getElementById('idea-audio-preview')?.classList.remove('hidden');
            };
            ideaRecorder.start();
            btnRec.classList.add('hidden');
            btnStop.classList.remove('hidden');
            let secs = 0;
            const timerEl = document.getElementById('idea-rec-timer');
            if (timerEl) {
                timerEl.style.color = '#ef4444';
                ideaTimerInterval = setInterval(() => {
                    secs++;
                    const m = Math.floor(secs / 60).toString().padStart(2, '0');
                    const s = (secs % 60).toString().padStart(2, '0');
                    timerEl.textContent = `${m}:${s}`;
                }, 1000);
            }
        } catch (err) { showCustomAlert("Error de Acceso", "No se pudo acceder al micrófono. Verifica los permisos.", "error"); }
    };

    if (btnStop) btnStop.onclick = () => {
        if (ideaRecorder) {
            ideaRecorder.stop();
            ideaRecorder.stream.getTracks().forEach(t => t.stop());
        }
        btnRec.classList.remove('hidden');
        btnStop.classList.add('hidden');
        if (ideaTimerInterval) clearInterval(ideaTimerInterval);
        const timerEl = document.getElementById('idea-rec-timer');
        if (timerEl) timerEl.style.color = '#64748b';
    };

    const btnSave = document.getElementById('save-idea');
    if (btnSave) btnSave.onclick = async () => {
        const titulo = document.getElementById('idea-title').value;
        const contenido = document.getElementById('idea-content').value;
        if (!titulo) return showCustomAlert("Título Requerido", "Por favor, ponle un título a tu idea.", "warning");
        
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';

        try {
            let audio_url = null;
            if (currentIdeaAudioBlob) {
                const fileName = `idea_${Date.now()}.webm`;
                // Usamos Storage.uploadFile para ser consistentes con el bucket correcto (luispintapersonal)
                try {
                    audio_url = await Storage.uploadFile(currentIdeaAudioBlob, `ideas/${fileName}`);
                } catch (uploadError) {
                    console.error("Error subiendo audio:", uploadError);
                    throw new Error("No se pudo subir el audio. Verifica el bucket de almacenamiento.");
                }
            }

            await Storage.addIdea({ 
                titulo, 
                contenido: contenido || "", 
                audio_url 
            });

            // Registrar historial
            await Storage.addHistory({
                accion: 'CREAR_IDEA',
                detalle: `creó una nueva idea en el banco: *"${titulo}"*`,
                proyecto_id: null
            });

            // Limpiar y cerrar
            resetIdeaForm();
            closeModals();
            loadIdeas();
            
            if (typeof showCustomAlert === 'function') {
                showCustomAlert("¡Chispazo Guardado!", "Tu idea se ha guardado correctamente en el banco.", "success");
            }
        } catch (e) { 
            console.error("Error completo:", e);
            showCustomAlert("Error de Conexión", "No se pudo guardar el chispazo. Revisa tu conexión.", "error"); 
        } finally { 
            btnSave.disabled = false; 
            btnSave.innerHTML = '<i class="fas fa-save"></i> Guardar Chispazo'; 
        }
    };
}

async function toggleIdeaFav(id) {
    const idea = ideas.find(i => i.id === id);
    if (!idea) return;
    try {
        const newStatus = !idea.es_favorito;
        await Storage.updateIdea(id, { es_favorito: newStatus });
        idea.es_favorito = newStatus;
        renderIdeas();
    } catch (e) { console.error(e); }
}

async function deleteIdea(id) {
    const idea = ideas.find(i => i.id === id);
    if (idea && idea.proyecto_id) {
        return showCustomAlert("Acción Denegada", "Este chispazo ya es un proyecto real. No puedes eliminarlo para mantener el historial del proyecto.", "warning");
    }

    if (await showCustomConfirm("Eliminar Chispazo", "¿Estás seguro de eliminar este chispazo de forma permanente?", "danger")) {
        try {
            showLoading();
            const ideaToDelete = ideas.find(i => i.id === id);
            await Storage.deleteIdea(id);
            
            if (ideaToDelete) {
                await Storage.addHistory({
                    accion: 'ELIMINAR_IDEA',
                    detalle: `eliminó la idea *"${ideaToDelete.titulo}"* del banco`,
                    proyecto_id: null
                });
            }

            ideas = ideas.filter(i => i.id !== id);
            renderIdeas();
            hideLoading();
            showCustomAlert("Eliminado", "La idea ha sido borrada.", "success");
        } catch (e) { 
            hideLoading();
            console.error(e);
            showCustomAlert("Error", "No se pudo eliminar la idea.", "error");
        }
    }
}

async function prepareConversion(ideaId) {
    const idea = ideas.find(i => i.id === ideaId);
    if (!idea) return;
    document.getElementById('new-project-name').value = idea.titulo;
    document.getElementById('new-project-desc').value = (idea.contenido || '') + (idea.audio_url ? `\n[Audio: ${idea.audio_url}]` : '');
    window.convertingIdeaId = ideaId;
    document.getElementById('modal-project').classList.remove('hidden');
}

// Iniciar listeners
initIdeasListeners();


const boardContainer = document.querySelector('.board');

document.addEventListener('dragover', (e) => {
    if (!draggedTaskId || !boardContainer) return;

    const { clientX } = e;
    const { left, right, width } = boardContainer.getBoundingClientRect();
    const scrollTrigger = 80; // Distancia desde el borde para empezar a scrollear
    const scrollSpeed = 15;

    if (clientX < left + scrollTrigger) {
        // Scroll hacia la izquierda
        startAutoScroll(-scrollSpeed);
    } else if (clientX > right - scrollTrigger) {
        // Scroll hacia la derecha
        startAutoScroll(scrollSpeed);
    } else {
        stopAutoScroll();
    }
});

document.addEventListener('dragend', stopAutoScroll);
document.addEventListener('drop', stopAutoScroll);

function startAutoScroll(speed) {
    if (autoScrollInterval) stopAutoScroll();
    autoScrollInterval = setInterval(() => {
        boardContainer.scrollLeft += speed;
    }, 16);
}

function stopAutoScroll() {
    if (autoScrollInterval) {
        clearInterval(autoScrollInterval);
        autoScrollInterval = null;
    }
}

// --- PROMPT MOTIVO PERSONALIZADO ---
function promptMotivo(titulo) {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-motivo');
        const input = document.getElementById('custom-motivo-input');
        const btnConfirm = document.getElementById('confirm-motivo');
        const btnCancel = document.getElementById('cancel-motivo');
        const titleEl = document.getElementById('motivo-title');

        titleEl.textContent = titulo;
        input.value = '';
        modal.classList.remove('hidden');
        input.focus();

        const handleConfirm = async () => {
            const val = input.value.trim();
            if (!val) {
                await showCustomAlert("Información requerida", "Es obligatorio indicar un motivo.", "warning");
                return;
            }
            cleanup();
            resolve(val);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const cleanup = () => {
            modal.classList.add('hidden');
            btnConfirm.removeEventListener('click', handleConfirm);
            btnCancel.removeEventListener('click', handleCancel);
        };

        btnConfirm.addEventListener('click', handleConfirm);
        btnCancel.addEventListener('click', handleCancel);
    });
}


// Elementos del DOM
const projectList = document.getElementById('project-list');
const kanbanView = document.getElementById('kanban-view');
const historyView = document.getElementById('history-view');
const viewControls = document.getElementById('view-controls');
const btnViewKanban = document.getElementById('btn-view-kanban');
const btnViewHistory = document.getElementById('btn-view-history');
const historyList = document.getElementById('history-list');
const btnRefreshHistory = document.getElementById('btn-refresh-history');

// Extensiones de Tarea
const taskExtensionsArea = document.getElementById('task-extensions-area');
const taskChecklist = document.getElementById('task-checklist-container');
const taskNumberedList = document.getElementById('task-numbered-container');
const taskDiscussion = document.getElementById('task-discussion-area');
const checklistInput = document.getElementById('new-checklist-item');
const numberedInput = document.getElementById('new-numbered-item');
const commentInput = document.getElementById('new-comment-text');

// Variables para archivos adjuntos
let selectedFile = null;
const fileInput = document.getElementById('comment-file-input');
const triggerFileBtn = document.getElementById('btn-trigger-file');
const attachmentPreview = document.getElementById('comment-attachment-preview');
const previewFilename = document.getElementById('preview-filename');
const removeAttachmentBtn = document.getElementById('btn-remove-attachment');

let taskElements = []; // Checklist y Listas del elemento actual
function checkUser() {
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') window.location.href = 'auth/login.html';
    });
    showApp();
}

function applyRoleRestrictions() {
    const userRole = localStorage.getItem('user_role') || 'user';
    const adminElements = document.querySelectorAll('.admin-only');
    
    adminElements.forEach(el => {
        if (userRole === 'admin') {
            // Si es un modal, aseguramos que NO tenga style.display = 'none' 
            // pero que conserve 'hidden' si lo tiene para que no se abra solo
            if (el.classList.contains('modal')) {
                el.style.display = '';
                return;
            }

            // No quitamos 'hidden' si es un botón de miembros en el header que debe ocultarse
            if (el.id === 'btn-edit-members') {
                // El botón de miembros se maneja por updateMembersButtonVisibility
            } else {
                el.classList.remove('hidden');
                if (el.style.display === 'none') el.style.display = '';
            }
        } else {
            el.classList.add('hidden');
            el.style.setProperty('display', 'none', 'important');
        }
    });

    // Casos especiales: Deshabilitar clics si por alguna razón siguen ahí
    if (userRole !== 'admin') {
        const createBtns = ['btn-new-project', 'btn-fab-project'];
        createBtns.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.add('hidden');
                btn.style.display = 'none';
            }
        });
    }
}

async function showApp() {
    // Asegurar que el loader sea visible inicialmente (por si acaso)
    const splashLoader = document.getElementById('loading');
    if (splashLoader) {
        splashLoader.classList.remove('hidden');
        splashLoader.style.display = 'flex';
    }

    // Aplicar restricciones de rol inmediatamente
    applyRoleRestrictions();

    // Pedir permisos de notificación de una vez usando el Helper elegante
    if (window.NotificationHelper) {
        NotificationHelper.requestPermission(false);
    }

    // Actualizar nombre de usuario si existe el elemento
    const userDisplay = document.getElementById('user-display-name');
    const userAvatar = document.querySelector('.avatar');
    const welcomeMsg = document.getElementById('dashboard-welcome-msg');
    const session = await AuthService.getSession();
    
    if (session) {
        currentUserId = session.user.id;
        try {
            const profile = await AuthService.getUserProfile(session.user.id);
            if (userDisplay && profile) {
                userDisplay.textContent = profile.nombre || session.user.email.split('@')[0];
                if (userAvatar && profile.nombre) {
                    userAvatar.textContent = profile.nombre.substring(0, 2).toUpperCase();
                }
                if (welcomeMsg) {
                    welcomeMsg.textContent = `¡Hola de nuevo, ${profile.nombre.split(' ')[0]}!`;
                }

                // Aplicar restricciones de rol (incluye ocultar botones de creación si no es admin)
                applyRoleRestrictions();

                // Mostrar botón de miembros si es admin y hay proyecto activo
                updateMembersButtonVisibility(profile.rol);
            }
        } catch (e) {
            console.error("Error al obtener perfil:", e);
        }
    }
    
    // Configurar Sidebar Toggles
    const btnOpenSidebar = document.getElementById('btn-open-sidebar');
    if (btnOpenSidebar) {
        btnOpenSidebar.onclick = (e) => {
            e.preventDefault();
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.remove('closed');
        };
    }
    
    const btnCloseSidebar = document.getElementById('btn-close-sidebar');
    if (btnCloseSidebar) {
        btnCloseSidebar.onclick = (e) => {
            e.preventDefault();
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('closed');
        };
    }

    // Sidebar Navigation
    const navDashboard = document.getElementById('nav-dashboard');
    if (navDashboard) {
        navDashboard.onclick = (e) => {
            e.preventDefault();
            showGallery();
        };
    }
    
    const navIdeas = document.getElementById('nav-ideas');
    if (navIdeas) {
        navIdeas.onclick = (e) => {
            e.preventDefault();
            showIdeasView();
        };
    }
    
    const navMusic = document.getElementById('nav-music');
    if (navMusic) {
        navMusic.onclick = (e) => {
            e.preventDefault();
            showMusicView();
        };
    }
    
    const navProjects = document.getElementById('nav-projects');
    if (navProjects) {
        navProjects.onclick = (e) => {
            e.preventDefault();
            showFullProjectsView();
        };
    }

    // Configurar Notificaciones Push
    const btnNotif = document.getElementById('btn-notifications');
    if (btnNotif) {
        btnNotif.onclick = async () => {
            if (!("Notification" in window)) {
                return showCustomAlert("No soportado", "Este navegador no soporta notificaciones de escritorio.", "error");
            }
            if (Notification.permission === 'default') {
                const permission = await NotificationHelper.requestPermission(false);
                if (permission === 'granted') {
                    showCustomAlert("¡Éxito!", "Notificaciones habilitadas correctamente.", "success");
                }
            } else if (Notification.permission === 'granted') {
                showCustomAlert("Aviso", "Las notificaciones ya están habilitadas.", "info");
                new Notification("DaviProjects", { body: "Las notificaciones están activas ✅" });
            } else {
                showCustomAlert("Bloqueado", "Las notificaciones están bloqueadas en este navegador. Por favor hablítalas en la configuración del sitio.", "warning");
            }
        };
    }

    if (document.getElementById('nav-notes')) {
        document.getElementById('nav-notes').onclick = () => showCustomAlert("Próximamente", "La sección de Notas Rápidas estará disponible en la siguiente actualización.", "info");
    }

    initIdeasListeners();
    await initGlobalRealtime();

    const btnAll = document.getElementById('btn-view-all-projects');
    if (btnAll) btnAll.onclick = showFullProjectsView;

    // Home & Logout
    const btnHome = document.getElementById('btn-home');
    if (btnHome) btnHome.onclick = showGallery;
    
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.onclick = async () => {
            await AuthService.logout();
        };
    }

    // Cargar proyectos de Supabase
    projects = await Storage.getProjects();
    await refreshProjectViews();

    // Soporte para Deep Linking (Prioridad Tarea -> Proyecto)
    const urlParams = new URLSearchParams(window.location.search);
    const taskIdParam = urlParams.get('taskId');
    const projectIdParam = urlParams.get('projectId');
    const musicIdParam = urlParams.get('musicId');
    const targetTypeParam = urlParams.get('targetType');
    
    // 0. Si hay una música (Prioridad alta para el hub musical)
    if (musicIdParam) {
        await showMusicView();
        setTimeout(() => {
            playMusicDesktop(musicIdParam);
            hideLoading();
        }, 800);
        return;
    }

    // 1. Si hay una tarea, la buscamos para saber a qué proyecto pertenece
    if (taskIdParam) {
        try {
            const targetTask = await Storage.getTask(taskIdParam);
            if (targetTask) {
                const targetProject = projects.find(p => p.id === targetTask.proyecto_id);
                if (targetProject) {
                    await selectProject(targetProject);
                    setTimeout(() => {
                        openTaskModal(taskIdParam, targetTypeParam);
                        hideLoading(); 
                    }, 500);
                    return;
                } else {
                    // No tiene acceso al proyecto de esa tarea
                    showAccessDeniedModal("No tienes permiso para ver esta tarea o el proyecto asociado.");
                    hideLoading();
                }
            } else {
                showAccessDeniedModal("La tarea solicitada no existe o no está disponible.");
                hideLoading();
            }
        } catch (e) {
            console.error("Error al cargar tarea desde URL:", e);
            showAccessDeniedModal("No se pudo cargar la tarea. Puede que el enlace sea incorrecto o no tengas permisos.");
            hideLoading();
        }
        return; // Detener flujo si intentó cargar tarea
    }

    // 2. Si solo hay ID de proyecto
    if (projectIdParam) {
        const targetProject = projects.find(p => p.id === projectIdParam);
        if (targetProject) {
            await selectProject(targetProject);
            hideLoading();
            return;
        } else {
            // Proyecto no encontrado o no disponible para este usuario
            showAccessDeniedModal("Este proyecto no está disponible para ti o no existe. Contacta al administrador si crees que es un error.");
        }
    }

    // Ya no seleccionamos el primer proyecto por defecto, mostramos la galería (Dashboard)
    await showGallery();
    
    // El sidebar debe estar por defecto cerrado
    document.getElementById('sidebar')?.classList.add('closed');

    hideLoading();
}

function showAccessDeniedModal(message) {
    const modalId = 'access-denied-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        // Forzamos estilos de centrado total para evitar conflictos con el CSS global
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(7, 26, 64, 0.4);
            backdrop-filter: blur(10px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 99999;
            animation: fadeIn 0.3s ease;
        `;
        
        modal.innerHTML = `
            <div style="background: white; width: 90%; max-width: 500px; border-radius: 24px; padding: 3.5rem 2rem; text-align: center; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25); transform: translateY(0); animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
                <div style="background: #fee2e2; width: 90px; height: 90px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 2rem; box-shadow: 0 10px 15px -3px rgba(239, 68, 68, 0.2);">
                    <i class="fas fa-lock" style="font-size: 2.5rem; color: #ef4444;"></i>
                </div>
                <h2 style="font-size: 1.75rem; color: #1e293b; margin-bottom: 1rem; font-weight: 800;">Acceso No Disponible</h2>
                <p id="access-denied-msg" style="color: #64748b; line-height: 1.6; font-size: 1.1rem; margin-bottom: 3rem; max-width: 320px; margin-left: auto; margin-right: auto;"></p>
                <button class="btn-primary" style="width: 100%; height: 60px; font-size: 1.1rem; border-radius: 16px; font-weight: 600; background: #05A64B; border: none; color: white; cursor: pointer; transition: transform 0.2s;" 
                    onclick="document.getElementById('${modalId}').remove()"
                    onmouseover="this.style.transform='scale(1.02)'"
                    onmouseout="this.style.transform='scale(1)'">
                    Entendido, volver
                </button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    const msgEl = modal.querySelector('#access-denied-msg');
    if (msgEl) msgEl.textContent = message;
    modal.classList.remove('hidden');
}

async function updateDashboardMetrics() {
    const countProjectsEl = document.getElementById('count-projects');
    if (countProjectsEl) countProjectsEl.textContent = projects.length;
    
    let allCombinedTasks = [];
    for(const p of projects) {
        const t = await Storage.getTasks(p.id);
        allCombinedTasks = allCombinedTasks.concat(t);
    }
    
    // Solo se toman en cuenta por hacer (TODO), pendiente (DOING) y finalizado (DONE)
    const validTasks = allCombinedTasks.filter(t => ['TODO', 'DOING', 'DONE'].includes(t.estado || 'TODO'));

    const pending = validTasks.filter(t => {
        const s = t.estado || 'TODO';
        return s === 'TODO' || s === 'DOING';
    }).length;
    
    const done = validTasks.filter(t => t.estado === 'DONE').length;
    const review = allCombinedTasks.filter(t => t.estado === 'REVIEW').length;
    
    const countPendingEl = document.getElementById('count-tasks-pending');
    if (countPendingEl) countPendingEl.textContent = pending;
    
    const countDoneEl = document.getElementById('count-tasks-done');
    if (countDoneEl) countDoneEl.textContent = done;
    
    const countReviewEl = document.getElementById('count-tasks-review');
    if (countReviewEl) countReviewEl.textContent = review;
}

// --- SINCRONIZACIÓN SILENCIOSA (BG) ---
async function syncDataSilently() {
    try {
        const [proj, taskList, ideaList] = await Promise.all([
            Storage.getProjects(),
            Storage.getTasks(),
            Storage.getIdeas()
        ]);
        
        // Actualizar globales
        projects = proj;
        globalAllTasks = taskList;
        ideas = ideaList;
        
        // Refrescar vistas si están visibles
        const galleryView = document.getElementById('gallery-view');
        const projectsView = document.getElementById('projects-view');
        const ideasView = document.getElementById('ideas-view');
        
        if (galleryView && !galleryView.classList.contains('hidden')) {
            renderProjectGallery('project-gallery', 3, true);
        } else if (projectsView && !projectsView.classList.contains('hidden')) {
            renderProjectGallery('full-project-gallery', null, false);
        } else if (ideasView && !ideasView.classList.contains('hidden')) {
            renderIdeas();
        }

        renderProjectList();
        
    } catch (e) {
        console.error("Silent sync failed", e);
    }
}

// --- PROJECTS ---
async function showGallery() {
    try {
        currentProject = null;
        updateMembersButtonVisibility();
        document.getElementById('current-project-name').textContent = "Dashboard";
        
        // FAB: Ocultar en el Dashboard
        const fab = document.getElementById('btn-fab-project');
        if (fab) fab.classList.add('hidden');

        // Ocultar todas las vistas y mostrar el dashboard
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const galleryView = document.getElementById('gallery-view');
        if (galleryView) galleryView.classList.remove('hidden');
        
        const viewControls = document.getElementById('view-controls');
        if (viewControls) viewControls.classList.add('hidden');
        
        // Auto-contraer sidebar siempre al escoger un módulo
        document.getElementById('sidebar')?.classList.add('closed');

        // Navegación active
        document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
        document.getElementById('nav-dashboard')?.classList.add('active');

        renderProjectList();
        await renderProjectGallery('project-gallery', 3, true);

        // Sincronizar en segundo plano
        syncDataSilently();
    } catch (err) {
        console.error("Error en showGallery:", err);
    }
}

async function showFullProjectsView() {
    try {
        currentProject = null;
        document.getElementById('current-project-name').textContent = "Todos los Proyectos";
        
        // FAB: Mostrar para añadir proyectos
        const fab = document.getElementById('btn-fab-project');
        if (fab) fab.classList.remove('hidden');

        // Ocultar todas las vistas y mostrar la de proyectos
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const projectsView = document.getElementById('projects-view');
        if (projectsView) projectsView.classList.remove('hidden');

        const viewControls = document.getElementById('view-controls');
        if (viewControls) viewControls.classList.add('hidden');
        
        // Auto-contraer sidebar siempre al escoger un módulo
        document.getElementById('sidebar')?.classList.add('closed');

        // Navegación active
        document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
        document.getElementById('nav-projects')?.classList.add('active');

        renderProjectList();
        await renderProjectGallery('full-project-gallery', null, false);

        // Sincronizar en segundo plano
        syncDataSilently();
    } catch (err) {
        console.error("Error en showFullProjectsView:", err);
    }
}

async function refreshProjectViews() {
    renderProjectList();
    
    const galleryView = document.getElementById('gallery-view');
    if (galleryView && !galleryView.classList.contains('hidden')) {
        await renderProjectGallery('project-gallery', 3, true);
    }
    
    const projectsView = document.getElementById('projects-view');
    if (projectsView && !projectsView.classList.contains('hidden')) {
        await renderProjectGallery('full-project-gallery', null, false);
    }
    
    updateDashboardMetrics();
}

async function renderProjectGallery(containerId = 'project-gallery', limit = null, sortByDueDate = false) {
    const gallery = document.getElementById(containerId);
    if (!gallery) return;
    
    gallery.innerHTML = '';
    
    if (projects.length === 0) {
        const isAdmin = AuthService.isAdmin();
        gallery.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 3rem; margin-bottom: 1rem;"><i class="fas fa-rocket" style="color: var(--primary);"></i></div>
                <h3>${isAdmin ? 'No tienes proyectos aún' : 'Aún no se te ha asignado ningún proyecto'}</h3>
                <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
                    ${isAdmin ? 'Comienza organizando tu primer gran idea.' : 'Contacta con un administrador para que te asigne a uno.'}
                </p>
                ${isAdmin ? `
                    <button class="btn-start" onclick="document.getElementById('modal-project').classList.remove('hidden')">
                        Para empezar crea tu primer proyecto
                    </button>
                ` : ''}
            </div>
        `;
        return;
    }

    // Usar caché global si existe, si no, cargar (pero solo una vez)
    let allTasks = [];
    try {
        if (globalAllTasks.length > 0) {
            allTasks = globalAllTasks;
        } else {
            allTasks = await Storage.getTasks();
            globalAllTasks = allTasks;
        }
    } catch (e) {
        console.error("Error fetching tasks for gallery:", e);
    }

    let projectsToShow = [...projects];

    if (sortByDueDate) {
        // Ordenar por fecha de vencimiento (los que vencen antes primero)
        // Los que no tienen fecha van al final
        projectsToShow.sort((a, b) => {
            if (!a.fecha_vencimiento && !b.fecha_vencimiento) return 0;
            if (!a.fecha_vencimiento) return 1;
            if (!b.fecha_vencimiento) return -1;
            return new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento);
        });
    }

    if (limit) {
        projectsToShow = projectsToShow.slice(0, limit);
    }

    projectsToShow.forEach(project => {
        // Calcular progreso (Solo TODO, DOING, DONE)
        const projectTasks = allTasks.filter(t => t.proyecto_id === project.id && ['TODO', 'DOING', 'DONE'].includes(t.estado || 'TODO'));
        const totalTasks = projectTasks.length;
        const completedTasks = projectTasks.filter(t => t.estado === 'DONE' || t.completada).length;
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        const card = document.createElement('div');
        card.className = 'project-card';
        card.setAttribute('data-id', project.id);
        
        // Obtener miembros del proyecto (si existen en el objeto proyecto)
        const projectMemberships = project.daviprojects_proyecto_miembros || [];
        const memberAvatarsHtml = projectMemberships.length > 0 ? `
            <div class="project-card-members" style="display: flex; align-items: center; margin-left: 0.5rem; flex-direction: row-reverse;">
                ${projectMemberships.slice(0, 4).map(m => {
                    const name = m.daviplata_usuarios?.nombre || 'U';
                    const userId = m.usuario_id;
                    return `
                        <div class="card-mini-avatar" 
                             style="background: ${getUserColor(userId)}; width: 26px; height: 26px; border-radius: 50%; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 700; border: 2px solid white; margin-left: -8px;" 
                             title="${name}">
                            ${getUserInitials(name)}
                        </div>
                    `;
                }).join('')}
                ${projectMemberships.length > 4 ? `
                    <div style="width: 26px; height: 26px; border-radius: 50%; background: #f1f5f9; color: #64748b; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: 700; border: 2px solid white; margin-left: -8px;">
                        +${projectMemberships.length - 4}
                    </div>
                ` : ''}
            </div>
        ` : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem;">
                <h3 style="margin:0; font-size: 1.1rem; color: var(--primary);">${project.nombre || project.name}</h3>
                <div style="display: flex; align-items: center;">
                    <div class="project-badge ${progress === 100 ? 'status-done' : 'status-active'}">${progress === 100 ? 'Finalizado' : 'Activo'}</div>
                    ${memberAvatarsHtml}
                </div>
            </div>
            
            <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1.25rem; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 2.4rem;">
                ${project.descripcion || 'Sin descripción.'}
            </p>

            <div class="project-meta" style="margin-bottom: 1.25rem;">
                <div style="display:flex; align-items:center; gap:0.5rem; color:var(--text-muted); font-size:0.85rem; margin-bottom:0.5rem;">
                    <i class="fas fa-calendar-alt"></i>
                    <span>Creado: ${new Date(project.created_at).toLocaleDateString()}</span>
                </div>
                ${project.fecha_vencimiento ? `
                <div style="display:flex; align-items:center; gap:0.5rem; color:#ef4444; font-size:0.85rem; font-weight:600;">
                    <i class="fas fa-hourglass-half"></i>
                    <span>Vence: ${new Date(project.fecha_vencimiento).toLocaleDateString()}</span>
                </div>
                ` : ''}
            </div>

            <div class="project-progress-container" style="margin-bottom: 1.1rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.75rem; font-weight: 700; color: #64748b;">PROGRESO</span>
                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary);">${progress}%</span>
                </div>
                <div style="width: 100%; height: 6px; background: #f1f5f9; border-radius: 10px; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background: var(--primary); border-radius: 10px; transition: width 0.5s ease-out;"></div>
                </div>
            </div>

            <div style="margin-top: auto; display:flex; justify-content:space-between; align-items:center;">
                <span class="btn-view-details" style="font-size: 0.75rem; font-weight: 800; color: var(--primary); cursor: pointer; display: flex; align-items: center; gap: 0.4rem;">
                    VER DETALLES <i class="fas fa-chevron-right" style="font-size: 0.6rem;"></i>
                </span>
                <span style="font-size: 0.7rem; color: var(--text-muted); font-weight: 600;">
                    ${completedTasks}/${totalTasks} Tareas
                </span>
            </div>
        `;
        card.onclick = () => showProjectDetails(project, allTasks);
        gallery.appendChild(card);
    });
}

async function showProjectDetails(project, allTasks = []) {
    currentProject = project;
    const modal = document.getElementById('modal-project-details');
    if (!modal) return;

    // Poblar datos
    const descEl = document.getElementById('details-project-desc');
    const audioContainer = document.getElementById('details-project-audio-container');
    
    let description = project.descripcion || 'Sin descripción.';
    let audioUrl = null;

    // Detectar si hay patrón de audio en la descripción: [Audio: URL]
    const audioMatch = description.match(/\[Audio:\s*(https?:\/\/[^\]\s]+)\]/);
    if (audioMatch) {
        audioUrl = audioMatch[1];
        // Limpiar la descripción del tag de audio para mostrar solo el texto
        description = description.replace(audioMatch[0], '').trim();
    }

    descEl.textContent = description || 'Sin descripción adicional.';
    document.getElementById('details-project-name').textContent = project.nombre || project.name;
    document.getElementById('details-project-start').textContent = new Date(project.created_at).toLocaleDateString();
    
    // Manejo de Audio Player
    if (audioUrl) {
        audioContainer.classList.remove('hidden');
        setupProjectAudioPlayer(audioUrl);
    } else {
        audioContainer.classList.add('hidden');
        if (window.projectAudio) {
            window.projectAudio.pause();
            window.projectAudio = null;
        }
    }

    const dueEl = document.getElementById('details-project-due');
    const dueContainer = document.getElementById('details-project-due-container');
    if (project.fecha_vencimiento) {
        dueEl.textContent = new Date(project.fecha_vencimiento).toLocaleDateString();
        dueContainer.style.display = 'flex';
    } else {
        dueContainer.style.display = 'none';
    }

    // Calcular estadísticas
    const pTasks = allTasks.filter(t => t.proyecto_id === project.id && ['TODO', 'DOING', 'DONE', 'REVIEW', 'REJECTED'].includes(t.estado));
    const total = pTasks.length;
    const completed = pTasks.filter(t => t.estado === 'DONE' || t.completada).length;
    const inProgress = pTasks.filter(t => t.estado === 'DOING').length;
    const pending = pTasks.filter(t => t.estado === 'TODO').length;
    const review = pTasks.filter(t => t.estado === 'REVIEW').length;
    
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    document.getElementById('details-project-progress-text').textContent = `${progress}%`;
    document.getElementById('details-project-progress-bar').style.width = `${progress}%`;
    
    const statusBadge = document.getElementById('details-project-status');
    statusBadge.textContent = progress === 100 ? 'FINALIZADO' : 'ACTIVO';
    statusBadge.className = `project-badge ${progress === 100 ? 'status-done' : 'status-active'}`;

    // Renderizar miembros en el modal
    const membersContainer = document.getElementById('details-project-members');
    if (membersContainer) {
        const projectMemberships = project.daviprojects_proyecto_miembros || [];
        membersContainer.innerHTML = projectMemberships.map(m => {
            const userName = m.daviplata_usuarios?.nombre || 'Usuario';
            const initials = getUserInitials(userName);
            const color = getUserColor(m.usuario_id);
            return `
                <div class="card-mini-avatar" title="${userName}" style="background: ${color}; width: 32px; height: 32px; font-size: 0.8rem; border-width: 2.5px;">
                    ${initials}
                </div>
            `;
        }).join('');
    }

    const statsContainer = document.getElementById('details-project-stats');
    statsContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; font-size: 0.85rem;">
            <span style="color: #64748b;">Pendientes</span>
            <span style="font-weight:700;">${pending}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 0.85rem;">
            <span style="color: #3b82f6;">En Curso</span>
            <span style="font-weight:700;">${inProgress}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 0.85rem;">
            <span style="color: #f59e0b;">En Revisión</span>
            <span style="font-weight:700;">${review}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 0.85rem;">
            <span style="color: #10b981;">Completadas</span>
            <span style="font-weight:700;">${completed}</span>
        </div>
    `;

    // Listeners de botones internos
    modal.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            if (window.projectAudio) window.projectAudio.pause();
            closeModals();
        };
    });

    document.getElementById('btn-details-open-kanban').onclick = () => {
        if (window.projectAudio) window.projectAudio.pause();
        closeModals();
        selectProject(project);
    };

    document.getElementById('btn-details-delete').onclick = async () => {
        if (await showCustomConfirm('Eliminar Proyecto', `¿Estás seguro de eliminar el proyecto "${project.nombre}"? Esta acción no se puede deshacer y borrará todas sus tareas e historial.`, 'danger')) {
            try {
                showLoading();
                if (window.projectAudio) window.projectAudio.pause();
                
                // Animación de salida
                const card = document.querySelector(`.project-card[data-id="${project.id}"]`);
                if (card) {
                    card.classList.add('removing');
                    await new Promise(r => setTimeout(r, 400));
                }

                await Storage.deleteProject(project.id);
                projects = projects.filter(p => p.id !== project.id);
                closeModals();
                await refreshProjectViews();
                hideLoading();
                if (typeof showCustomAlert === 'function') showCustomAlert("Proyecto Eliminado", "El proyecto ha sido borrado con éxito.", "success");
            } catch (e) {
                hideLoading();
                console.error(e);
                showCustomAlert("Error", "No se pudo eliminar el proyecto.", "error");
            }
        }
    };

    modal.classList.remove('hidden');
}

function setupProjectAudioPlayer(url) {
    if (window.projectAudio) {
        window.projectAudio.pause();
    }

    const audio = new Audio(url);
    window.projectAudio = audio;

    const btnPlay = document.getElementById('btn-audio-details-play');
    const timeline = document.getElementById('audio-details-timeline');
    const volume = document.getElementById('audio-details-volume');
    const currentTimeEl = document.getElementById('audio-details-current');
    const durationTimeEl = document.getElementById('audio-details-duration');
    const volumeIcon = document.getElementById('icon-audio-details-volume');

    const formatTime = (time) => {
        const m = Math.floor(time / 60).toString().padStart(2, '0');
        const s = Math.floor(time % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    btnPlay.onclick = () => {
        if (audio.paused) {
            audio.play();
            btnPlay.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            audio.pause();
            btnPlay.innerHTML = '<i class="fas fa-play"></i>';
        }
    };

    audio.onloadedmetadata = () => {
        timeline.max = audio.duration;
        durationTimeEl.textContent = formatTime(audio.duration);
    };

    audio.ontimeupdate = () => {
        timeline.value = audio.currentTime;
        currentTimeEl.textContent = formatTime(audio.currentTime);
    };

    timeline.oninput = () => {
        audio.currentTime = timeline.value;
    };

    volume.oninput = () => {
        const vol = volume.value / 100;
        audio.volume = vol;
        if (vol === 0) volumeIcon.className = 'fas fa-volume-mute';
        else if (vol < 0.5) volumeIcon.className = 'fas fa-volume-down';
        else volumeIcon.className = 'fas fa-volume-up';
    };

    audio.onended = () => {
        btnPlay.innerHTML = '<i class="fas fa-play"></i>';
        timeline.value = 0;
        currentTimeEl.textContent = '00:00';
    };
}

function renderProjectList() {
    projectList.innerHTML = '';
    
    projects.forEach(project => {
        const li = document.createElement('li');
        // Usar clases consistentes con el CSS
        li.innerHTML = `
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <i class="fas fa-folder" style="color: ${project.color || '#94a3b8'};"></i>
                <span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;">
                    ${project.nombre || project.name || 'Sin nombre'}
                </span>
            </div>
            <i class="fas fa-chevron-right arrow"></i>
        `;
        
        if (currentProject && currentProject.id === project.id) {
            li.className = 'active';
        }

        li.onclick = (e) => {
            e.preventDefault();
            selectProject(project);
        };

        projectList.appendChild(li);
    });
}

async function selectProject(project) {
    currentProject = project;
    document.getElementById('current-project-name').textContent = project.nombre || project.name;
    
    // Nueva línea: Control de visibilidad del botón de miembros
    updateMembersButtonVisibility();

    // FAB: Ocultar al entrar a un proyecto
    const fab = document.getElementById('btn-fab-project');
    if (fab) fab.classList.add('hidden');

    // Ocultar todas las vistas y mostrar el contenedor de controles
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    viewControls.classList.remove('hidden');

    const loadingKanban = document.getElementById('pane-loading-kanban');
    const loadingHistory = document.getElementById('pane-loading-history');
    
    // Restaurar la última vista activa (Kanban o Historial)
    if (lastActiveView === 'history') {
        btnViewHistory.classList.add('active');
        btnViewKanban.classList.remove('active');
        kanbanView.classList.add('hidden');
        historyView.classList.remove('hidden');
        currentHistoryFolder = null; // Resetear carpeta al entrar
        if (loadingHistory) loadingHistory.classList.remove('hidden');
    } else {
        btnViewKanban.classList.add('active');
        btnViewHistory.classList.remove('active');
        kanbanView.classList.remove('hidden');
        historyView.classList.add('hidden');
        if (loadingKanban) loadingKanban.classList.remove('hidden');
    }
    
    // Auto-contraer sidebar solo si es pantalla pequeña
    if (window.innerWidth <= 1024) {
        document.getElementById('sidebar')?.classList.add('closed');
    }

    // Navegación active
    document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));

    renderProjectList();
    
    try {
        // Cargar tareas de Supabase
        tasks = await Storage.getTasks(project.id);
        renderKanban();
        if (!historyView.classList.contains('hidden')) renderHistory();
    } finally {
        // Un pequeño delay para que la transición no sea brusca
        setTimeout(() => {
            if (loadingKanban) loadingKanban.classList.add('hidden');
            if (loadingHistory) loadingHistory.classList.add('hidden');
        }, 300);
    }
}

function openProjectModal() {
    // Resetear formulario
    document.getElementById('new-project-name').value = '';
    document.getElementById('new-project-desc').value = '';
    document.getElementById('new-project-due').value = '';
    selectedUsersForNewProject = [];
    
    // Mostrar modal
    const modal = document.getElementById('modal-project');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex'; // Forzar display flex por si acaso
    }

    // Poblar lista de usuarios
    renderNewProjectMembers();
}

async function renderNewProjectMembers() {
    const list = document.getElementById('new-project-members-list');
    if (!list) return;
    list.innerHTML = '<p style="text-align: center; font-size: 0.8rem; color: #64748b; padding: 1rem;">Cargando usuarios...</p>';

    try {
        if (allUsersCache.length === 0) {
            allUsersCache = await Storage.getAllUsers();
        }

        list.innerHTML = '';
        // Solo usuarios (los admin no cuentan/no se asignan aquí)
        const users = allUsersCache.filter(u => u.rol === 'user');

        if (users.length === 0) {
            list.innerHTML = '<p style="text-align: center; font-size: 0.8rem; color: #64748b; padding: 1rem;">No hay usuarios disponibles</p>';
            return;
        }

        users.forEach(user => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '1rem';
            row.style.padding = '0.75rem';
            row.style.borderRadius = '0.75rem';
            row.style.background = 'white';
            row.style.border = '1px solid #e2e8f0';
            row.style.cursor = 'pointer';
            row.style.transition = 'all 0.2s';
            row.style.marginBottom = '0.5rem';

            const initials = getUserInitials(user.nombre);
            const color = getUserColor(user.auth_id);

            row.innerHTML = `
                <div style="width: 32px; height: 32px; border-radius: 8px; background: ${color}; color: white; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: 700;">${initials}</div>
                <div style="flex: 1;">
                    <span style="display: block; font-size: 0.85rem; font-weight: 600;">${user.nombre}</span>
                    <span style="display: block; font-size: 0.7rem; color: #64748b;">${user.email}</span>
                </div>
                <div class="check-box" style="width: 20px; height: 20px; border-radius: 4px; border: 2px solid #cbd5e1; display: flex; align-items: center; justify-content: center; transition: all 0.2s;">
                    <i class="fas fa-check" style="font-size: 0.7rem; color: white; display: none;"></i>
                </div>
            `;

            row.onclick = () => {
                const check = row.querySelector('.check-box');
                const icon = row.querySelector('.fa-check');
                if (selectedUsersForNewProject.includes(user.auth_id)) {
                    selectedUsersForNewProject = selectedUsersForNewProject.filter(id => id !== user.auth_id);
                    check.style.background = 'white';
                    check.style.borderColor = '#cbd5e1';
                    icon.style.display = 'none';
                    row.style.borderColor = '#e2e8f0';
                    row.style.background = 'white';
                } else {
                    selectedUsersForNewProject.push(user.auth_id);
                    check.style.background = 'var(--primary)';
                    check.style.borderColor = 'var(--primary)';
                    icon.style.display = 'block';
                    row.style.borderColor = 'var(--primary)';
                    row.style.background = '#f0fdf4';
                }
            };

            list.appendChild(row);
        });
    } catch (e) {
        console.error("Error al cargar miembros para nuevo proyecto:", e);
        list.innerHTML = '<p style="text-align: center; color: red; font-size: 0.8rem;">Error al cargar usuarios</p>';
    }
}

document.getElementById('btn-new-project').addEventListener('click', () => {
    openProjectModal();
});

document.getElementById('btn-fab-project').addEventListener('click', () => {
    const isIdeasView = !document.getElementById('ideas-view').classList.contains('hidden');
    if (isIdeasView) {
        openIdeaModal();
    } else {
        openProjectModal();
    }
});

document.getElementById('save-project').addEventListener('click', async () => {
    const name = document.getElementById('new-project-name').value;
    const description = document.getElementById('new-project-desc')?.value || '';
    const dueDate = document.getElementById('new-project-due')?.value;
    
    if (!name) {
        showCustomAlert("Nombre Requerido", "Debes ingresar un nombre para el proyecto.", "warning");
        return;
    }

    if (selectedUsersForNewProject.length === 0) {
        showCustomAlert("Usuarios Requeridos", "Debes asignar al menos un participante al proyecto.", "warning");
        return;
    }

    try {
        showLoading();
        const newProj = await Storage.addProject({ 
            name, 
            description,
            fecha_vencimiento: dueDate || null
        });

        // Asignar los usuarios seleccionados
        for (const userId of selectedUsersForNewProject) {
            await Storage.addProjectMember(newProj.id, userId);
        }

        projects.unshift(newProj);
        
        // Si venimos de la vista de Ideas y estamos convirtiendo una
        if (window.convertingIdeaId) {
            const ideaConverted = ideas.find(i => i.id === window.convertingIdeaId);
            await Storage.updateIdea(window.convertingIdeaId, { proyecto_id: newProj.id });
            
            // Log de conversión
            if (ideaConverted) {
                await Storage.addHistory({
                    accion: 'CONVERTIR_IDEA',
                    detalle: `transformó la idea *"${ideaConverted.titulo}"* en este nuevo proyecto`,
                    proyecto_id: newProj.id
                });
            }

            window.convertingIdeaId = null;
            // Refrescar ideas si la vista está activa
            if (!document.getElementById('ideas-view').classList.contains('hidden')) {
                await loadIdeas();
            }
        }

        // Log al nuevo proyecto
        await Storage.addHistory({
            accion: 'CREAR_PROYECTO',
            detalle: `creó el proyecto "${name}"`,
            proyecto_id: newProj.id
        });

        // Limpiar inputs
        document.getElementById('new-project-name').value = '';
        if (document.getElementById('new-project-desc')) {
            document.getElementById('new-project-desc').value = '';
        }
        if (document.getElementById('new-project-due')) {
            document.getElementById('new-project-due').value = '';
        }

        await refreshProjectViews();
        closeModals();
        hideLoading();
        showCustomAlert("Proyecto Creado", `El proyecto "${name}" ha sido iniciado con éxito.`, "success");
    } catch (error) {
        hideLoading();
        console.error("Error al crear proyecto:", error);
        showCustomAlert("Error", "No se pudo crear el proyecto.", "error");
    }
});

// --- TASKS ---
let editingTaskId = null;
let isEditMode = false;

function openTaskModal(taskId = null, targetType = null) {
    editingTaskId = taskId;
    const modal = document.getElementById('modal-task');

    const btnEdit = document.getElementById('btn-edit-task');
    const formContainer = document.getElementById('task-form-container');
    const infoContainer = document.getElementById('task-info-container');
    const saveBtn = document.getElementById('save-task');
    const titleDisplay = document.getElementById('modal-task-title-display');
    const motivoField = document.getElementById('motivo-field-container');
    const infoMotivoBox = document.getElementById('info-motivo-box');

    // Navegación precisa si se indica un tipo (Target Type)
    if (targetType) {
        const tabMap = {
            'COMMENT': 'sec-comments',
            'CHECKLIST': 'sec-checklist',
            'NUMBERED': 'sec-numbered'
        };
        const targetTab = tabMap[targetType];
        if (targetTab) {
            document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
            document.querySelector(`.tab-link[data-tab="${targetTab}"]`)?.classList.add('active');
            const targetPane = document.getElementById(targetTab);
            if (targetPane) targetPane.classList.add('active');
        }
    } else {
        // Resetear Tabs a Chat por defecto
        document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelector('.tab-link[data-tab="sec-comments"]')?.classList.add('active');
        document.getElementById('sec-comments')?.classList.add('active');
    }

    if (!taskId) {
        // Modo Creación
        isEditMode = true;
        titleDisplay.textContent = "Nueva Tarea";
        btnEdit.classList.add('hidden');
        formContainer.classList.remove('hidden');
        infoContainer.classList.add('hidden');
        motivoField.classList.add('hidden');
        infoMotivoBox.classList.add('hidden');
        saveBtn.classList.remove('hidden');
        saveBtn.textContent = "Crear Tarea";
        
        // Esconder extensiones en nueva tarea
        if (taskExtensionsArea) taskExtensionsArea.classList.add('hidden');

        // Reset campos
        document.getElementById('task-title').value = '';
        document.getElementById('task-desc').value = '';
        document.getElementById('task-due').value = '';
        document.getElementById('task-priority').value = 1;
        document.getElementById('task-motivo').value = '';
        updatePriorityUI(1);
    } else {
        // Modo Detalle/Edición
        const task = tasks.find(t => t.id === taskId) || (typeof globalAllTasks !== 'undefined' ? globalAllTasks.find(t => t.id === taskId) : null);
        
        if (!task) {
            console.warn("No se encontró la tarea localmente:", taskId);
            // Intentar cargar la tarea directamente si no existe localmente
            Storage.getTasks().then(all => {
                const found = all.find(t => t.id === taskId);
                if (found) openTaskModal(found.id);
            });
            return;
        }

        isEditMode = false;
        titleDisplay.textContent = task.titulo;
        btnEdit.classList.remove('hidden');
        btnEdit.classList.remove('active');
        
        // Mostrar extensiones
        if (taskExtensionsArea) taskExtensionsArea.classList.remove('hidden');
        fetchTaskElements(taskId);

        // Determinar etiquetas de estado
        const statusMap = {
            'TODO': 'PENDIENTE',
            'DOING': 'EN PROCESO',
            'DONE': 'FINALIZADO',
            'REVIEW': 'EN REVISIÓN',
            'REJECTED': 'RECHAZADO'
        };
        const status = task.estado || (task.completada ? 'DONE' : 'TODO');

        // Llenar datos informativa
        document.getElementById('info-task-desc').textContent = task.descripcion || 'Sin descripción.';
        document.getElementById('info-task-status').textContent = statusMap[status] || 'PENDIENTE';
        document.getElementById('info-task-due').textContent = task.fecha_vencimiento 
            ? new Date(task.fecha_vencimiento).toLocaleString() 
            : 'Sin fecha';

        // Llenar datos formulario por si se activa edición
        document.getElementById('task-title').value = task.titulo;
        document.getElementById('task-desc').value = task.descripcion || '';
        document.getElementById('task-due').value = task.fecha_vencimiento ? task.fecha_vencimiento.slice(0, 16) : '';
        document.getElementById('task-priority').value = task.prioridad || 1;
        document.getElementById('task-motivo').value = task.motivo || '';
        
        // Mostrar motivo si existe
        if (task.motivo) {
            infoMotivoBox.classList.remove('hidden');
            document.getElementById('info-task-motivo').textContent = task.motivo;
        } else {
            infoMotivoBox.classList.add('hidden');
        }

        // Mostrar campo motivo en formulario solo si es Review/Rejected
        if (status === 'REVIEW' || status === 'REJECTED') {
            motivoField.classList.remove('hidden');
        } else {
            motivoField.classList.add('hidden');
        }

        // Sincronizar UI de prioridad (y banner)
        updatePriorityUI(task.prioridad || 1);

        formContainer.classList.add('hidden');
        infoContainer.classList.remove('hidden');
        saveBtn.classList.add('hidden');
        saveBtn.textContent = "Guardar Cambios";
    }

    modal.classList.remove('hidden');
}

document.getElementById('btn-edit-task')?.addEventListener('click', () => {
    isEditMode = !isEditMode;
    const btnEdit = document.getElementById('btn-edit-task');
    const formContainer = document.getElementById('task-form-container');
    const infoContainer = document.getElementById('task-info-container');
    const saveBtn = document.getElementById('save-task');

    if (isEditMode) {
        btnEdit.classList.add('active');
        formContainer.classList.remove('hidden');
        infoContainer.classList.add('hidden');
        saveBtn.classList.remove('hidden');
    } else {
        btnEdit.classList.remove('active');
        formContainer.classList.add('hidden');
        infoContainer.classList.remove('hidden');
        saveBtn.classList.add('hidden');
    }
});

function renderKanban() {
    if (!currentProject) {
        kanbanView.classList.add('hidden');
        return;
    }
    kanbanView.classList.remove('hidden');

    const columns = [
        { id: 'TODO', label: 'Pendiente', icon: 'fa-list-ul' },
        { id: 'DOING', label: 'En Proceso', icon: 'fa-spinner' },
        { id: 'DONE', label: 'Finalizado', icon: 'fa-check-double' },
        { id: 'REVIEW', label: 'En Revisión', icon: 'fa-eye' },
        { id: 'REJECTED', label: 'Rechazado', icon: 'fa-ban' }
    ];

    columns.forEach(col => {
        const columnEl = document.querySelector(`.column[data-status="${col.id}"]`);
        if (!columnEl) return;
        
        const listEl = columnEl.querySelector('.task-list');
        listEl.innerHTML = '';
        
        // Handlers para la lista (Drop zones)
        listEl.ondragover = (e) => {
            e.preventDefault();
            listEl.classList.add('drag-over');
        };
        listEl.ondragleave = () => listEl.classList.remove('drag-over');
        listEl.ondrop = async (e) => {
            e.preventDefault();
            listEl.classList.remove('drag-over');
            const id = e.dataTransfer.getData('text/plain');
            await moveTask(id, col.id);
        };
        
        const colTasks = tasks
            .filter(t => (t.estado || (t.completada ? 'DONE' : 'TODO')) === col.id)
            .sort((a, b) => {
                if (col.id === 'REJECTED' || col.id === 'REVIEW') return 0; // No ordenar por prioridad aquí
                // Primero por prioridad desc (10 arriba)
                if ((b.prioridad || 1) !== (a.prioridad || 1)) {
                    return (b.prioridad || 1) - (a.prioridad || 1);
                }
                // Luego por fecha de vencimiento asc (más cerca primero)
                if (a.fecha_vencimiento && b.fecha_vencimiento) {
                    return new Date(a.fecha_vencimiento) - new Date(b.fecha_vencimiento);
                }
                return a.fecha_vencimiento ? -1 : 1; 
            });

        colTasks.forEach(task => {
            const card = document.createElement('div');
            const status = task.estado || 'TODO';
            card.className = `task-card ${status.toLowerCase()}`;
            card.draggable = (status !== 'REJECTED'); // No arrastrar si es rechazado
            card.dataset.id = task.id;

            card.ondragstart = (e) => {
                draggedTaskId = task.id;
                e.dataTransfer.setData('text/plain', task.id);
                card.classList.add('dragging');
            };
            card.ondragend = () => {
                draggedTaskId = null;
                card.classList.remove('dragging');
            };
            
            // Estilos específicos por estado
            if (status === 'REVIEW') {
                card.style.backgroundColor = '#fff7ed'; // Naranja muy ligero
                card.style.borderLeftColor = '#f97316';
            } else if (status === 'REJECTED') {
                card.style.backgroundColor = '#f1f5f9'; // Gris
                card.style.borderLeftColor = '#94a3b8';
                card.style.opacity = '0.7';
                card.style.filter = 'grayscale(100%)';
            } else {
                // Definir Niveles de Prioridad Normales
                let pConfig = { label: 'Baja', color: '#64748b' };
                const p = task.prioridad || 1;
                if (p >= 8) pConfig = { label: 'Urgente', color: '#ef4444' };
                else if (p >= 5) pConfig = { label: 'Importante', color: '#f59e0b' };
                else if (p >= 3) pConfig = { label: 'Media', color: '#3b82f6' };
                card.style.borderLeftColor = pConfig.color;
            }
            
            const dueDateStr = task.fecha_vencimiento 
                ? new Date(task.fecha_vencimiento).toLocaleString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                : 'Sin fecha';

            // Badge de prioridad: ocultar si es Review o Rejected
            const showPriority = (status !== 'REVIEW' && status !== 'REJECTED');
            let priorityHTML = '';
            if (showPriority) {
                const p = task.prioridad || 1;
                let pLabel = p >= 8 ? 'Urgente' : (p >= 5 ? 'Importante' : (p >= 3 ? 'Media' : 'Baja'));
                let pColor = p >= 8 ? '#ef4444' : (p >= 5 ? '#f59e0b' : (p >= 3 ? '#3b82f6' : '#64748b'));
                priorityHTML = `
                    <span class="priority-badge" style="background: ${pColor}; color: white; font-size: 0.6rem; padding: 2px 8px; border-radius: 20px; font-weight: 700;">
                        P${p} - ${pLabel.toUpperCase()}
                    </span>
                `;
            }

            card.innerHTML = `
                <div class="task-card-header">
                    <div style="width: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                            ${priorityHTML}
                        </div>
                        <h4>${task.titulo}</h4>
                    </div>
                </div>
                ${task.descripcion ? `<p class="task-desc-preview">${task.descripcion}</p>` : ''}
                ${task.motivo && (status === 'REVIEW' || status === 'REJECTED') ? `<p style="font-size: 0.7rem; color: #f59e0b; font-style: italic; margin-bottom: 0.5rem;">Motivo: ${task.motivo}</p>` : ''}
                <div class="task-footer">
                    <div class="task-date" style="font-size: 0.75rem; color: var(--text-muted);">
                        <i class="far fa-clock"></i>
                        <span>${dueDateStr}</span>
                    </div>
                    <div class="task-actions">
                        <i class="fas fa-trash btn-delete-task" title="Eliminar" onclick="event.stopPropagation(); deleteTask('${task.id}')"></i>
                    </div>
                </div>
            `;
            
            // Handlers para la tarjeta (Draggable items)
            card.ondragstart = (e) => {
                card.classList.add('dragging');
                e.dataTransfer.setData('text/plain', task.id);
            };
            card.ondragend = () => card.classList.remove('dragging');
            
            // Al hacer clic, abre detalle
            card.onclick = () => {
                openTaskModal(task.id);
            };
            listEl.appendChild(card);
        });
    });
}

async function moveTask(taskId, newStatus) {
    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;

    const oldStatus = tasks[taskIndex].estado || (tasks[taskIndex].completada ? 'DONE' : 'TODO');
    if (oldStatus === newStatus) return;

    let motivo = null;
    if (newStatus === 'REVIEW' || newStatus === 'REJECTED') {
        const actionLabel = newStatus === 'REVIEW' ? 'la Revisión' : 'el Rechazo';
        motivo = await promptMotivo(`Motivo de ${actionLabel}`);
        
        if (motivo === null) return; // Cancelado
    }

    // 1. Actualización Optimista (Frontend instantáneo)
    const previousState = { ...tasks[taskIndex] };
    tasks[taskIndex].estado = newStatus;
    tasks[taskIndex].completada = (newStatus === 'DONE');
    if (motivo) tasks[taskIndex].motivo = motivo;
    
    renderKanban();
    if (!historyView.classList.contains('hidden')) renderHistory();
    updateDashboardMetrics();

    // 2. Persistencia en segundo plano
    try {
        await Storage.updateTaskStatus(taskId, newStatus, motivo);
        const oldLabel = STATUS_NAMES[oldStatus] || oldStatus;
        const newLabel = STATUS_NAMES[newStatus] || newStatus;
        logAction('MOVER', `movió la tarea *"${previousState.titulo}"* de *${oldLabel}* a *${newLabel}*`, taskId);
    } catch (error) {
        console.error("Error al mover tarea:", error);
        tasks[taskIndex] = previousState; // Rollback
        renderKanban();
        updateDashboardMetrics();
    }
}

async function toggleTask(taskId, status) {
    const newStatus = status ? 'DONE' : 'TODO';
    await moveTask(taskId, newStatus);
}

async function deleteTask(taskId) {
    if (await showCustomConfirm('Eliminar Tarea', '¿Estás seguro de que deseas eliminar esta tarea?', 'danger')) {
        const taskToDelete = tasks.find(t => t.id === taskId);
        const taskTitle = taskToDelete ? taskToDelete.titulo : 'Tarea';
        
        // 1. Optimista
        const originalTasks = [...tasks];
        tasks = tasks.filter(t => t.id !== taskId);
        renderKanban();
        if (!historyView.classList.contains('hidden')) renderHistory();
        updateDashboardMetrics();

        try {
            await Storage.deleteTask(taskId);
            logAction('ELIMINAR', `eliminó la tarea *"${taskTitle}"*`, taskId);
        } catch (error) {
            console.error("Error al eliminar:", error);
            tasks = originalTasks; // Rollback
            renderKanban();
            updateDashboardMetrics();
        }
    }
}

// --- UI HELPERS ---
async function showCustomAlert(title, message, type = 'info') {
    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    const icons = {
        success: 'fa-check-circle',
        error: 'fa-times-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    };
    overlay.innerHTML = `
        <div class="custom-alert-card">
            <div class="alert-icon ${type}"><i class="fas ${icons[type] || icons.info}"></i></div>
            <div class="alert-title">${title}</div>
            <div class="alert-msg">${message}</div>
            <div class="alert-actions">
                <button class="alert-btn">Entendido</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return new Promise((resolve) => {
        overlay.querySelector('.alert-btn').onclick = () => {
            overlay.remove();
            resolve();
        };
    });
}

async function showCustomConfirm(title, message, type = 'warning') {
    const overlay = document.createElement('div');
    overlay.className = 'custom-alert-overlay';
    const icons = {
        warning: 'fa-exclamation-triangle',
        danger: 'fa-trash-alt',
        question: 'fa-question-circle'
    };
    overlay.innerHTML = `
        <div class="custom-alert-card">
            <div class="alert-icon ${type}"><i class="fas ${icons[type] || icons.warning}"></i></div>
            <div class="alert-title">${title}</div>
            <div class="alert-msg">${message}</div>
            <div class="alert-actions">
                <button class="alert-btn secondary cancel-btn">Cancelar</button>
                <button class="alert-btn ${type === 'danger' ? 'danger' : ''} confirm-btn">Confirmar</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    return new Promise((resolve) => {
        overlay.querySelector('.cancel-btn').onclick = () => {
            overlay.remove();
            resolve(false);
        };
        overlay.querySelector('.confirm-btn').onclick = () => {
            overlay.remove();
            resolve(true);
        };
    });
}

function showNotification(title, message, isError = false) {
    showCustomAlert(title, message, isError ? 'error' : 'success');
}

// --- LOGGING & HISTORY ---
async function logAction(accion, detalle, tareaId = null) {
    if (!currentProject) return;
    try {
        await Storage.addHistory({
            accion,
            detalle,
            proyecto_id: currentProject.id,
            tarea_id: tareaId
        });
    } catch (err) {
        console.error("Error logging action:", err);
    }
}

async function renderHistory() {
    if (!currentProject) return;
    
    try {
        const history = await Storage.getHistory(currentProject.id);
        
        if (!history || history.length === 0) {
            historyList.innerHTML = `
                <div class="history-empty">
                    <i class="fas fa-clipboard-list"></i>
                    <p>No hay registros para este proyecto todavía.</p>
                </div>
            `;
            return;
        }

        // --- AGRUPAR POR TAREA (CARPETAS) ---
        const groups = {};
        history.forEach(item => {
            const key = item.tarea_id || 'general';
            if (!groups[key]) {
                groups[key] = {
                    id: key,
                    items: [],
                    lastActivity: item.created_at,
                    title: 'General / Proyecto'
                };
            }
            groups[key].items.push(item);
            if (new Date(item.created_at) > new Date(groups[key].lastActivity)) {
                groups[key].lastActivity = item.created_at;
            }
        });

        // Intentar obtener nombres de tareas para los grupos
        Object.keys(groups).forEach(key => {
            if (key === 'general') return;
            const task = tasks.find(t => t.id === key);
            if (task) {
                groups[key].title = task.titulo;
            } else {
                const namedLog = [...groups[key].items].reverse().find(i => i.detalle.includes('"'));
                if (namedLog) {
                    const match = namedLog.detalle.match(/"([^"]+)"/);
                    if (match) groups[key].title = match[1];
                } else {
                    groups[key].title = "Tarea finalizada / eliminada";
                }
            }
        });

        // Ordenar grupos por última actividad DESC
        const sortedGroups = Object.values(groups).sort((a, b) => 
            new Date(b.lastActivity) - new Date(a.lastActivity)
        );

        // --- RENDERIZADO SEGÚN ESTADO (GRID O DETALLE) ---
        if (currentHistoryFolder) {
            const group = groups[currentHistoryFolder];
            if (!group) { currentHistoryFolder = null; renderHistory(); return; }

            const itemsHTML = group.items.map(item => renderHistoryItem(item)).join('');

            historyList.innerHTML = `
                <div class="history-detail-view">
                    <div class="history-back-header" onclick="currentHistoryFolder = null; renderHistory();">
                        <i class="fas fa-arrow-left"></i>
                        <span>Volver a las carpetas / ${group.title}</span>
                    </div>
                    ${itemsHTML}
                </div>
            `;
        } else {
            const cardsHTML = sortedGroups.map(group => {
                const lastDate = new Date(group.lastActivity);
                const relativeTimeStr = getRelativeTime(lastDate);
                const iconClass = group.id === 'general' ? 'fa-project-diagram' : 'fa-folder';

                return `
                    <div class="history-folder-card" onclick="currentHistoryFolder='${group.id}'; renderHistory();">
                        <div class="folder-icon-wrapper">
                            <i class="fas ${iconClass}"></i>
                        </div>
                        <div class="folder-content-info">
                            <h4>${group.title}</h4>
                            <p>${group.items.length} ${group.items.length === 1 ? 'registro' : 'registros'} de actividad</p>
                            <p style="font-size: 0.75rem; margin-top: 0.2rem; opacity: 0.8;">Actividad: ${relativeTimeStr}</p>
                        </div>
                    </div>
                `;
            }).join('');

            historyList.innerHTML = `<div class="history-folder-grid">${cardsHTML}</div>`;
        }

    } catch (err) {
        console.error("Error rendering history:", err);
        historyList.innerHTML = '<p class="error">Error al cargar el historial.</p>';
    }
}

function renderHistoryItem(item) {
    const date = new Date(item.created_at);
    const timeStr = date.toLocaleString('es-ES', { hour: '2-digit', minute: '2-digit' });
    let typeClass = 'update';
    let icon = 'fa-sync-alt';

    let detail = item.detalle;
    Object.keys(STATUS_NAMES).forEach(statusKey => {
        const regex = new RegExp(`\\b${statusKey}\\b`, 'g');
        detail = detail.replace(regex, STATUS_NAMES[statusKey]);
    });

    if (item.accion.includes('ELIMINAR') || item.accion.includes('BORRAR')) {
        typeClass = 'delete'; icon = 'fa-trash-alt';
    } else if (item.accion.includes('MOVER')) {
        typeClass = 'move'; icon = 'fa-exchange-alt';
    } else if (item.accion.includes('CREAR')) {
        typeClass = 'create'; icon = 'fa-plus-circle';
    } else if (item.accion === 'RESPONDER') {
        typeClass = 'reply'; icon = 'fa-reply';
    } else if (item.accion === 'AÑADIR' && item.detalle.includes('comentario')) {
        typeClass = 'comment'; icon = 'fa-comment-dots';
    }

    return `
        <div class="history-item ${typeClass}">
            <div class="history-icon ${typeClass}">
                <i class="fas ${icon}"></i>
            </div>
            <div class="history-content">
                <div class="history-main-text">
                    <strong>${item.usuario_nombre}</strong> ${detail}
                </div>
                <div class="history-time">
                    <i class="far fa-clock"></i> ${timeStr} - ${date.toLocaleDateString()}
                </div>
            </div>
        </div>
    `;
}

function getRelativeTime(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    
    if (diffInSeconds < 60) return 'hace un momento';
    if (diffInSeconds < 3600) return `hace ${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `hace ${Math.floor(diffInSeconds / 3600)} h`;
    if (diffInSeconds < 172800) return 'ayer';
    return date.toLocaleDateString();
}

async function deleteProject(projectId) {
    if (await showCustomConfirm('Eliminar Proyecto', '¿Estás seguro de que deseas eliminar este proyecto y todas sus tareas?', 'danger')) {
        const projectToDelete = projects.find(p => p.id === projectId);
        const projectName = projectToDelete ? projectToDelete.nombre : 'Proyecto';

        // Intentar registrar antes de borrar (porque se borrará el historial en cascada si es del mismo proyecto)
        await logAction('ELIMINAR_PROYECTO', `eliminó el proyecto *"${projectName}"*`, null);

        const originalProjects = [...projects];
        projects = projects.filter(p => p.id !== projectId);
        
        await refreshProjectViews();

        try {
            await Storage.deleteProject(projectId);
        } catch (error) {
            console.error("Error al eliminar proyecto:", error);
            projects = originalProjects;
            await refreshProjectViews();
        }
    }
}

document.querySelectorAll('.btn-add-task').forEach(btn => {
    btn.addEventListener('click', () => {
        if (!currentProject) return showNotification('Aviso', 'Selecciona un proyecto primero para añadir tareas.', true);
        openTaskModal();
    });
});

document.getElementById('save-task')?.addEventListener('click', async () => {
    const title = document.getElementById('task-title').value;
    const description = document.getElementById('task-desc').value;
    const dueDate = document.getElementById('task-due').value;
    const priority = parseInt(document.getElementById('task-priority').value) || 1;
    const motivo = document.getElementById('task-motivo').value;
    
    if (!title) return;

    try {
        if (editingTaskId) {
            // ACTUALIZAR EXISTENTE
            const currentTask = tasks.find(t => t.id === editingTaskId);
            
            // Comparar cambios detallados para el historial
            let cambios = [];
            const truncate = (str, len = 25) => {
                if (!str) return 'vacío';
                return str.length > len ? str.substring(0, len) + "..." : str;
            };

            if (currentTask.titulo !== title) {
                cambios.push(`título ("${currentTask.titulo}" → "${title}")`);
            }
            if ((currentTask.descripcion || "") !== (description || "")) {
                cambios.push(`descripción ("${truncate(currentTask.descripcion)}" → "${truncate(description)}")`);
            }
            if (parseInt(currentTask.prioridad || 1) !== parseInt(priority)) {
                cambios.push(`prioridad (${currentTask.prioridad || 1} → ${priority})`);
            }
            
            // Comparar fechas (normalizando)
            const oldTime = currentTask.fecha_vencimiento ? new Date(currentTask.fecha_vencimiento).getTime() : 0;
            const newTime = dueDate ? new Date(dueDate).getTime() : 0;
            if (oldTime !== newTime) {
                const fOld = currentTask.fecha_vencimiento ? new Date(currentTask.fecha_vencimiento).toLocaleDateString() : 'Sin fecha';
                const fNew = dueDate ? new Date(dueDate).toLocaleDateString() : 'Sin fecha';
                cambios.push(`vencimiento (${fOld} → ${fNew})`);
            }
            
            if ((currentTask.motivo || "") !== (motivo || "")) {
                cambios.push(`motivo ("${truncate(currentTask.motivo)}" → "${truncate(motivo)}")`);
            }

            let detalleEdit = `actualizó la tarea "${title}"`;
            if (cambios.length > 0) {
                detalleEdit += ` (${cambios.join(', ')})`;
            }

            const updates = { 
                title, 
                description, 
                dueDate, 
                priority,
                motivo,
                status: currentTask.estado || (currentTask.completada ? 'DONE' : 'TODO')
            };
            
            // Optimista
            const idx = tasks.findIndex(t => t.id === editingTaskId);
            tasks[idx] = { ...tasks[idx], titulo: title, descripcion: description, fecha_vencimiento: dueDate, prioridad: priority, motivo: motivo };
            
            renderKanban();
            if (!historyView.classList.contains('hidden')) renderHistory();
            updateDashboardMetrics();
            closeModals();
            
            await Storage.updateTask(editingTaskId, updates);
            logAction('EDITAR', detalleEdit, editingTaskId);
        } else {
            // CREAR NUEVA
            const newTask = await Storage.addTask({
                title,
                description,
                projectId: currentProject.id,
                priority,
                dueDate
            });

            tasks.push(newTask);
            renderKanban();
            if (!historyView.classList.contains('hidden')) renderHistory();
            updateDashboardMetrics();
            closeModals();
            logAction('CREAR', `creó la tarea *"${title}"*`, newTask.id);
        }
    } catch (error) {
        console.error("Error al guardar tarea:", error);
        if (editingTaskId) {
            tasks = await Storage.getTasks(currentProject.id); // Rollback
            renderKanban();
        }
    }
});

// --- VIEWS ---
btnViewKanban.onclick = () => {
    lastActiveView = 'kanban';
    btnViewKanban.classList.add('active');
    btnViewHistory.classList.remove('active');
    kanbanView.classList.remove('hidden');
    historyView.classList.add('hidden');
    renderKanban();
};

btnViewHistory.onclick = () => {
    lastActiveView = 'history';
    currentHistoryFolder = null; // Volver a la vista de cuadrícula de carpetas
    btnViewHistory.classList.add('active');
    btnViewKanban.classList.remove('active');
    kanbanView.classList.add('hidden');
    historyView.classList.remove('hidden');
    renderHistory();
};

btnRefreshHistory.onclick = () => renderHistory();

// Inicialización
checkUser();

const PROJECT_QUOTES = [
    { text: "Lo que no se define no se puede medir. Lo que no se mide, no se puede mejorar.", author: "Peter Drucker" },
    { text: "La planificación a largo plazo no es pensar en decisiones futuras, sino en el futuro de las decisiones presentes.", author: "Peter Drucker" },
    { text: "Un proyecto sin un camino crítico es como un barco sin timón.", author: "D. Meyer" },
    { text: "Cualquier cosa que valga la pena hacer, vale la pena hacerla bien.", author: "Lord Chesterfield" },
    { text: "El trabajo en equipo es la capacidad de trabajar juntos hacia una visión común.", author: "Andrew Carnegie" },
    { text: "La mejor forma de predecir el futuro es creándolo.", author: "Peter Drucker" },
    { text: "El éxito es la suma de pequeños esfuerzos que se repiten cada día.", author: "Robert Collier" }
];

function showLoading() {
    const modal = document.getElementById('modal-loading');
    const quoteTitle = document.getElementById('loading-quote-title');
    const quoteAuthor = document.getElementById('loading-quote-author');
    
    if (modal && quoteTitle && quoteAuthor) {
        const randomQuote = PROJECT_QUOTES[Math.floor(Math.random() * PROJECT_QUOTES.length)];
        quoteTitle.textContent = `"${randomQuote.text}"`;
        quoteAuthor.textContent = `– ${randomQuote.author}`;
        modal.classList.remove('hidden');
    }
}

function hideLoading() {
    const modal = document.getElementById('modal-loading');
    if (modal) modal.classList.add('hidden');
    
    // También ocultamos el splash screen inicial si existe (id="loading")
    const splash = document.getElementById('loading');
    if (splash) splash.style.display = 'none';

    // Aseguramos que la app sea visible
    const app = document.getElementById('app');
    if (app) app.style.display = 'block';
}

function updateMembersButtonVisibility(role) {
    const btn = document.getElementById('btn-edit-members');
    if (!btn) return;
    const userRole = role || localStorage.getItem('user_role');
    if (userRole === 'admin' && currentProject) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

// GESTIÓN DE MIEMBROS MODAL
let allUsersCache = [];
let currentProjectMembers = [];

async function openMembersModal() {
    if (!currentProject) return;
    const modal = document.getElementById('modal-project-members');
    modal.classList.remove('hidden');
    
    // Reset buscador
    const searchInput = document.getElementById('search-users');
    if (searchInput) searchInput.value = '';

    await loadAllUsersAndMembers();
}

async function loadAllUsersAndMembers() {
    const grid = document.getElementById('users-gallery-grid');
    if (grid) grid.innerHTML = '<div class="loader-container"><div class="spinner-loading"></div><span>Sincronizando equipo...</span></div>';
    
    try {
        // Cargar ambos en paralelo para velocidad
        const [users, membersData] = await Promise.all([
            Storage.getAllUsers(),
            Storage.getProjectMembers(currentProject.id)
        ]);

        allUsersCache = users;
        // Mapear solo los IDs para búsqueda fácil
        currentProjectMembers = membersData.map(m => m.usuario_id);
        
        renderMembersGallery();
        updateMembersCountLabel();
    } catch (e) {
        console.error("Error cargando usuarios/miembros:", e);
        if (grid) grid.innerHTML = '<div style="color:red; text-align:center; padding:2rem;">Error de conexión. Inténtalo de nuevo.</div>';
    }
}

function renderMembersGallery(filter = '') {
    const grid = document.getElementById('users-gallery-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const term = filter.toLowerCase();
    // Filtro: Debe coincidir con el término de búsqueda Y ser de rol 'user'
    const filtered = allUsersCache.filter(u => 
        (u.nombre.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)) && 
        u.rol === 'user'
    );

    if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align:center; padding:3rem; opacity:0.5;">No se encontraron usuarios</div>';
        return;
    }

    filtered.forEach(user => {
        const isMember = currentProjectMembers.includes(user.auth_id);
        const card = document.createElement('div');
        card.className = `user-member-card ${isMember ? 'is-member' : ''}`;
        card.dataset.userId = user.auth_id;

        card.innerHTML = `
            <div class="card-avatar">${user.nombre.substring(0, 2).toUpperCase()}</div>
            <div class="card-info">
                <span class="user-name">${user.nombre}</span>
                <span class="user-email">${user.email}</span>
            </div>
            <div class="check-indicator">
                <i class="fas fa-check"></i>
            </div>
        `;

        card.onclick = () => toggleUserMembership(user.auth_id, card);
        grid.appendChild(card);
    });
}

async function toggleUserMembership(authId, cardElement) {
    const isMember = currentProjectMembers.includes(authId);
    
    try {
        // Feedback visual inmediato (Optimistic UI)
        if (isMember) {
            currentProjectMembers = currentProjectMembers.filter(id => id !== authId);
            cardElement.classList.remove('is-member');
            await Storage.removeProjectMember(currentProject.id, authId);
        } else {
            currentProjectMembers.push(authId);
            cardElement.classList.add('is-member');
            await Storage.addProjectMember(currentProject.id, authId);
        }
        updateMembersCountLabel();
    } catch (e) {
        console.error("Error toggling membership:", e);
        // Revertir si falla
        loadAllUsersAndMembers(); 
        showCustomAlert("Error", "No se pudo actualizar el miembro.", "error");
    }
}

function updateMembersCountLabel() {
    const label = document.getElementById('members-count');
    if (label) label.textContent = currentProjectMembers.length;
}

// Búsqueda en tiempo real
document.getElementById('search-users')?.addEventListener('input', (e) => {
    renderMembersGallery(e.target.value);
});

// Iniciar listeners de miembros
document.getElementById('btn-edit-members')?.addEventListener('click', openMembersModal);

function closeModals() {
    if (window.projectAudio) {
        window.projectAudio.pause();
        window.projectAudio = null;
    }

    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    document.querySelectorAll('input, textarea, select').forEach(i => {
        if (i.tagName === 'SELECT') i.selectedIndex = 0;
        else if (i.type === 'range') {
            i.value = 1;
            // No podemos llamar al listener directamente, pero podemos resetear el UI
            if(i.id === 'task-priority') updatePriorityUI(1);
        }
        else i.value = '';
    });
    // Resetear Tabs a Comentarios
    const firstTab = document.querySelector('.tab-link[data-tab="sec-comments"]');
    if (firstTab) firstTab.click();
}

// Cerrar al hacer clic fuera del modal-content
document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModals();
    });
});

// Lógica de Tabs en Modal de Tarea
document.body.addEventListener('click', (e) => {
    const tabLink = e.target.closest('.tab-link');
    if (tabLink) {
        const targetTab = tabLink.dataset.tab;
        
        // Update links
        document.querySelectorAll('.tab-link').forEach(l => l.classList.remove('active'));
        tabLink.classList.add('active');

        // Update content
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.getElementById(targetTab)?.classList.add('active');
    }
});

// Lógica de UI para Prioridades
function updatePriorityUI(level) {
    const iconWrapper = document.getElementById('priority-icon-bg');
    const icon = document.getElementById('priority-icon');
    const text = document.getElementById('priority-text');
    const desc = document.getElementById('priority-desc');
    const indicator = document.getElementById('priority-indicator');
    const banner = document.getElementById('modal-priority-banner');

    if (!iconWrapper || !icon || !text || !desc) return;

    let config = {
        color: '#64748b',
        icon: 'fa-leaf',
        label: `P${level} - Relajado`,
        desc: 'Para cuando haya tiempo.',
        bg: '#f8fafc',
        animation: 'none'
    };

    if (level >= 8) {
        config = {
            color: '#ef4444',
            icon: 'fa-fire-alt',
            label: `P${level} - ¡URGENTE!`,
            desc: '¡Máxima prioridad, hazlo ya!',
            bg: '#fef2f2',
            animation: 'priority-pulse 1s infinite'
        };
    } else if (level >= 5) {
        config = {
            color: '#f59e0b',
            icon: 'fa-bolt',
            label: `P${level} - Importante`,
            desc: 'Requiere atención pronto.',
            bg: '#fffbeb',
            animation: 'none'
        };
    } else if (level >= 3) {
        config = {
            color: '#3b82f6',
            icon: 'fa-coffee',
            label: `P${level} - Moderado`,
            desc: 'Tarea de rutina estándar.',
            bg: '#eff6ff',
            animation: 'none'
        };
    }

    iconWrapper.style.backgroundColor = config.color;
    iconWrapper.style.animation = config.animation;
    icon.className = `fas ${config.icon}`;
    text.textContent = config.label;
    text.style.color = config.color;
    desc.textContent = config.desc;
    indicator.style.backgroundColor = config.bg;
    indicator.style.borderColor = level >= 8 ? '#fee2e2' : '#e2e8f0';
    
    // Actualizar Banner Superior del Modal
    if (banner) banner.style.backgroundColor = config.color;

    // Actualizar Vista Informativa (Pill de prioridad)
    const infoIcon = document.getElementById('info-task-priority-icon');
    const infoText = document.getElementById('info-task-priority');
    const infoLabel = document.getElementById('info-task-priority-label');
    const infoPill = document.getElementById('info-task-priority-pill');
    const infoCircle = document.getElementById('info-priority-circle');
    
    if (infoIcon && infoText && infoPill) {
        infoIcon.className = `fas ${config.icon}`;
        infoIcon.style.color = config.color;
        if (infoCircle) {
            infoCircle.style.animation = config.animation;
            infoCircle.style.border = `1px solid ${config.color}20`;
        }
        
        infoText.textContent = `Prioridad ${level}`;
        infoText.style.color = config.color;
        
        if (infoLabel) {
            // Extraer solo la palabra del label (ej: "Relajado" de "P1 - Relajado")
            const labelText = config.label.split(' - ')[1] || config.label;
            infoLabel.textContent = labelText;
            infoLabel.style.color = config.color;
        }

        infoPill.style.backgroundColor = config.bg;
        infoPill.style.borderColor = config.color + '30';
    }
}

document.getElementById('task-priority')?.addEventListener('input', (e) => {
    updatePriorityUI(parseInt(e.target.value));
});

document.querySelectorAll('.close-modal').forEach(btn => {
    btn.onclick = closeModals;
});

// --- TASK EXTENSIONS (COMMENTS, CHECKLISTS, NUMBERED) ---

// Lógica de Tabs
document.querySelectorAll('.tab-link').forEach(btn => {
    btn.onclick = () => {
        const targetId = btn.getAttribute('data-tab');
        
        // Desactivar todos
        document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        // Activar seleccionado
        btn.classList.add('active');
        document.getElementById(targetId).classList.add('active');
    };
});

// Logica de Archivos Adjuntos
document.body.addEventListener('click', (e) => {
    if (e.target.closest('#btn-trigger-file')) {
        fileInput?.click();
    }
    if (e.target.closest('#btn-remove-attachment')) {
        selectedFile = null;
        if (fileInput) fileInput.value = '';
        attachmentPreview?.classList.add('hidden');
    }
});

fileInput?.addEventListener('change', (e) => {
    handleSelectedFile(e.target.files[0]);
});

// Arrastre de archivos (Drag & Drop)
const dropZone = document.getElementById('comment-input-area');
if (dropZone) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
        }, false);
    });

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.add('drag-over');
        }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, () => {
            dropZone.classList.remove('drag-over');
        }, false);
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const file = dt.files[0];
        if (file) handleSelectedFile(file);
    }, false);
}

function handleSelectedFile(file) {
    if (!file) return;
    
    selectedFile = file;
    const previewThumbnail = document.getElementById('preview-thumbnail');
    const previewIcon = document.getElementById('preview-icon');
    const previewSize = document.getElementById('preview-size');
    
    // Nombre y Tamaño
    if (previewFilename) previewFilename.textContent = file.name;
    if (previewSize) previewSize.textContent = (file.size / 1024).toFixed(1) + ' KB';
    
    // Resetear vistas
    if (previewThumbnail) {
        previewThumbnail.classList.add('hidden');
        previewThumbnail.innerHTML = '';
    }
    if (previewIcon) previewIcon.classList.add('hidden');

    if (file.type.startsWith('image/')) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(file);
        if (previewThumbnail) {
            previewThumbnail.appendChild(img);
            previewThumbnail.classList.remove('hidden');
        }
        // Mostrar botón de editar más notorio (Desktop)
        const editBtn = document.getElementById('btn-edit-desktop-preview');
        if (editBtn) editBtn.classList.remove('hidden');
    } else {
        const editBtn = document.getElementById('btn-edit-desktop-preview');
        if (editBtn) editBtn.classList.add('hidden');

        let iconClass = 'fa-file';
        if (file.type === 'application/pdf') iconClass = 'fa-file-pdf';
        else if (file.type.startsWith('audio/')) iconClass = 'fa-file-audio';
        
        if (previewIcon) {
            previewIcon.innerHTML = `<i class="fas ${iconClass}"></i>`;
            previewIcon.classList.remove('hidden');
        }
    }

    attachmentPreview?.classList.remove('hidden');
}

async function processFile(file) {
    if (file.type.startsWith('image/')) {
        return await ChatUtils.compressToWebP(file);
    }
    return file; // PDF y Audio se suben directo
}

// Función para abrir el editor desde el avance de archivo
function openEditorFromPreview() {
    if (!selectedFile || !selectedFile.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.readAsDataURL(selectedFile);
    reader.onload = (e) => {
        ImageEditor.open(e.target.result, (editedFile) => {
            selectedFile = editedFile;
            const previewImg = attachmentPreview.querySelector('img');
            if (previewImg) previewImg.src = URL.createObjectURL(editedFile);
        });
    };
}

// Zoom y Audio Global
function openZoom(url) {
    const modal = document.getElementById('modal-image-zoom');
    const img = document.getElementById('zoomed-image');
    if (modal && img) {
        img.src = url;
        img.style.transform = 'scale(1)';
        modal.classList.remove('hidden');
    }
}

let activeAudio = null;
let activeAudioBtn = null;
let currentPlayPromise = null; // Para evitar errores de interrupción (play/pause race condition)

// Referencias Reproductor Flotante
const audioPlayerBar = document.getElementById('floating-audio-player');
const playerPlayBtn = document.getElementById('player-play-btn');
const playerTime = document.getElementById('player-time');
const playerTimeline = document.getElementById('player-timeline');
const playerTrack = document.getElementById('player-bar-track');
const playerVolume = document.getElementById('player-volume');
const playerVolumeIcon = document.getElementById('p-v-icon');
const playerDownloadBtn = document.getElementById('player-download-btn');
const playerCloseBtn = document.getElementById('player-close-btn');

function toggleAudio(btn, url) {
    // Asegurar que el reproductor sea visible si se inicia cualquier audio
    audioPlayerBar?.classList.remove('hidden');

    if (activeAudio && activeAudio.src === url) {
        if (activeAudio.paused) {
            if (playerPlayBtn) playerPlayBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            currentPlayPromise = activeAudio.play();
            if (currentPlayPromise !== undefined) {
                currentPlayPromise.then(() => {
                    currentPlayPromise = null;
                    updateAudioUI(true);
                }).catch(e => {
                    currentPlayPromise = null;
                    updateAudioUI(false);
                    console.warn("Interrupted play:", e);
                });
            }
        } else {
            if (currentPlayPromise !== null) {
                currentPlayPromise.then(() => {
                    activeAudio.pause();
                    currentPlayPromise = null;
                    updateAudioUI(false);
                });
            } else {
                activeAudio.pause();
                updateAudioUI(false);
            }
        }
    } else {
        // Detener audio anterior y resetear su botón si existe
        if (activeAudio) {
            if (currentPlayPromise !== null) {
                currentPlayPromise.then(() => {
                    activeAudio.pause();
                    currentPlayPromise = null;
                });
            } else {
                activeAudio.pause();
            }
            if (activeAudioBtn) activeAudioBtn.innerHTML = '<i class="fas fa-play"></i>';
        }

        activeAudio = new Audio(url);
        activeAudioBtn = btn;
        
        // Configurar eventos del nuevo audio
        activeAudio.addEventListener('loadedmetadata', () => {
            if (playerTimeline) {
                playerTimeline.max = activeAudio.duration;
                updatePlayerTimeDisplay();
            }
        });

        activeAudio.addEventListener('timeupdate', () => {
            if (playerTimeline) {
                playerTimeline.value = activeAudio.currentTime;
                updatePlayerProgress();
                updatePlayerTimeDisplay();
            }
        });

        activeAudio.addEventListener('ended', () => {
            updateAudioUI(false);
            if (activeAudioBtn) activeAudioBtn.innerHTML = '<i class="fas fa-play"></i>';
            currentPlayPromise = null;
        });

        // Aplicar volumen actual del slider al nuevo audio
        if (playerVolume) {
            activeAudio.volume = parseFloat(playerVolume.value);
            // Forzar actualización de iconos al iniciar
            playerVolume.dispatchEvent(new Event('input'));
        }

        // Si no es música (es una nota de tarea), ocultar reacciones y poner título genérico
        if (!window.currentDaviMusic) {
            document.getElementById('player-music-reactions')?.classList.add('hidden');
            document.getElementById('player-song-title').textContent = "Nota de audio de la tarea";
            document.getElementById('player-main-icon').innerHTML = '<i class="fas fa-microphone"></i>';
        }

        if (playerPlayBtn) playerPlayBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

        currentPlayPromise = activeAudio.play();
        if (currentPlayPromise !== undefined) {
            currentPlayPromise.then(() => {
                currentPlayPromise = null;
                updateAudioUI(true);
            }).catch(e => {
                currentPlayPromise = null;
                updateAudioUI(false);
                console.warn("Interrupted play:", e);
            });
        }

        // Download link
        if (playerDownloadBtn) {
            playerDownloadBtn.onclick = () => Storage.downloadFile(url, 'audio-nota.mp3', playerDownloadBtn);
        }
    }
}

function updateAudioUI(isPlaying) {
    const icon = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
    if (activeAudioBtn) activeAudioBtn.innerHTML = icon;
    if (playerPlayBtn) {
        playerPlayBtn.innerHTML = icon;
        // Animación de feedback al cambiar estado
        playerPlayBtn.classList.remove('p-btn-press-anim');
        void playerPlayBtn.offsetWidth; // Trigger reflow
        playerPlayBtn.classList.add('p-btn-press-anim');
    }
    
    const iconBox = audioPlayerBar?.querySelector('.player-icon-box');
    if (isPlaying) iconBox?.classList.add('pulse-audio');
    else iconBox?.classList.remove('pulse-audio');
}

function updatePlayerTimeDisplay() {
    if (!activeAudio || !playerTime) return;
    const current = formatTime(activeAudio.currentTime);
    const total = formatTime(activeAudio.duration || 0);
    playerTime.textContent = `${current} / ${total}`;
}

function updatePlayerProgress() {
    if (!activeAudio || !playerTimeline || !playerTrack) return;
    const percentage = (activeAudio.currentTime / activeAudio.duration) * 100;
    playerTrack.style.width = `${percentage}%`;
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// Eventos del Reproductor Flotante
playerPlayBtn?.addEventListener('click', () => {
    if (!activeAudio) return;

    // Feedback instantáneo de clic
    playerPlayBtn.classList.remove('p-btn-press-anim');
    void playerPlayBtn.offsetWidth;
    playerPlayBtn.classList.add('p-btn-press-anim');

    if (activeAudio.paused) {
        if (playerPlayBtn) playerPlayBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        currentPlayPromise = activeAudio.play();
        if (currentPlayPromise !== undefined) {
            currentPlayPromise.then(() => {
                currentPlayPromise = null;
                updateAudioUI(true);
            }).catch(e => {
                currentPlayPromise = null;
                updateAudioUI(false);
                console.warn("Interrupted play:", e);
            });
        }
    } else {
        if (currentPlayPromise !== null) {
            currentPlayPromise.then(() => {
                activeAudio.pause();
                currentPlayPromise = null;
                updateAudioUI(false);
            });
        } else {
            activeAudio.pause();
            updateAudioUI(false);
        }
    }
});

playerTimeline?.addEventListener('input', (e) => {
    if (!activeAudio) return;
    activeAudio.currentTime = e.target.value;
    updatePlayerProgress();
});

playerVolume?.addEventListener('input', (e) => {
    if (!activeAudio) return;
    const vol = parseFloat(e.target.value);
    activeAudio.volume = vol;
    
    // Actualizar indicador visual de volumen (Azul)
    const volTrack = document.getElementById('player-volume-track');
    if (volTrack) volTrack.style.width = `${vol * 100}%`;
    
    // Actualizar iconos de volumen (el pequeño y el grande de la izquierda)
    const bigVolumeIcon = audioPlayerBar?.querySelector('.player-icon-box i');
    
    let iconClass = 'fas fa-volume-up';
    if (vol === 0) iconClass = 'fas fa-volume-mute';
    else if (vol < 0.4) iconClass = 'fas fa-volume-off';
    else if (vol < 0.7) iconClass = 'fas fa-volume-down';

    if (playerVolumeIcon) playerVolumeIcon.className = iconClass;
    if (bigVolumeIcon) bigVolumeIcon.className = iconClass;
});

playerCloseBtn?.addEventListener('click', () => {
    if (activeAudio) {
        if (currentPlayPromise !== null) {
            currentPlayPromise.then(() => {
                activeAudio.pause();
                currentPlayPromise = null;
                if (activeAudioBtn) activeAudioBtn.innerHTML = '<i class="fas fa-play"></i>';
            });
        } else {
            activeAudio.pause();
            if (activeAudioBtn) activeAudioBtn.innerHTML = '<i class="fas fa-play"></i>';
        }
    }
    window.currentDaviMusic = null;
    audioPlayerBar?.classList.add('hidden');
});

// Eventos Zoom
let currentZoom = 1;
document.getElementById('btn-zoom-in')?.addEventListener('click', () => {
    currentZoom += 0.2;
    document.getElementById('zoomed-image').style.transform = `scale(${currentZoom})`;
});
document.getElementById('btn-zoom-out')?.addEventListener('click', () => {
    if (currentZoom > 0.4) {
        currentZoom -= 0.2;
        document.getElementById('zoomed-image').style.transform = `scale(${currentZoom})`;
    }
});
document.getElementById('btn-zoom-reset')?.addEventListener('click', () => {
    currentZoom = 1;
    document.getElementById('zoomed-image').style.transform = `scale(1)`;
});
document.querySelector('.close-zoom')?.addEventListener('click', () => {
    document.getElementById('modal-image-zoom').classList.add('hidden');
});

async function fetchTaskElements(taskId, silent = false) {
    const overlays = [
        document.getElementById('pane-loading-comments'),
        document.getElementById('pane-loading-check'),
        document.getElementById('pane-loading-steps')
    ];

    try {
        // Mostrar cargando solo si no es silencioso
        if (!silent) {
            overlays.forEach(ov => ov?.classList.remove('hidden'));
        }
        
        const data = await Storage.getTaskElements(taskId);
        
        // Si hay nuevos mensajes, activamos autoscroll
        const oldMsg = taskElements.filter(e => e.tipo === 'COMMENT').length;
        const newMsg = data.filter(e => e.tipo === 'COMMENT').length;
        
        taskElements = data;
        renderTaskElements(newMsg > oldMsg);
    } catch (error) {
        if (!silent) console.error("Error al obtener elementos de la tarea:", error);
    } finally {
        if (!silent) {
            setTimeout(() => {
                overlays.forEach(ov => ov?.classList.add('hidden'));
            }, 500);
        }
    }
}

function renderTaskElements(shouldScroll = false) {
    if (!taskChecklist || !taskNumberedList || !taskDiscussion) return;

    // Limpiar contenedores
    taskChecklist.innerHTML = '';
    taskNumberedList.innerHTML = '';
    taskDiscussion.innerHTML = '';

    // Filtrar y separar
    const checklists = taskElements.filter(e => e.tipo === 'CHECKLIST').sort((a, b) => a.posicion - b.posicion);
    const numbered = taskElements.filter(e => e.tipo === 'NUMBERED').sort((a, b) => a.posicion - b.posicion);
    const comments = taskElements.filter(e => e.tipo === 'COMMENT').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    // Renderizar Checklists
    checklists.forEach(item => {
        const div = document.createElement('div');
        div.className = `checklist-item ${item.completada ? 'completed' : ''}`;
        div.innerHTML = `
            <div class="check-box" onclick="toggleTaskElement('${item.id}', ${item.completada})">
                <i class="${item.completada ? 'fas fa-check-square' : 'far fa-square'}"></i>
            </div>
            <span>${item.contenido}</span>
            <button class="delete-element" title="Eliminar" onclick="removeTaskElement('${item.id}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        taskChecklist.appendChild(div);
    });

    // Renderizar Numeradas
    numbered.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'numbered-item';
        div.draggable = true;
        div.dataset.id = item.id;
        div.innerHTML = `
            <div class="drag-handle"><i class="fas fa-ellipsis-v"></i></div>
            <span class="step-number">${index + 1}.</span>
            <span class="step-content">${item.contenido}</span>
            <button class="delete-element" title="Eliminar" onclick="removeTaskElement('${item.id}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        div.addEventListener('dragstart', handleDragStart);
        div.addEventListener('dragover', handleDragOver);
        div.addEventListener('drop', handleDrop);
        div.addEventListener('dragend', handleDragEnd);

        taskNumberedList.appendChild(div);
    });

    // Renderizar Comentarios con Soporte Multimedia y Respuestas
    comments.forEach(item => {
        const isMe = currentUserId && item.usuario_id === currentUserId;
        const div = document.createElement('div');
        div.className = `comment-bubble ${isMe ? 'me' : 'other'}`;
        div.id = `comment-${item.id}`;
        const dateStr = new Date(item.created_at).toLocaleString();
        
        // Soporte para hilos de respuesta (WhatsApp Style)
        let replyHTML = '';
        if (item.reply_to_id) {
            const parent = taskElements.find(e => e.id === item.reply_to_id);
            if (parent) {
                const parentText = parent.contenido ? ChatUtils.linkify(parent.contenido) : (parent.archivo_url ? '📎 Archivo' : 'Mensaje original');
                replyHTML = `
                    <div class="reply-reference" onclick="scrollToMessage('${parent.id}')">
                        <span class="reply-author">${parent.usuario_id === currentUserId ? 'Tú' : (parent.usuario_nombre || 'Usuario')}</span>
                        <span class="reply-text">${parentText}</span>
                    </div>
                `;
            }
        }

        let attachmentHTML = '';
        if (item.archivo_url) {
            const isImage = item.archivo_tipo === 'image' || item.archivo_url.match(/\.(jpeg|jpg|gif|png|webp)$/i);
            const isAudio = item.archivo_tipo === 'audio' || item.archivo_url.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i);
            const isPDF = item.archivo_tipo === 'pdf' || item.archivo_url.match(/\.pdf$/i);

            if (isImage) {
                attachmentHTML = `
                    <div class="comment-image-preview" onclick="ImageViewer.open('${item.archivo_url}', '${item.id}')">
                        <img src="${item.archivo_url}" alt="Adjunto">
                    </div>`;
            } else if (isAudio) {
                attachmentHTML = `
                    <div class="comment-audio-player">
                        <div class="audio-controls">
                            <button class="btn-audio-action" onclick="toggleAudio(this, '${item.archivo_url}')"><i class="fas fa-play"></i></button>
                            <div class="audio-info">Nota de audio</div>
                            <button onclick="event.stopPropagation(); Storage.downloadFile('${item.archivo_url}', 'audio-${item.id}.mp3', this)" class="btn-icon-secondary" style="margin-left: auto; border:none; background:none; cursor:pointer;" title="Descargar audio">
                                <i class="fas fa-download"></i>
                            </button>
                        </div>
                    </div>`;
            } else if (isPDF) {
                attachmentHTML = `
                    <a href="${item.archivo_url}" target="_blank" class="comment-pdf-link">
                        <i class="fas fa-file-pdf" style="color: #ef4444; font-size: 1.2rem;"></i>
                        <span>Ver Documento PDF</span>
                        <i class="fas fa-external-link-alt" style="font-size: 0.7rem; margin-left: 0.5rem; opacity: 0.5;"></i>
                    </a>`;
            }
        }

        const editHistory = item.editado_at 
            ? `<span class="comment-edited">(editado ${new Date(item.editado_at).toLocaleDateString()})</span>` 
            : '';

        div.innerHTML = `
            <div class="comment-header">
                <div>
                    <span class="comment-author">${isMe ? 'Tú' : (item.usuario_nombre || 'Usuario')}</span>
                    <span class="comment-date">${dateStr} ${editHistory}</span>
                </div>
                <div class="comment-actions">
                    <button class="comment-menu-btn" onclick="toggleCommentMenu(event, '${item.id}')">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <div id="dropdown-${item.id}" class="comment-dropdown hidden">
                        <button onclick="replyComment('${item.id}')">
                            <i class="fas fa-reply"></i> Responder
                        </button>
                        ${isMe ? `
                        <button onclick="editCommentUI('${item.id}')">
                            <i class="fas fa-pencil-alt"></i> Editar
                        </button>
                        <button class="danger-btn" onclick="removeTaskElement('${item.id}')">
                            <i class="fas fa-trash-alt"></i> Eliminar
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
            <div class="comment-content">
                ${replyHTML}
                <p>${ChatUtils.linkify(item.contenido)}</p>
                ${attachmentHTML}
            </div>
        `;
        taskDiscussion.appendChild(div);
    });

    // Auto-scroll al final si hay mensajes nuevos o si se pide explícitamente
    if (shouldScroll) {
        taskDiscussion.scrollTop = taskDiscussion.scrollHeight;
    }
}

function toggleCommentMenu(event, id) {
    event.stopPropagation();
    const allDropdowns = document.querySelectorAll('.comment-dropdown');
    allDropdowns.forEach(d => {
        if (d.id !== `dropdown-${id}`) d.classList.add('hidden');
    });
    
    const dropdown = document.getElementById(`dropdown-${id}`);
    dropdown?.classList.toggle('hidden');

    // Cerrar al hacer clic fuera
    const closeMenu = () => {
        dropdown?.classList.add('hidden');
        document.removeEventListener('click', closeMenu);
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 10);
}

async function replyMessage() {
    // ... esta función parece que no existe o tiene otro nombre
}

window.replyToMessageWithEditedImage = async (file, originId) => {
    try {
        const overlay = document.getElementById('comment-uploading-overlay');
        overlay?.classList.remove('hidden');

        const path = `daviprojects/task_${editingTaskId}/${Date.now()}_edited_image.webp`;
        const archiveUrl = await Storage.uploadFile(file, path);

        const posicion = taskElements.filter(e => e.tipo === 'COMMENT').length;
        const newElement = await Storage.addTaskElement({
            taskId: editingTaskId,
            tipo: 'COMMENT',
            contenido: 'He editado esta imagen:',
            posicion: posicion,
            archivo_url: archiveUrl,
            archivo_tipo: 'image',
            reply_to_id: originId
        });
        
        taskElements.push(newElement);
        renderTaskElements(true);
        overlay?.classList.add('hidden');
    } catch (err) {
        console.error("Error al enviar imagen editada:", err);
        alert("No se pudo enviar el mensaje editado.");
    }
};

function replyComment(id) {
    const item = taskElements.find(e => e.id === id);
    if (!item) return;
    currentReplyId = id;

    const preview = document.getElementById('reply-preview');
    const author = document.getElementById('reply-preview-author');
    const text = document.getElementById('reply-preview-text');
    
    author.textContent = item.usuario_id === currentUserId ? 'Respondiendo a ti' : `Respondiendo a ${item.usuario_nombre}`;
    text.textContent = item.contenido || (item.archivo_url ? '📎 Archivo adjunto' : '...');
    
    preview?.classList.remove('hidden');
    document.getElementById('task-comment-input')?.focus();
}

function cancelReply() {
    currentReplyId = null;
    document.getElementById('reply-preview')?.classList.add('hidden');
}

function scrollToMessage(id) {
    const el = document.getElementById(`comment-${id}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.backgroundColor = 'rgba(5, 166, 75, 0.1)';
        setTimeout(() => {
            el.style.backgroundColor = '';
        }, 2000);
    }
}

async function editCommentUI(id) {
    const item = taskElements.find(e => e.id === id);
    if (!item) return;

    const commentDiv = document.getElementById(`comment-${id}`);
    const contentDiv = commentDiv.querySelector('.comment-content');
    const originalContent = item.contenido;

    contentDiv.innerHTML = `
        <textarea class="edit-comment-area">${originalContent}</textarea>
        <div class="edit-actions">
            <button class="btn-cancel-edit" onclick="renderTaskElements()">Cancelar</button>
            <button class="btn-save-edit" onclick="saveEditedComment('${id}')">Guardar</button>
        </div>
    `;
    const textarea = contentDiv.querySelector('textarea');
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

async function saveEditedComment(id) {
    const item = taskElements.find(e => e.id === id);
    if (!item) return;

    const commentDiv = document.getElementById(`comment-${id}`);
    const textarea = commentDiv.querySelector('.edit-comment-area');
    const newContent = textarea.value.trim();

    if (!newContent || newContent === item.contenido) {
        renderTaskElements();
        return;
    }

    try {
        await Storage.updateTaskElement(id, { 
            contenido: newContent,
            editado_at: new Date().toISOString()
        });
        
        // Registrar en historial
        logAction('EDITAR_COMENTARIO', `editó un comentario: "${newContent}"`, editingTaskId);
        
        item.contenido = newContent;
        item.editado_at = new Date().toISOString();
        renderTaskElements();
    } catch (error) {
        console.error("Error al editar comentario:", error);
        showNotification('Error', 'No se pudo guardar el cambio.', true);
    }
}

async function addElementFromUI(type) {
    if (!editingTaskId) return;

    let input;
    let overlay;
    const labels = { 'COMMENT': 'comentario', 'CHECKLIST': 'item al checklist', 'NUMBERED': 'paso numerado' };
    
    if (type === 'COMMENT') {
        input = commentInput;
        overlay = document.getElementById('comment-uploading-overlay');
    } else if (type === 'CHECKLIST') {
        input = checklistInput;
        overlay = document.getElementById('check-uploading-overlay');
    } else if (type === 'NUMBERED') {
        input = numberedInput;
        overlay = document.getElementById('steps-uploading-overlay');
    }

    const content = input.value.trim();
    if (!content && !selectedFile) return;

    // Mostrar bloqueo de subida (Screenblock Input)
    overlay?.classList.remove('hidden');

    let archivo_url = null;
    let archivo_tipo = null;

    try {
        if (type === 'COMMENT' && selectedFile) {
            const processedFile = await processFile(selectedFile);
            const path = `daviprojects/task_${editingTaskId}/${Date.now()}_${processedFile.name}`;
            archivo_url = await Storage.uploadFile(processedFile, path);
            
            if (processedFile.type.startsWith('image/')) archivo_tipo = 'image';
            else if (processedFile.type === 'application/pdf') archivo_tipo = 'pdf';
            else if (processedFile.type.startsWith('audio/')) archivo_tipo = 'audio';
            
            selectedFile = null;
            if (fileInput) fileInput.value = '';
            attachmentPreview?.classList.add('hidden');
        }

        const posicion = taskElements.filter(e => e.tipo === type).length;
        const newElement = await Storage.addTaskElement({
            taskId: editingTaskId,
            tipo: type,
            contenido: content,
            posicion: posicion,
            archivo_url: archivo_url,
            archivo_tipo: archivo_tipo,
            reply_to_id: currentReplyId
        });
        taskElements.push(newElement);
        input.value = '';
        if (type === 'COMMENT') {
            autoResizeTextarea(input);
        }
        renderTaskElements(true); // Siempre scroll al enviar uno propio

        let logDetail = `Añadió un *${labels[type] || 'elemento'}*:\n"${content || (archivo_tipo ? 'Archivo adjunto' : '')}"`;
        let logActionType = 'AÑADIR';

        if (currentReplyId) {
            const parent = taskElements.find(e => e.id === currentReplyId);
            const truncatedParent = parent?.contenido ? (parent.contenido.substring(0, 30) + (parent.contenido.length > 30 ? '...' : '')) : (parent?.archivo_url ? '📎 Archivo' : 'Mensaje');
            logDetail = `Respondió a: *"${truncatedParent}"*\n💬 *Respuesta:* "${content}"`;
            logActionType = 'RESPONDER';
        }
        
        logAction(logActionType, logDetail, editingTaskId);
        cancelReply();
    } catch (error) {
        console.error("Error al añadir elemento:", error);
        showCustomAlert("Error", "No se pudo subir la información o el archivo.", "error");
    } finally {
        // Quitar bloqueo de subida
        overlay?.classList.add('hidden');
    }
}

async function toggleTaskElement(id, currentStatus) {
    try {
        const item = taskElements.find(e => e.id === id);
        if (!item) return;

        await Storage.updateTaskElement(id, { completada: !currentStatus });
        item.completada = !currentStatus;
        renderTaskElements();

        // Registrar en historial
        const accion = item.completada ? 'COMPLETAR' : 'PENDIENTE';
        const detalle = item.completada ? `marcó como completada: "${item.contenido}"` : `marcó como pendiente: "${item.contenido}"`;
        logAction(accion, detalle, editingTaskId);
    } catch (error) {
        console.error("Error al actualizar checklist:", error);
    }
}

async function removeTaskElement(id) {
    try {
        const item = taskElements.find(e => e.id === id);
        if (!item) return;

        await Storage.deleteTaskElement(id);
        taskElements = taskElements.filter(e => e.id !== id);
        renderTaskElements();

        // Registrar en historial
        const labels = { 'COMMENT': 'comentario', 'CHECKLIST': 'item de checklist', 'NUMBERED': 'paso numerado' };
        logAction('ELIMINAR', `eliminó un ${labels[item.tipo] || 'elemento'}: *"${item.contenido}"*`, editingTaskId);
    } catch (error) {
        console.error("Error al eliminar elemento:", error);
    }
}

// DRAG & DROP
let draggedElementId = null;

function handleDragStart(e) {
    draggedElementId = this.dataset.id;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const target = e.target.closest('.numbered-item');
    if (target && target.dataset.id !== draggedElementId) {
        target.classList.add('drag-over');
    }
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.numbered-item').forEach(el => el.classList.remove('drag-over'));
}

async function handleDrop(e) {
    e.preventDefault();
    const target = e.target.closest('.numbered-item');
    if (!target || target.dataset.id === draggedElementId) return;

    const targetId = target.dataset.id;
    
    const items = taskElements.filter(e => e.tipo === 'NUMBERED').sort((a, b) => a.posicion - b.posicion);
    const draggedIdx = items.findIndex(i => i.id === draggedElementId);
    const targetIdx = items.findIndex(i => i.id === targetId);

    const [draggedItem] = items.splice(draggedIdx, 1);
    items.splice(targetIdx, 0, draggedItem);

    // Actualizar posiciones localmente
    const updates = items.map((item, idx) => ({ id: item.id, posicion: idx }));
    
    updates.forEach(upd => {
        const found = taskElements.find(e => e.id === upd.id);
        if (found) found.posicion = upd.posicion;
    });

    renderTaskElements();

    try {
        await Storage.reorderTaskElements(updates);
        logAction('REORDENAR', 'reorganizó los pasos numerados de la tarea', editingTaskId);
    } catch (error) {
        console.error("Error al reordenar elementos:", error);
    }
}


// Listeners para botones de añadir
document.getElementById('btn-add-checklist')?.addEventListener('click', () => addElementFromUI('CHECKLIST'));
document.getElementById('btn-add-numbered')?.addEventListener('click', () => addElementFromUI('NUMBERED'));
document.getElementById('btn-save-comment')?.addEventListener('click', () => addElementFromUI('COMMENT'));

// Permitir Enter en los inputs
checklistInput?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addElementFromUI('CHECKLIST'); });
numberedInput?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addElementFromUI('NUMBERED'); });
commentInput?.addEventListener('keypress', (e) => { if(e.key === 'Enter') addElementFromUI('COMMENT'); });

async function initGlobalRealtime() {
    if (taskElementsChannel) return; // Ya está inicializado

    const session = await AuthService.getSession();
    if (session?.access_token) {
        supabaseClient.realtime.setAuth(session.access_token);
    }

    console.log("Iniciando suscripción Realtime Global (Desktop)...");
    
    taskElementsChannel = supabaseClient
        .channel('global-task-elements')
        .on(
            'postgres_changes',
            {
                event: '*', // Escuchar INSERT, UPDATE y DELETE
                schema: 'public',
                table: 'daviprojects_elementos_tarea'
            },
            (payload) => {
                console.log('⚡ Evento Realtime detectado:', payload.eventType, payload);
                const newEl = payload.new;
                const oldEl = payload.old;
                
                // 1. Validar si el cambio afecta a la tarea que estamos viendo
                // Si es DELETE, a menudo no viene tarea_id en oldEl, así que buscamos por ID en nuestra lista actual
                const affectedTaskId = newEl ? newEl.tarea_id : (oldEl ? oldEl.tarea_id : null);
                const isRelevant = (typeof editingTaskId !== 'undefined' && editingTaskId === affectedTaskId) || 
                                  (payload.eventType === 'DELETE' && oldEl && taskElements.some(e => e.id === oldEl.id));
                
                if (isRelevant) {
                    if (payload.eventType === 'INSERT') {
                        // Optimización: No re-peticionar todo, solo añadir el nuevo si no está
                        const exists = taskElements.some(e => e.id === newEl.id);
                        if (!exists) {
                            console.log('📝 Añadiendo nuevo elemento vía Realtime...');
                            taskElements.push(newEl);
                            renderTaskElements(true); // Scroll si es nuevo
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        console.log('🔄 Actualizando elemento vía Realtime...');
                        const index = taskElements.findIndex(e => e.id === newEl.id);
                        if (index !== -1) {
                            taskElements[index] = newEl;
                            renderTaskElements(false); // No scroll al editar
                        } else {
                            // Si no lo tenemos por alguna razón, refrescar todo
                            fetchTaskElements(editingTaskId, true);
                        }
                    } else if (payload.eventType === 'DELETE') {
                        console.log('🗑️ Eliminando elemento vía Realtime...');
                        taskElements = taskElements.filter(e => e.id !== oldEl.id);
                        renderTaskElements(false);
                    }
                }

                // 2. Gestionar notificaciones (solo si no somos nosotros)
                if (payload.eventType === 'INSERT' && newEl && newEl.usuario_id !== currentUserId) {
                    playNotificationSound();
                    
                    const labels = {
                        'COMMENT': 'nuevo comentario',
                        'CHECKLIST': 'nuevo elemento de checklist',
                        'NUMBERED': 'nuevo elemento de lista'
                    };
                    
                    const typeLabel = labels[newEl.tipo] || 'nuevo elemento';
                    const userLabel = newEl.usuario_nombre || 'Un usuario';
                    
                    showToast(typeLabel, userLabel, newEl.contenido, newEl.tarea_id, newEl.tipo);
                    showPushNotification(typeLabel, userLabel, newEl.contenido, newEl.tarea_id, newEl.tipo);
                }
            }
        )
        .subscribe();
}

function playNotificationSound() {
    console.log('🔈 Intentando reproducir sonido...');
    const audio = document.getElementById('notifSound') || new Audio('https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.7/sounds/button_tiny.mp3');
    if (audio) {
        audio.currentTime = 0;
        audio.play()
            .then(() => console.log('✅ Sonido reproducido con éxito'))
            .catch(e => console.warn("❌ No se pudo reproducir el sonido de notificación:", e));
    }
}

function showPushNotification(type, user, content, taskId, targetType = null) {
    console.log('📲 Validando permisos para Push...', Notification.permission);
    
    // Omitir si el usuario está en la ventana actualmente
    if (window.NotificationHelper && !NotificationHelper.shouldShowNotification()) {
        console.log('🚫 Notificación push omitida: El usuario está en la ventana.');
        return;
    }

    if (!("Notification" in window)) return;

    if (Notification.permission === "granted") {
        try {
            const title = `🔔 ${user}: ${type}`;
            const body = content && content.length > 100 ? content.substring(0, 100) + '...' : (content || '(Adjunto)');
            
            console.log('🚀 Lanzando Notificación Push:', { title, body });
            const n = new Notification(title, { 
                body,
                icon: '/img/logo.webp', 
                badge: '/img/logo.webp',
                requireInteraction: true 
            });
            
            n.onclick = () => { 
                window.focus(); 
                openTaskModal(taskId, targetType);
                n.close(); 
            };
        } catch (e) {
            console.error("❌ Error al crear la notificación push:", e);
        }
    } else {
        console.warn('⚠️ Permisos de notificación no concedidos:', Notification.permission);
    }
}

function showToast(type, user, content, taskId, targetType = null) {
    console.log('🍞 Mostrando Toast UI...');
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    // Limitar longitud del contenido para el toast
    let displayContent = content || '';
    if (displayContent.length > 80) displayContent = displayContent.substring(0, 80) + '...';

    toast.innerHTML = `
        <div class="toast-header">
            <span class="toast-type">${type}</span>
            <span class="toast-user">${user}</span>
        </div>
        <div class="toast-body">${displayContent || '(Sin contenido)'}</div>
        <button class="toast-btn">Ver Tarea</button>
    `;

    toast.querySelector('.toast-btn').onclick = () => {
        openTaskModal(taskId, targetType);
        toast.style.animation = 'fadeOutToast 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    };

    container.appendChild(toast);

    // Auto eliminar después de 8 segundos
    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'fadeOutToast 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
}

// --- FUNCIONES DE MÚSICA DESKTOP ---
async function showMusicView() {
    try {
        currentProject = null;
        const projectNameEl = document.getElementById('current-project-name');
        if (projectNameEl) projectNameEl.textContent = "DreamNotes Music Studio";

        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const musicView = document.getElementById('music-view');
        if (musicView) musicView.classList.remove('hidden');

        if (window.innerWidth <= 1024) {
            document.getElementById('sidebar')?.classList.add('closed');
        }
        document.getElementById('view-controls')?.classList.add('hidden');
        document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
        document.getElementById('nav-music')?.classList.add('active');

        renderMusicList();
    } catch (err) {
        console.error("Error en showMusicView:", err);
    }
}

// --- MÓDULO MÚSICA DESKTOP ---
let desktopMusicData = [];
let isReactingDesktop = false;
let currentMusicFilter = 'all';
let musicViewMode = 'grid'; // 'grid' o 'list'

// Configuración de Caché DreamNotes Music
const MUSIC_CACHE_KEY = 'dreamnotes_music_cache';
const MUSIC_CACHE_DAYS = 7;

function getMusicCacheDesktop() {
    const cached = localStorage.getItem(MUSIC_CACHE_KEY);
    if (!cached) return null;
    try {
        const parsed = JSON.parse(cached);
        const days = (Date.now() - parsed.timestamp) / (1000 * 60 * 60 * 24);
        return days > MUSIC_CACHE_DAYS ? null : parsed.data;
    } catch (e) { return null; }
}

function saveMusicCacheDesktop(data) {
    localStorage.setItem(MUSIC_CACHE_KEY, JSON.stringify({
        timestamp: Date.now(),
        data: data
    }));
}

function getStarColorDesktop(percentage) {
    if (percentage === 0) return '#cbd5e1'; 
    if (percentage < 40) return '#ef4444';  
    if (percentage < 75) return '#f97316';  
    return '#facc15';                       
}

async function renderMusicList(skipFetch = false) {
    const musicList = document.getElementById('music-list');
    if (!musicList) return;
    
    window.currentDaviMusic = null; 

    // 1. Intentar cargar desde caché para vista instantánea (Optimista)
    const cachedData = getMusicCacheDesktop();
    if (cachedData && !skipFetch && desktopMusicData.length === 0) {
        desktopMusicData = cachedData;
        console.log("Cargando música desde caché (Vista Instantánea)...");
        _doRenderMusicList(); 
        
        // Actualizar en segundo plano sin bloquear al usuario
        setTimeout(async () => {
            try {
                const freshData = await Storage.getMusic();
                saveMusicCacheDesktop(freshData);
                // Si la data cambió, re-renderizar silenciosamente
                if (JSON.stringify(freshData) !== JSON.stringify(desktopMusicData)) {
                    desktopMusicData = freshData;
                    _doRenderMusicList();
                }
            } catch (e) { console.error("Error actualizando música en background (PC):", e); }
        }, 300);
        return;
    }

    // 2. Si no hay caché o es un refresh forzado, mostrar Screenlocker real
    if (!skipFetch) showLoading();

    try {
        if (!skipFetch) {
            desktopMusicData = await Storage.getMusic();
            saveMusicCacheDesktop(desktopMusicData);
        }
        _doRenderMusicList();
    } catch (e) {
        console.error("Error al cargar música:", e);
        musicList.innerHTML = `<p class="text-danger p-4">Error de conexión. Revisa tu internet.</p>`;
    } finally {
        if (!skipFetch) hideLoading();
    }
}

function _doRenderMusicList() {
    const musicList = document.getElementById('music-list');
    if (!musicList) return;
    
    // Actualizar estadísticas del Hub
    updateMusicStats();
    
    // Renderizar mini-recientes (los últimos 3 subidos)
    renderRecentMini();

    // Aplicar filtros y búsqueda
    const searchTerm = document.getElementById('music-search-input')?.value.toLowerCase() || '';
    
    // Configurar modo de vista
    if (musicList) {
        musicList.className = `music-grid ${musicViewMode}-view`;
    }

    let filtered = desktopMusicData;
    
    // Filtro por categoría (Sidebar)
    if (currentMusicFilter === 'favs') {
        filtered = filtered.filter(s => (s.user_likes_count || 0) > 0);
    } else if (currentMusicFilter === 'projects') {
        filtered = filtered.filter(s => !!s.proyecto_id);
    }

    // Filtro por búsqueda
    if (searchTerm) {
        filtered = filtered.filter(s => 
            s.nombre.toLowerCase().includes(searchTerm) || 
            (s.descripcion_corta && s.descripcion_corta.toLowerCase().includes(searchTerm))
        );
    }
    
    if (!filtered || filtered.length === 0) {
        musicList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 5rem; border: 2px dashed #e2e8f0; border-radius: 20px; color: #94a3b8;">
            <i class="fas fa-search fa-3x" style="opacity: 0.1; margin-bottom: 1rem;"></i>
            <p>No se encontraron temas con esos criterios.</p>
        </div>`;
        return;
    }

    musicList.innerHTML = '';

    // Si es modo lista, añadir encabezados decorativos
    if (musicViewMode === 'list') {
        const header = document.createElement('div');
        header.className = 'music-list-header';
        header.innerHTML = `
            <div class="h-cover"></div>
            <div class="h-info">Título y descripción</div>
            <div class="h-rating">Rating</div>
            <div class="h-action"></div>
        `;
        musicList.appendChild(header);
    }

    filtered.forEach(song => {
        const totalRec = (song.likes_total || 0) + (song.dislikes_total || 0);
        const percentage = totalRec > 0 ? Math.round((song.likes_total || 0) / totalRec * 100) : 0;
            const starColor = getStarColorDesktop(percentage);
            
            const coverImg = song.cover_url || '';

            const card = document.createElement('div');
            card.className = 'music-card fadeIn';
            card.id = `music-card-pc-${song.id}`;
            
            card.innerHTML = `
                <div class="music-card-cover" style="${coverImg ? `background-image: url(${coverImg}); background-size: cover; background-position: center;` : ''}">
                    ${!coverImg ? '<i class="fas fa-compact-disc"></i>' : ''}
                    <button class="btn-play-hover" onclick="playMusicDesktop('${song.id}')">
                        <i class="fas fa-play"></i>
                    </button>
                </div>
                <div class="music-card-info" onclick="editMusicDesktop('${song.id}')" style="cursor: pointer;">
                    <h4>${song.nombre}</h4>
                    <p>${song.descripcion_corta || 'Producción DreamNotes Music'}</p>
                </div>
                ${totalRec > 0 ? `
                <div class="music-card-badge" style="color: ${starColor}">
                    <i class="fas fa-star"></i> <span>${percentage}%</span>
                </div>
                ` : ''}`;
            musicList.appendChild(card);
        });
}

function updateMusicStats() {
    const totalCountEl = document.getElementById('music-total-count');
    const totalLikesEl = document.getElementById('music-total-likes');
    
    if (totalCountEl) totalCountEl.textContent = desktopMusicData.length;
    if (totalLikesEl) {
        // Contar solo temas que el usuario actual ha marcado como "like"
        const myFavs = desktopMusicData.filter(s => (s.user_likes_count || 0) > 0).length;
        totalLikesEl.textContent = myFavs;
    }
}

function renderRecentMini() {
    const list = document.getElementById('music-recent-small');
    if (!list) return;

    // Tomar los últmos 3 (ya vienen ordenados por created_at desc de Storage)
    const lastThree = [...desktopMusicData].slice(0, 3);

    list.innerHTML = lastThree.length ? '' : '<p class="text-muted small px-3">Aquí verás tus últimos temas.</p>';

    lastThree.forEach(song => {
        const item = document.createElement('div');
        item.className = 'recent-toast-item';
        
        const artistName = song.artista || 'DreamNotes Music';

        item.innerHTML = `
            <div class="recent-toast-icon">
                <i class="fas fa-play"></i>
            </div>
            <div class="recent-toast-info">
                <div class="recent-toast-title">${song.nombre}</div>
                <div class="recent-toast-sub">${artistName}</div>
            </div>
        `;
        item.onclick = () => playMusicDesktop(song.id);
        list.appendChild(item);
    });
}

function editMusicDesktop(songId) {
    const song = desktopMusicData.find(s => s.id === songId);
    if (!song) return;

    const modal = document.getElementById('modal-upload-music');
    if (!modal) return;

    // Guardar ID en dataset para saber que es edición
    modal.dataset.editId = song.id;

    // Cambiar UI a modo edición
    modal.querySelector('h3').innerHTML = '<i class="fas fa-edit" style="color: #05a64b;"></i> DreamNotes Studio: Editar';
    document.getElementById('btn-do-upload-music').innerText = 'Actualizar Cambios';

    // Rellenar campos básicos
    document.getElementById('pc-music-name').value = song.nombre || '';
    document.getElementById('pc-music-desc').value = song.descripcion_corta || '';
    document.getElementById('pc-music-lyrics').value = song.letra || '';

    // Feedback de audio existente
    const uploadDesign = document.querySelector('.file-upload-design');
    if (uploadDesign) {
        uploadDesign.innerHTML = `
            <i class="fas fa-check-circle" style="color: #05a64b;"></i>
            <span style="color: #05a64b; font-weight: 600;">Audio Sincronizado</span>
            <span style="font-size: 0.7rem; opacity: 0.7;">Suelta un archivo nuevo si deseas reemplazarlo</span>
        `;
    }

    // Cargar proyectos y seleccionar el actual
    loadMusicProjectsPC().then(() => {
        document.getElementById('pc-music-project').value = song.proyecto_id || '';
    });

    modal.classList.remove('hidden');
}

function playMusicDesktop(songId) {
    const song = desktopMusicData.find(s => s.id === songId);
    if (!song) return;

    window.currentDaviMusic = song;
    
    // Actualizar metadatos en el player
    const titleEl = document.getElementById('player-song-title');
    if (titleEl) titleEl.textContent = song.nombre;
    
    const iconBox = document.getElementById('player-main-icon');
    if (iconBox) iconBox.innerHTML = '<i class="fas fa-compact-disc fa-spin"></i>';

    // Mostrar sección de reacciones en el player
    const reactBox = document.getElementById('player-music-reactions');
    if (reactBox) {
        reactBox.classList.remove('hidden');
        updatePlayerReactionsUI(song);
    }

    // Cambiar texto de descarga
    if (playerDownloadBtn) {
        playerDownloadBtn.onclick = () => Storage.downloadFile(song.url_archivo, `${song.nombre}.mp3`, playerDownloadBtn);
    }

    // Iniciar reproducción usando la lógica global existente
    toggleAudio(null, song.url_archivo);
}

function updatePlayerReactionsUI(song) {
    const likeBtn = document.getElementById('player-btn-like');
    const dislikeBtn = document.getElementById('player-btn-dislike');
    const likeCount = document.getElementById('player-count-like');
    const dislikeCount = document.getElementById('player-count-dislike');

    if (likeBtn) {
        likeBtn.className = `p-btn-react ${song.user_likes_count > 0 ? 'active-like' : ''}`;
        likeBtn.onclick = (e) => handleMusicReactionDesktop(e, song.id, 'like');
    }
    if (dislikeBtn) {
        dislikeBtn.className = `p-btn-react ${song.user_dislikes_count > 0 ? 'active-dislike' : ''}`;
        dislikeBtn.onclick = (e) => handleMusicReactionDesktop(e, song.id, 'dislike');
    }
    if (likeCount) likeCount.textContent = song.likes_total || 0;
    if (dislikeCount) dislikeCount.textContent = song.dislikes_total || 0;
}

async function handleMusicReactionDesktop(event, musicId, type) {
    if (isReactingDesktop) return;
    isReactingDesktop = true;

    // Buscamos la canción en los datos actuales
    let targetSong = desktopMusicData.find(s => s.id === musicId);
    if (!targetSong) { isReactingDesktop = false; return; }

    const clickBtn = event.currentTarget;
    const originalContent = clickBtn ? clickBtn.innerHTML : '';
    const originalColor = clickBtn ? clickBtn.style.color : '';

    if (clickBtn) {
        clickBtn.style.transform = "scale(0.85)";
        clickBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
        clickBtn.disabled = true;
    }

    // Backup del estado previo por si falla la DB
    const backup = {
        likes: targetSong.likes_total || 0,
        dislikes: targetSong.dislikes_total || 0,
        uLike: targetSong.user_likes_count || 0,
        uDislike: targetSong.user_dislikes_count || 0
    };

    try {
        const result = await Storage.toggleMusicReaction(musicId, type);
        
        if (result && result.success) {
            // Sincronización absoluta con lo que devolvió la DB
            targetSong.likes_total = result.likes_total;
            targetSong.dislikes_total = result.dislikes_total;
            
            // Actualizar estado del usuario según la acción confirmada
            if (type === 'like') {
                if (backup.uLike > 0) {
                    targetSong.user_likes_count = 0;
                } else {
                    targetSong.user_likes_count = 1;
                    targetSong.user_dislikes_count = 0;
                }
            } else {
                if (backup.uDislike > 0) {
                    targetSong.user_dislikes_count = 0;
                } else {
                    targetSong.user_dislikes_count = 1;
                    targetSong.user_likes_count = 0;
                }
            }

            // Sincronización absoluta con el objeto del reproductor si es el mismo tema
            if (window.currentDaviMusic && window.currentDaviMusic.id === musicId) {
                window.currentDaviMusic.likes_total = targetSong.likes_total;
                window.currentDaviMusic.dislikes_total = targetSong.dislikes_total;
                window.currentDaviMusic.user_likes_count = targetSong.user_likes_count;
                window.currentDaviMusic.user_dislikes_count = targetSong.user_dislikes_count;
            }
        }
    } catch (e) {
        console.error("Error pc reaction:", e);
        // Error -> Volvemos al backup
        targetSong.likes_total = backup.likes;
        targetSong.dislikes_total = backup.dislikes;
        targetSong.user_likes_count = backup.uLike;
        targetSong.user_dislikes_count = backup.uDislike;
    } finally {
        isReactingDesktop = false;
        
        // Timeout para asegurar que la DB y el DOM estÃ©n en sincronÃa absoluta
        setTimeout(() => {
            if (clickBtn) {
                clickBtn.style.transform = "scale(1)";
                clickBtn.disabled = false;
                
                // Forzar reconstrucciÃ³n del contenido para asegurar que los IDs del contador existan
                if (type === 'like') {
                    clickBtn.innerHTML = `<i class="fas fa-heart"></i> <span id="player-count-like">${targetSong.likes_total || 0}</span>`;
                } else {
                    clickBtn.innerHTML = `<i class="fas fa-heart-broken"></i> <span id="player-count-dislike">${targetSong.dislikes_total || 0}</span>`;
                }
            }
            // REDIBUJAR TODA LA UI (Card y Player)
            updateMusicCardUIDesktop(musicId, targetSong);
        }, 50);
    }
}

function updateMusicCardUIDesktop(musicId, song) {
    // Si esta canción es la que suena en el player, actualizar el player
    if (window.currentDaviMusic && window.currentDaviMusic.id === musicId) {
        updatePlayerReactionsUI(song);
    }

    const card = document.getElementById(`music-card-pc-${musicId}`);
    if (!card) return;

    // Actualizar el Badge de Rating en la card si existe
    const total = (song.likes_total || 0) + (song.dislikes_total || 0);
    const pct = total > 0 ? Math.round((song.likes_total || 0) / total * 100) : 0;
    const color = getStarColorDesktop(pct);
    let badge = card.querySelector('.fa-star')?.parentElement;

    if (total > 0) {
        if (!badge) {
            // Si no tiene badge y ahora lo necesita (aunque las cards nuevas siempre tienen la estructura)
            badge = document.createElement('div');
            badge.style.cssText = `position: absolute; top: 12px; right: 12px; display: flex; align-items: center; gap: 4px; font-weight: 800; font-size: 0.75rem; background: rgba(255,255,255,0.9); padding: 4px 8px; border-radius: 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); transition: all 0.3s;`;
            card.querySelector('.music-card-cover')?.appendChild(badge);
        }
        badge.style.color = color;
        badge.innerHTML = `<i class="fas fa-star"></i> ${pct}%`;
    } else if (badge) {
        badge.remove();
    }
}

// Inicializar clics de Dashbard y navegación
document.addEventListener('DOMContentLoaded', () => {
    // Escuchar búsqueda de música
    const musicSearch = document.getElementById('music-search-input');
    if (musicSearch) {
        musicSearch.addEventListener('input', () => renderMusicList(true));
    }

    // Toggle Vista Grilla/Lista
    const btnGrid = document.getElementById('btn-music-grid');
    const btnList = document.getElementById('btn-music-list');
    if (btnGrid && btnList) {
        btnGrid.onclick = () => {
            musicViewMode = 'grid';
            btnGrid.classList.add('active');
            btnList.classList.remove('active');
            renderMusicList(true);
        };
        btnList.onclick = () => {
            musicViewMode = 'list';
            btnList.classList.add('active');
            btnGrid.classList.remove('active');
            renderMusicList(true);
        };
    }

    // Escuchar filtros de la sidebar de música
    document.querySelectorAll('.music-nav-filters li').forEach(li => {
        li.addEventListener('click', (e) => {
            document.querySelectorAll('.music-nav-filters li').forEach(el => el.classList.remove('active'));
            li.classList.add('active');
            currentMusicFilter = li.dataset.filter;
            
            // Actualizar título de la sección
            const title = document.getElementById('music-list-title');
            if (title) {
                if (currentMusicFilter === 'all') title.textContent = "Explorar Todo";
                else if (currentMusicFilter === 'favs') title.textContent = "Mis Favoritos";
                else if (currentMusicFilter === 'projects') title.textContent = "Temas de Proyectos";
            }

            renderMusicList(true);
        });
    });

    const btnDashMusic = document.getElementById('btn-dashboard-music');
    if (btnDashMusic) btnDashMusic.onclick = showMusicView;

    const btnDashIdea = document.getElementById('btn-dashboard-new-idea');
    if (btnDashIdea) btnDashIdea.onclick = openIdeaModal;

    const btnUploadMusic = document.getElementById('btn-upload-music');
    if (btnUploadMusic) {
        btnUploadMusic.onclick = () => {
            const modal = document.getElementById('modal-upload-music');
            if (modal) {
                // Reset a modo subida
                delete modal.dataset.editId;
                modal.querySelector('h3').innerHTML = '<i class="fas fa-record-vinyl fa-spin" style="color: #05a64b;"></i> DreamNotes Music Studio';
                document.getElementById('btn-do-upload-music').innerText = 'Sincronizar y Guardar';
                
                // Limpiar campos
                document.getElementById('pc-music-name').value = '';
                document.getElementById('pc-music-desc').value = '';
                document.getElementById('pc-music-lyrics').value = '';
                const fileInput = document.getElementById('pc-music-file');
                if (fileInput) fileInput.value = '';

                // Reset label del diseño de carga
                const uploadDesign = document.querySelector('.file-upload-design');
                if (uploadDesign) {
                    uploadDesign.innerHTML = `
                        <i class="fas fa-cloud-upload-alt"></i>
                        <span>Arrastra o selecciona tu obra maestra</span>
                    `;
                }

                modal.classList.remove('hidden');
                loadMusicProjectsPC();
            }
        };
    }

    const btnCloseMusic = document.getElementById('close-music-modal');
    if (btnCloseMusic) {
        btnCloseMusic.onclick = () => document.getElementById('modal-upload-music').classList.add('hidden');
    }

    const btnCancelMusic = document.getElementById('btn-cancel-music-pc');
    if (btnCancelMusic) {
        btnCancelMusic.onclick = () => document.getElementById('modal-upload-music').classList.add('hidden');
    }

    // Drag and Drop & Feedback para el modal de música
    const dropZone = document.querySelector('.file-upload-wrapper');
    const fileInput = document.getElementById('pc-music-file');
    const uploadDesign = document.querySelector('.file-upload-design');

    if (dropZone && fileInput) {
        // Prevenir comportamiento por defecto
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
            }, false);
        });

        // Feedback visual al arrastrar
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.add('dragging'), false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragging'), false);
        });

        // Manejar soltar archivos
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files && files.length > 0) {
                fileInput.files = files;
                updateMusicFileLabel(files[0].name);
            }
        }, false);

        // Feedback al seleccionar vía click tradicional
        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                updateMusicFileLabel(e.target.files[0].name);
            }
        });

        function updateMusicFileLabel(fileName) {
            if (uploadDesign) {
                uploadDesign.innerHTML = `
                    <i class="fas fa-file-audio" style="color: #05a64b;"></i>
                    <span style="color: #05a64b; font-weight: 600;">${fileName}</span>
                    <span style="font-size: 0.7rem; opacity: 0.7;">Listo para sincronizar</span>
                `;
            }
        }
    }

    const btnDoUpload = document.getElementById('btn-do-upload-music');
    if (btnDoUpload) {
        btnDoUpload.onclick = async () => {
            const modal = document.getElementById('modal-upload-music');
            const editId = modal?.dataset.editId;
            
            const name = document.getElementById('pc-music-name').value;
            const desc = document.getElementById('pc-music-desc').value;
            const fileInput = document.getElementById('pc-music-file');
            const projectId = document.getElementById('pc-music-project').value;
            const lyrics = document.getElementById('pc-music-lyrics').value;

            if (!name || (!editId && (!fileInput || !fileInput.files[0]))) {
                alert("Completa el nombre y el archivo.");
                return;
            }

            btnDoUpload.disabled = true;
            btnDoUpload.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Procesando...';

            try {
                let publicUrl = null;
                if (fileInput && fileInput.files && fileInput.files[0]) {
                    const file = fileInput.files[0];
                    const fileName = `${Date.now()}_${file.name}`;
                    const path = `daviprojects/musicas/${fileName}`;
                    publicUrl = await Storage.uploadFile(file, path);
                }

                if (editId) {
                    await Storage.updateMusic(editId, {
                        nombre: name,
                        descripcion_corta: desc,
                        proyecto_id: projectId || null,
                        url_archivo: publicUrl, // Si es null, el store debería ignorarlo o mantener el anterior
                        letra: lyrics
                    });
                } else {
                    await Storage.addMusic({
                        nombre: name,
                        descripcion_corta: desc,
                        proyecto_id: projectId || null,
                        url_archivo: publicUrl,
                        letra: lyrics
                    });
                }

                modal.classList.add('hidden');
                renderMusicList();
                
                // Limpiar
                document.getElementById('pc-music-name').value = '';
                document.getElementById('pc-music-desc').value = '';
                document.getElementById('pc-music-lyrics').value = '';
                if (fileInput) fileInput.value = '';
                delete modal.dataset.editId;
            } catch (err) {
                console.error(err);
                alert("Error al guardar música.");
            } finally {
                btnDoUpload.disabled = false;
                btnDoUpload.innerText = editId ? 'Actualizar Cambios' : 'Sincronizar y Guardar';
            }
        };
    }
});

async function loadMusicProjectsPC() {
    const select = document.getElementById('pc-music-project');
    if (!select) return;
    try {
        const projects = await Storage.getProjects();
        select.innerHTML = '<option value="">Sin vincular</option>';
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nombre;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error(e);
    }
}

// Register Service Worker
// Se maneja centralizado en NotificationHelper
if (window.NotificationHelper && !('serviceWorker' in navigator && navigator.serviceWorker.controller)) {
    // Si por alguna razón no se registró en el HTML, lo intentamos aquí discretamente
    // Pero el HTML ya se encarga ahora.
}


