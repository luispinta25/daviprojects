// Variables de estado
let projects = [];
let allTasks = []; // Todas las tareas de todos los proyectos (para métricas)
let currentTasks = []; // Tareas del proyecto seleccionado
let currentProjectId = null;
let currentTaskId = null;
let currentAttachment = null;
let currentMobileReplyId = null; 
let currentUserIdMobile = null; 
let taskElementsChannelMobile = null; // Canal Realtime para elementos de tarea
let currentViewId = 'mobile-gallery-view';

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

// --- NAVEGACIÓN ENTRE TABS ---
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('tab-btn')) {
        const tabId = e.target.dataset.tab;
        
        // Botones
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');

        // Contenidos
        document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
        document.getElementById(tabId).classList.remove('hidden');
    }
});
let currentStatusFilter = 'TODO';
const STATUS_FILTER_PRIORITY = ['TODO', 'DOING', 'DONE', 'REVIEW', 'REJECTED'];
let currentHistoryFolder = null; // Carpeta de historial seleccionada
let currentElements = []; // Elementos de la tarea actual

// --- IDEAS MOBILE ---
let mobileIdeas = [];
let selectedIdeaColor = '#fff9c4';
let mediaRecorder = null;
let audioChunks = [];
let recordedAudioBlob = null;

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = () => {
            recordedAudioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
            document.getElementById('mob-record-status').classList.add('hidden');
            document.getElementById('mob-audio-preview').classList.remove('hidden');
        };

        mediaRecorder.start();
        document.getElementById('mob-btn-record').classList.add('recording');
        document.getElementById('mob-record-status').textContent = "Grabando... Pulsa para detener";
    } catch (err) {
        console.error("Error al acceder al micro:", err);
        showMobileToast("Error", "No se pudo acceder al micrófono", true);
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        document.getElementById('mob-btn-record').classList.remove('recording');
    }
}

function discardMobileAudio() {
    recordedAudioBlob = null;
    document.getElementById('mob-audio-preview').classList.add('hidden');
    document.getElementById('mob-record-status').classList.remove('hidden');
    document.getElementById('mob-record-status').textContent = "Grabar nota de voz";
}

const PROJECT_QUOTES = [
    { text: "Lo que no se define no se puede medir. Lo que no se mide, no se puede mejorar.", author: "Peter Drucker" },
    { text: "La planificación a largo plazo no es pensar en decisiones futuras, sino en el futuro de las decisiones presentes.", author: "Peter Drucker" },
    { text: "Un proyecto sin un camino crítico es como un barco sin timón.", author: "D. Meyer" },
    { text: "Cualquier cosa que valga la pena hacer, vale la pena hacerla bien.", author: "Lord Chesterfield" },
    { text: "El trabajo en equipo es la capacidad de trabajar juntos hacia una visión común.", author: "Andrew Carnegie" },
    { text: "La mejor forma de predecir el futuro es creándolo.", author: "Peter Drucker" },
    { text: "El éxito es la suma de pequeños esfuerzos que se repiten cada día.", author: "Robert Collier" }
];

const IDEA_QUOTES = [
    { text: "La creatividad es la inteligencia divirtiéndose.", author: "Albert Einstein" },
    { text: "Cada gran sueño comienza con un soñador.", author: "Harriet Tubman" },
    { text: "La mejor forma de tener una buena idea es tener muchas ideas.", author: "Linus Pauling" },
    { text: "Una idea no vale nada si no se lleva a cabo.", author: "Anónimo" },
    { text: "No esperes. El tiempo nunca será el adecuado.", author: "Napoleon Hill" }
];

async function loadMobileIdeas(silentMode = false) {
    const loader = document.getElementById('ideas-loader-container');
    const grid = document.getElementById('mobile-ideas-grid');
    const quoteText = document.getElementById('loader-quote-text');
    const quoteAuthor = document.getElementById('loader-quote-author');

    if (loader && IDEA_QUOTES && !silentMode) {
        const randomQuote = IDEA_QUOTES[Math.floor(Math.random() * IDEA_QUOTES.length)];
        if (quoteText) quoteText.textContent = `"${randomQuote.text}"`;
        if (quoteAuthor) quoteAuthor.textContent = `- ${randomQuote.author}`;
        loader.classList.remove('hidden');
    }
    if (grid && !silentMode) grid.style.opacity = '0.3';

    try {
        mobileIdeas = await Storage.getIdeas();
        renderMobileIdeas();
    } catch (e) {
        console.error("Error loading ideas", e);
    } finally {
        if (loader) loader.classList.add('hidden');
        if (grid) grid.style.opacity = '1';
    }
}

function renderMobileIdeas() {
    const grid = document.getElementById('mobile-ideas-grid');
    if (!grid) return;

    // Clasificación solicitada: 
    // 1. Favoritos sin proyecto
    // 2. Pendientes (sin proyecto, no fav)
    // 3. Favoritos con proyecto
    // 4. Con proyecto (no fav)
    const sorted = [...mobileIdeas].sort((a, b) => {
        const aHasProj = !!a.proyecto_id && projects.some(p => p.id === a.proyecto_id);
        const bHasProj = !!b.proyecto_id && projects.some(p => p.id === b.proyecto_id);
        
        // Prioridad 1: Sin proyecto arriba de Con proyecto
        if (!aHasProj && bHasProj) return -1;
        if (aHasProj && !bHasProj) return 1;
        
        // Prioridad 2: Favoritos arriba
        if (a.es_favorito && !b.es_favorito) return -1;
        if (!a.es_favorito && b.es_favorito) return 1;

        // Prioridad 3: Fecha descendente
        return new Date(b.created_at) - new Date(a.created_at);
    });

    grid.innerHTML = sorted.length === 0 
        ? '<div style="grid-column: 1/-1; text-align:center; padding:2rem; opacity:0.5;">No hay ideas guardadas</div>'
        : sorted.map(idea => {
            const hasAudio = !!idea.audio_url;
            const isFav = !!idea.es_favorito;
            const hasProject = !!idea.proyecto_id && projects.some(p => p.id === idea.proyecto_id);

            return `
            <div class="mobile-idea-card popIn" style="background: ${idea.color || '#fff9c4'}">
                <div class="idea-header" style="display:flex; justify-content:flex-end;">
                    <button class="btn-idea-mini ${isFav ? 'active-fav' : ''}" onclick="toggleIdeaFavMobile('${idea.id}', ${isFav})">
                        <i class="${isFav ? 'fas' : 'far'} fa-star"></i>
                    </button>
                </div>
                <div class="idea-body" style="flex:1;">
                    <h4>${idea.titulo}</h4>
                    <p>${idea.contenido || ''}</p>
                    
                    ${hasAudio ? `
                        <div class="idea-card-audio" onclick="playMobileAudio('${idea.audio_url}')">
                            <i class="fas fa-play"></i> <span>Nota de voz</span>
                        </div>
                    ` : ''}

                    ${hasProject ? `
                        <div class="idea-project-link">
                            <i class="fas fa-rocket"></i> Proyecto Activo
                        </div>
                    ` : ''}
                </div>
                <div class="idea-card-actions">
                    ${!hasProject && AuthService.isAdmin() ? `
                    <button class="btn-idea-mini convert-btn" onclick="handleConvertIdeaToProjectMobile('${idea.id}')" title="Convertir">
                        <i class="fas fa-rocket"></i>
                    </button>
                    ` : ''}
                    <button class="btn-idea-mini" onclick="deleteMobileIdea('${idea.id}', ${hasProject})" title="Borrar">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
            </div>
            `;
        }).join('');
}

async function handleSaveIdeaMobile() {
    const title = document.getElementById('mob-idea-title').value;
    const content = document.getElementById('mob-idea-content').value;
    
    if (!title.trim()) {
        showMobileToast("Error", "La idea necesita un título", true);
        return;
    }

    // Clonar estado actual por si falla la DB
    const backupIdeas = [...mobileIdeas];
    
    // Crear objeto optimista temporal
    const tempId = 'temp_' + Date.now();
    const optimisticIdea = {
        id: tempId,
        titulo: title,
        contenido: content,
        color: selectedIdeaColor,
        audio_url: recordedAudioBlob ? 'pendiente' : null,
        es_favorito: false,
        created_at: new Date().toISOString()
    };

    // Actualizar UI inmediatamente
    mobileIdeas = [optimisticIdea, ...mobileIdeas];
    renderMobileIdeas();
    document.getElementById('mob-idea-title').value = '';
    document.getElementById('mob-idea-content').value = '';

    try {
        let audioUrl = null;
        if (recordedAudioBlob) {
            const fileName = `idea_audio_${Date.now()}.mp3`;
            audioUrl = await Storage.uploadFile(recordedAudioBlob, `ideas/${fileName}`);
        }

        await Storage.addIdea({
            titulo: title,
            contenido: content,
            color: selectedIdeaColor,
            audio_url: audioUrl
        });

        // Registrar acción en historial profesional
        await Storage.addHistory({
            accion: 'CREAR_IDEA',
            detalle: `anotó una nueva idea: *"${title}"*`
        });
        
        discardMobileAudio();
        // Recargar para obtener el ID real de Supabase
        await loadMobileIdeas();
    } catch (e) {
        showMobileToast("Error", "No se pudo guardar la idea", true);
        mobileIdeas = backupIdeas;
        renderMobileIdeas();
    } finally {
        // Nada
    }
}

async function toggleIdeaFavMobile(id, current) {
    // Optimista
    const idea = mobileIdeas.find(i => i.id === id);
    if (!idea) return;
    
    const originalValue = idea.es_favorito;
    idea.es_favorito = !current;
    renderMobileIdeas();

    try {
        await Storage.updateIdea(id, { es_favorito: !current });
    } catch (e) {
        showMobileToast("Error", "No se pudo actualizar favorito", true);
        idea.es_favorito = originalValue;
        renderMobileIdeas();
    } finally {
        // Nada
    }
}

async function handleConvertIdeaToProjectMobile(id) {
    const idea = mobileIdeas.find(i => i.id === id);
    if (!idea) return;

    // Validación dinámica: verificar si el proyecto vinculado realmente existe
    const hasProject = !!idea.proyecto_id && projects.some(p => p.id === idea.proyecto_id);

    if (hasProject) {
        showMobileToast("Aviso", "Esta idea ya es un proyecto activo", true);
        return;
    }

    if (!await showMobileConfirm("Subir a Proyecto", `¿Convertir "${idea.titulo}" en un nuevo proyecto?`, "info")) return;

    try {
        let finalDesc = idea.contenido || 'Proyecto creado desde idea.';
        if (idea.audio_url) {
            finalDesc += `\n[Audio: ${idea.audio_url}]`;
        }

        const newProj = await Storage.addProject({
            name: idea.titulo,
            description: finalDesc,
            fecha_vencimiento: null
        });

        // Vincular idea al proyecto
        await Storage.updateIdea(idea.id, { proyecto_id: newProj.id });
        
        // Log de conversión
        await Storage.addHistory({
            accion: 'CONVERTIR_IDEA',
            detalle: `transformó la idea *"${idea.titulo}"* en este nuevo proyecto`,
            proyecto_id: newProj.id
        });

        showMobileToast("Éxito", "Proyecto creado correctamente");
        switchView('mobile-all-projects-view');
        await loadData();
        await loadMobileIdeas();
    } catch (e) {
        console.error("Error converting idea", e);
        showMobileToast("Error", "No se pudo convertir a proyecto", true);
    }
}

async function deleteMobileIdea(id, hasProject) {
    if (hasProject) {
        showMobileToast("Bloqueado", "No puedes borrar una idea con proyecto activo", true);
        return;
    }

    if (!await showMobileConfirm("Eliminar Idea", "¿Eliminar esta idea permanentemente?", "danger")) return;

    const ideaToDelete = mobileIdeas.find(i => i.id === id);

    // Optimista
    const backup = [...mobileIdeas];
    mobileIdeas = mobileIdeas.filter(i => i.id !== id);
    renderMobileIdeas();

    try {
        await Storage.deleteIdea(id);
        if (ideaToDelete) {
            await Storage.addHistory({
                accion: 'ELIMINAR_IDEA',
                detalle: `eliminó la idea *"${ideaToDelete.titulo}"*`
            });
        }
    } catch (e) {
        showMobileToast("Error", "No se pudo eliminar de la base de datos", true);
        mobileIdeas = backup;
        renderMobileIdeas();
    } finally {
        // Nada
    }
}

function playMobileAudio(url) {
    const audio = new Audio(url);
    audio.play();
}

function extractAudiosFromText(text) {
    if (!text) return { cleanText: '', audios: [] };
    
    let cleanText = text;
    const audios = [];

    // Patrón PC: [Audio: URL]
    const patternRegex = /\[Audio:\s*(https?:\/\/[^\]\s]+)\]/gi;
    let match;
    while ((match = patternRegex.exec(text)) !== null) {
        if (!audios.includes(match[1])) {
            audios.push(match[1]);
        }
        cleanText = cleanText.replace(match[0], '');
    }

    // URLs sueltas
    const looseRegex = /(https?:\/\/[^\s]+?\.(mp3|wav|ogg|m4a|aac|flac)(\?[^\s]*)?)/gi;
    while ((match = looseRegex.exec(cleanText)) !== null) {
        if (!audios.includes(match[1])) {
            audios.push(match[1]);
        }
    }

    return { cleanText: cleanText.trim(), audios };
}

function renderDescriptionWithAudios(containerEl, text) {
    const { cleanText, audios } = extractAudiosFromText(text);
    containerEl.textContent = cleanText || (text ? '' : 'Sin descripción.');

    if (audios.length > 0) {
        audios.forEach((url, index) => {
            const div = document.createElement('div');
            div.style.marginTop = '12px';
            div.innerHTML = `<p style="font-size: 0.75rem; margin-bottom: 5px; font-weight: 700; color: var(--primary);">AUDIO ADJUNTO:</p>` + renderElegantAudioPlayer(url, `desc-${Math.random().toString(36).substr(2, 9)}`);
            containerEl.appendChild(div);
        });
    }
}

function renderElegantAudioPlayer(url, id) {
    return `
        <div class="elegant-audio-glass" onclick="event.stopPropagation()">
            <div class="audio-controls-mobile">
                <button class="mob-audio-play-btn" id="play-btn-${id}" onclick="toggleMobileAudio('${url}', '${id}')">
                    <i class="fas fa-play"></i>
                </button>
                <div class="mob-audio-progress">
                    <div class="mob-audio-fill" id="fill-${id}"></div>
                </div>
                <div class="mob-audio-time" id="time-${id}">0:00</div>
                <button class="btn-icon-mini" onclick="Storage.downloadFile('${url}', 'audio-${id}.mp3', this)" style="color:var(--text-muted); font-size: 0.8rem; margin-left: 5px;">
                    <i class="fas fa-download"></i>
                </button>
            </div>
        </div>
    `;
}

let activeAudio = null;
let activeAudioId = null;

function toggleMobileAudio(url, id) {
    if (activeAudio && activeAudioId === id) {
        if (activeAudio.paused) {
            activeAudio.play();
            document.getElementById(`play-btn-${id}`).innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            activeAudio.pause();
            document.getElementById(`play-btn-${id}`).innerHTML = '<i class="fas fa-play"></i>';
        }
        return;
    }

    if (activeAudio) {
        activeAudio.pause();
        const prevBtn = document.getElementById(`play-btn-${activeAudioId}`);
        if (prevBtn) prevBtn.innerHTML = '<i class="fas fa-play"></i>';
    }

    activeAudio = new Audio(url);
    activeAudioId = id;

    activeAudio.ontimeupdate = () => {
        const fill = document.getElementById(`fill-${id}`);
        const time = document.getElementById(`time-${id}`);
        if (fill && time) {
            const perc = (activeAudio.currentTime / activeAudio.duration) * 100;
            fill.style.width = `${perc}%`;
            
            const mins = Math.floor(activeAudio.currentTime / 60);
            const secs = Math.floor(activeAudio.currentTime % 60);
            time.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        }
    };

    activeAudio.onended = () => {
        document.getElementById(`play-btn-${id}`).innerHTML = '<i class="fas fa-play"></i>';
    };

    activeAudio.play();
    document.getElementById(`play-btn-${id}`).innerHTML = '<i class="fas fa-pause"></i>';
}

// Elementos del DOM
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const projectGallery = document.getElementById('mobile-project-gallery');
const fullProjectsList = document.getElementById('mobile-full-projects-list');
const taskList = document.getElementById('mobile-task-list');
const projectNameTitle = document.getElementById('mobile-project-name');
const statusFilters = document.querySelectorAll('.filter-pill');

function syncStatusFilterUI(status) {
    statusFilters.forEach(pill => {
        const isActive = pill.dataset.status === status;
        pill.classList.toggle('active', isActive);
        if (isActive) {
            pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
    });
}

function pickInitialStatusFilter(tasks) {
    if (!Array.isArray(tasks) || tasks.length === 0) return 'TODO';

    for (const status of STATUS_FILTER_PRIORITY) {
        if (tasks.some(task => (task.estado || 'TODO') === status)) {
            return status;
        }
    }

    return 'TODO';
}

function applyRoleRestrictions() {
    const userRole = localStorage.getItem('user_role') || 'user';
    console.log('Aplicando restricciones para rol:', userRole);
    
    // Ocultar elementos marcados como admin-only
    const adminElements = document.querySelectorAll('.admin-only');
    console.log('Elementos admin-only encontrados:', adminElements.length);
    
    adminElements.forEach(el => {
        if (userRole === 'admin') {
            // Si es un modal, aseguramos que NO tenga style.display = 'none' 
            if (el.classList.contains('mobile-bottom-sheet') || el.classList.contains('modal')) {
                el.style.display = '';
                return;
            }

            // Excluir botones que tienen lógica propia de visibilidad según contexto (ej: estar dentro de un proyecto)
            if (el.id === 'btn-edit-members' || el.id === 'btn-edit-members-mobile') {
                return; 
            }
            
            el.classList.remove('hidden');
            if (el.style.display === 'none') el.style.display = '';
        } else {
            console.log('Ocultando elemento:', el.id || el.className);
            el.classList.add('hidden');
            el.style.setProperty('display', 'none', 'important');
        }
    });

    // Asegurar ocultación de botones específicos por ID si no es admin
    if (userRole !== 'admin') {
        ['fab-project', 'btn-new-project-card'].forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.add('hidden');
                btn.style.setProperty('display', 'none', 'important');
            }
        });
    }
}

// --- INICIALIZACIÓN ---
async function initMobile() {
    // Aplicar restricciones antes de cargar nada
    applyRoleRestrictions();

    // Pedir permisos de notificación de una vez usando el Helper elegante
    if (window.NotificationHelper) {
        NotificationHelper.requestPermission(true);
    }

    // Sesión
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') window.location.href = 'auth/login.html';
    });

    const session = await AuthService.getSession();
    if (session) {
        currentUserIdMobile = session.user.id;
        try {
            const profile = await AuthService.getUserProfile(session.user.id);
            if (profile) {
                document.querySelector('.user-avatar-small').textContent = profile.nombre.substring(0,2).toUpperCase();
                document.getElementById('mobile-user-welcome').textContent = `Hola, ${profile.nombre.split(' ')[0]}`;
                await initGlobalRealtimeMobile();
            }
        } catch (e) {
            console.error("Error cargando perfil", e);
        }
    }

    // Configuración de navegación
    navItems.forEach(item => {
        item.onclick = () => {
            const targetView = item.dataset.view;
            if (targetView) {
                switchView(targetView);
                if (targetView === 'mobile-ideas-view') loadMobileIdeas();
            } else if (item.id === 'nav-btn-more') {
                openMobileMoreMenu();
            }
        };
    });

    document.getElementById('btn-see-all-projects').onclick = () => switchView('mobile-all-projects-view');
    document.getElementById('btn-back-to-gallery').onclick = () => switchView('mobile-gallery-view');
    document.getElementById('btn-new-project-mobile').onclick = () => openNewProjectSheet();

    // Configurar Notificaciones Push Mobile
    const btnNotifMobile = document.getElementById('btn-notifications-mobile');
    if (btnNotifMobile) {
        btnNotifMobile.onclick = async () => {
            if (!("Notification" in window)) {
                return alert("Este navegador no soporta notificaciones.");
            }
            if (Notification.permission === 'default') {
                const permission = await NotificationHelper.requestPermission(true);
                if (permission === 'granted') {
                    alert("¡Notificaciones habilitadas! ✅");
                }
            } else if (Notification.permission === 'granted') {
                alert("Las notificaciones ya están activas.");
                new Notification("DaviProjects", { body: "Notificaciones móviles activas" });
            } else {
                alert("Las notificaciones están bloqueadas. Actívalas en la configuración del navegador.");
            }
        };
    }
    document.getElementById('mobile-btn-logout').onclick = () => AuthService.logout();
    
    document.getElementById('btn-project-settings').onclick = openProjectDetails;
    document.getElementById('btn-delete-project-mobile').onclick = handleDeleteProjectMobile;

    // --- INICIALIZAR IDEAS ---
    const btnSaveInline = document.getElementById('btn-save-idea-inline');
    if (btnSaveInline) btnSaveInline.onclick = handleSaveIdeaMobile;
    
    const recBtn = document.getElementById('mob-btn-record');
    if (recBtn) {
        recBtn.onclick = () => {
            if (recBtn.classList.contains('recording')) {
                stopRecording();
            } else {
                startRecording();
            }
        };
    }

    document.querySelectorAll('.color-opt').forEach(opt => {
        opt.onclick = () => {
            document.querySelectorAll('.color-opt').forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedIdeaColor = opt.dataset.color;
        };
    });

    // Filtros de estado
    statusFilters.forEach(btn => {
        btn.onclick = () => {
            currentStatusFilter = btn.dataset.status;
            syncStatusFilterUI(currentStatusFilter);
            renderTasks();
        };
    });

    // Modals y Sheets - El botón principal se gestiona en switchView
    document.getElementById('btn-create-task-sheet').onclick = () => {
        if (!currentProjectId) {
            showMobileToast("Aviso", "Primero selecciona un proyecto", true);
            return;
        }
        closeMobileSheet('mobile-modal-actions');
        openMobileSheet('mobile-modal-task');
    };
    document.getElementById('btn-create-project-sheet').onclick = () => {
        closeMobileSheet('mobile-modal-actions');
        openNewProjectSheet();
    };

    document.getElementById('save-task-mobile').onclick = handleSaveTask;
    
    // --- LÓGICA DE BANNER iOS (Si viene de Safari) ---
    const params = new URLSearchParams(window.location.search);
    if (params.get('safari') === '1') {
        const banner = document.createElement('div');
        banner.className = 'ios-pwa-banner';
        banner.innerHTML = `
            <img src="/img/logo.webp" alt="Logo">
            <div class="banner-text">
                <h4>Instalar DaviProjects</h4>
                <p>Pulsa el botón <i class="fa-solid fa-arrow-up-from-bracket"></i> y luego <b>"Añadir a la pantalla de inicio"</b> para usarla como App.</p>
            </div>
            <div class="banner-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></div>
        `;
        document.body.appendChild(banner);
        // Autocerrar en 15 segundos
        setTimeout(() => banner.remove(), 15000);
    }
    
    // Tabs de detalle
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            btn.classList.add('active');
            document.getElementById(btn.dataset.tab).classList.remove('hidden');
        };
    });

    const prioritySliderEdit = document.getElementById('mobile-edit-task-priority');
    if (prioritySliderEdit) {
        prioritySliderEdit.oninput = (e) => {
            updateMobilePriorityUI(parseInt(e.target.value), 'mobile-edit');
        };
    }

    document.getElementById('btn-edit-task-mobile').onclick = openEditTaskMobile;
    document.getElementById('btn-save-edit-task-mobile').onclick = saveTaskUpdateMobile;
    document.getElementById('btn-delete-task-mobile').onclick = handleDeleteTask;

    // Nuevo Proyecto (Guardar)
    document.getElementById('save-project-mobile').onclick = async () => {
        const name = document.getElementById('mobile-project-name-input').value;
        const desc = document.getElementById('mobile-project-desc-input').value;
        const due = document.getElementById('mobile-project-due-input').value;
        if (!name) {
            showMobileToast("Aviso", "El nombre es obligatorio", true);
            return;
        }
        const success = await createProject(name, desc, due);
        if (success) {
            closeMobileSheet('mobile-modal-project');
            // Limpiar
            document.getElementById('mobile-project-name-input').value = '';
            document.getElementById('mobile-project-desc-input').value = '';
            document.getElementById('mobile-project-due-input').value = '';
        }
    };

    // Priority Slider Mobile
    const prioritySlider = document.getElementById('mobile-task-priority');
    if (prioritySlider) {
        prioritySlider.oninput = (e) => {
            updateMobilePriorityUI(parseInt(e.target.value));
        };
    }

    // Búsqueda de proyectos
    document.getElementById('search-projects-mobile').oninput = (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = projects.filter(p => p.nombre.toLowerCase().includes(term));
        renderProjectGalleries(filtered);
    };

    await loadData();

    // Soporte para Deep Linking (Prioridad Tarea -> Proyecto)
    const urlParams = new URLSearchParams(window.location.search);
    const taskIdParam = urlParams.get('taskId');
    const projectIdParam = urlParams.get('projectId');
    const musicIdParam = urlParams.get('musicId');
    const targetTypeParam = urlParams.get('targetType');

    // 0. Si hay una música (Deep link al player/hub)
    if (musicIdParam) {
        switchView('mobile-music-view');
        // Pequeño retardo para asegurar que los datos de música se carguen (si no están ya)
        setTimeout(async () => {
            const song = (typeof mobileMusicData !== 'undefined' && mobileMusicData.length > 0) 
                ? mobileMusicData.find(s => s.id === musicIdParam)
                : (await Storage.getMusic()).find(s => s.id === musicIdParam);
            
            if (song) playSongMobile(song);
        }, 800);
        hideMobileSplash();
        return;
    }
    
    // 1. Si hay una tarea, buscamos su proyecto automáticamente
    if (taskIdParam) {
        const targetTask = allTasks.find(t => t.id === taskIdParam);
        if (targetTask) {
            await selectProject(targetTask.proyecto_id);
            
            // Sincronizar el filtro con el estado de la tarea (UX fix)
            currentStatusFilter = targetTask.estado;
            document.querySelectorAll('.filter-pill').forEach(pill => {
                const isActive = pill.dataset.status === targetTask.estado;
                pill.classList.toggle('active', isActive);
                if (isActive) {
                    pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            });
            renderTasks();

            // Pequeña pausa para asegurar que el render de la lista terminó
            setTimeout(() => {
                openTaskDetail(taskIdParam, targetTypeParam);
                hideMobileSplash();
            }, 300);
            return;
        } else {
            // No se encontró en la caché local filtrada por permisos
            showAccessDeniedModal("No tienes acceso a esta tarea o no existe.");
            hideMobileSplash();
            return;
        }
    }

    // 2. Si solo hay ID de proyecto
    if (projectIdParam) {
        const targetProject = projects.find(p => p.id === projectIdParam);
        if (targetProject) {
            await selectProject(targetProject.id);
            hideMobileSplash();
            return;
        } else {
            showAccessDeniedModal("Este proyecto no está disponible para ti o no existe.");
        }
    }

    switchView('mobile-gallery-view');
    hideMobileSplash();
}

function showAccessDeniedModal(message) {
    const modalId = 'mobile-access-denied-modal';
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'mobile-bottom-sheet hidden';
        modal.style.zIndex = '10000';
        modal.innerHTML = `
            <div class="sheet-content" style="padding: 3rem 2rem; text-align: center;">
                <div class="sheet-handle"></div>
                <div style="background: #fee2e2; width: 70px; height: 70px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                    <i class="fas fa-user-lock" style="font-size: 1.8rem; color: #ef4444;"></i>
                </div>
                <h3 style="font-size: 1.5rem; margin-bottom: 1rem;">Sin Acceso</h3>
                <p id="mobile-access-denied-msg" style="color: var(--text-muted); margin-bottom: 2.5rem; line-height: 1.5;"></p>
                <button class="btn-primary-full" onclick="closeMobileSheet('${modalId}')">Volver</button>
            </div>
        `;
        document.body.appendChild(modal);
    }
    document.getElementById('mobile-access-denied-msg').textContent = message;
    openMobileSheet(modalId);
}

function hideMobileSplash() {
    const splash = document.getElementById('loading');
    if (splash) splash.style.display = 'none';
    const app = document.getElementById('mobile-app');
    if (app) app.style.display = 'block';
}

function updateMobilePriorityUI(level, prefix = 'mobile') {
    const iconWrapper = document.getElementById(`${prefix}-p-icon-bg`) || document.getElementById(`${prefix}-task-priority-box`);
    const icon = document.getElementById(`${prefix}-p-icon`) || document.getElementById(`${prefix}-task-priority-icon`);
    const text = document.getElementById(`${prefix}-p-text`) || document.getElementById(`${prefix}-task-priority-text`);
    const desc = document.getElementById(`${prefix}-p-desc`);
    
    if (!icon || !text) return;

    let config = {
        color: '#64748b',
        icon: 'fa-leaf',
        label: `P${level} - Relajado`,
        desc: 'Para cuando haya tiempo.',
        bg: '#f8fafc'
    };

    if (level >= 8) {
        config = { color: '#ef4444', icon: 'fa-fire-alt', label: `P${level} - ¡URGENTE!`, desc: '¡Prioridad máxima!', bg: '#fef2f2' };
    } else if (level >= 5) {
        config = { color: '#f59e0b', icon: 'fa-bolt', label: `P${level} - Importante`, desc: 'Requiere atención.', bg: '#fffbeb' };
    } else if (level >= 3) {
        config = { color: '#3b82f6', icon: 'fa-coffee', label: `P${level} - Moderado`, desc: 'Tarea estándar.', bg: '#eff6ff' };
    }

    if (iconWrapper) {
        iconWrapper.style.backgroundColor = prefix.includes('detail') ? '#f1f5f9' : config.color;
    }
    icon.className = `fas ${config.icon}`;
    if (prefix.includes('detail')) icon.style.color = config.color;
    text.textContent = config.label;
    if (!prefix.includes('detail')) text.style.color = config.color;
    if (desc) desc.textContent = config.desc;
}

// --- CARGA DE DATOS ---
async function loadData(silentMode = false) {
    const loader = document.getElementById('projects-loader-container');
    const list = document.getElementById('mobile-full-projects-list');
    
    if (loader && !silentMode) {
        const randomQuote = PROJECT_QUOTES[Math.floor(Math.random() * PROJECT_QUOTES.length)];
        const qText = document.getElementById('project-loader-quote-text');
        const qAuthor = document.getElementById('project-loader-quote-author');
        if (qText) qText.textContent = `"${randomQuote.text}"`;
        if (qAuthor) qAuthor.textContent = `– ${randomQuote.author}`;
        loader.classList.remove('hidden');
    }
    if (list) list.style.opacity = '0.3';

    try {
        projects = await Storage.getProjects();
        allTasks = await Storage.getTasks();
        
        updateMetrics();
        renderProjectGalleries();
        if (document.getElementById('mobile-history-view').classList.contains('active')) {
            renderHistory();
        }
    } catch (e) {
        console.error("Error loading data", e);
    } finally {
        if (loader) loader.classList.add('hidden');
        if (list) list.style.opacity = '1';
    }
}

// --- LOGGING & HISTORY ---
async function logMobileAction(accion, detalle, tareaId = null) {
    const projId = currentProjectId || (tareaId ? allTasks.find(t => t.id === tareaId)?.proyecto_id : null);
    if (!projId) return;
    
    try {
        await Storage.addHistory({
            accion,
            detalle,
            proyecto_id: projId,
            tarea_id: tareaId
        });
    } catch (err) {
        console.error("Error logging action mobile:", err);
    }
}

function updateMetrics() {
    // Solo TODO, DOING, DONE
    const validTasks = allTasks.filter(t => ['TODO', 'DOING', 'DONE'].includes(t.estado || 'TODO'));
    const pending = validTasks.filter(t => t.estado !== 'DONE').length;
    const done = validTasks.filter(t => t.estado === 'DONE').length;
    
    document.getElementById('m-count-projects').textContent = projects.length;
    document.getElementById('m-count-pending').textContent = pending;
    document.getElementById('m-count-done').textContent = done;
}

// --- VISTAS Y NAVEGACIÓN ---
function switchView(viewId) {
    currentViewId = viewId;
    if (typeof updatePlayerVisibility === 'function') updatePlayerVisibility();

    const mainHeader = document.querySelector('.mobile-header');
    
    views.forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });

    // Ocultar header principal en vistas que tienen su propio header sticky
    if (viewId === 'mobile-tasks-view' || viewId === 'mobile-history-view' || viewId === 'mobile-music-view' || viewId === 'mobile-ideas-view') {
        if (mainHeader) mainHeader.classList.add('hidden');
    } else {
        if (mainHeader) mainHeader.classList.remove('hidden');
    }

    const target = document.getElementById(viewId);
    target.classList.remove('hidden');
    target.classList.add('active', 'fadeIn');

    // Cargas automáticas por vista (Modo Silencioso)
    if (viewId === 'mobile-gallery-view' || viewId === 'mobile-all-projects-view') {
        loadData(true);
    } else if (viewId === 'mobile-history-view') {
        renderHistory();
    } else if (viewId === 'mobile-ideas-view') {
        loadMobileIdeas(true);
    } else if (viewId === 'mobile-music-view') {
        renderMusicListMobile();
    }

    // Actualizar nav bottom
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) item.classList.add('active');
    });

    // --- Lógica Contextual Botón CREAR ---
    const btnAddMain = document.getElementById('btn-add-main-mobile');
    const btnAddIcon = btnAddMain.querySelector('i');

    if (btnAddMain) {
        if (viewId === 'mobile-tasks-view') {
            btnAddMain.classList.add('task-mode');
            btnAddMain.classList.remove('idea-mode', 'music-mode');
            if (btnAddIcon) btnAddIcon.className = 'fas fa-plus';
        } else if (viewId === 'mobile-gallery-view') {
            btnAddMain.classList.remove('task-mode', 'music-mode');
            btnAddMain.classList.add('idea-mode');
            if (btnAddIcon) btnAddIcon.className = 'fas fa-lightbulb';
        } else if (viewId === 'mobile-music-view') {
            btnAddMain.classList.remove('task-mode', 'idea-mode');
            btnAddMain.classList.add('music-mode');
            if (btnAddIcon) btnAddIcon.className = 'fas fa-music';
        } else {
            btnAddMain.classList.remove('task-mode', 'idea-mode', 'music-mode');
            if (btnAddIcon) btnAddIcon.className = 'fas fa-plus';
        }

        btnAddMain.onclick = () => {
            if (viewId === 'mobile-tasks-view') {
                if (!currentProjectId) {
                    showMobileToast("Aviso", "Primero selecciona un proyecto", true);
                    return;
                }
                openMobileSheet('mobile-modal-task');
            } else if (viewId === 'mobile-gallery-view') {
                switchView('mobile-ideas-view');
            } else if (viewId === 'mobile-all-projects-view') {
                openNewProjectSheet();
            } else if (viewId === 'mobile-music-view') {
                openMobileSheet('mobile-modal-music');
            } else {
                openMobileSheet('mobile-modal-actions');
            }
        };
    }

    if (viewId === 'mobile-history-view') {
        currentHistoryFolder = null; // Reset carpetas al entrar
        renderHistory();
    }
}

// --- PROYECTOS ---
function renderProjectGalleries(filteredList = null) {
    const listToRender = filteredList || projects;
    
    const renderCard = (p) => {
        // Solo TODO, DOING, DONE (Calculamos progreso)
        const pTasks = allTasks.filter(t => t.proyecto_id === p.id && ['TODO', 'DOING', 'DONE'].includes(t.estado || 'TODO'));
        const done = pTasks.filter(t => t.estado === 'DONE').length;
        const prog = pTasks.length > 0 ? Math.round((done / pTasks.length) * 100) : 0;
        
        // Obtener miembros del proyecto (Nested data from storage.js)
        const projectMemberships = p.daviprojects_proyecto_miembros || [];
        const memberAvatarsHtml = projectMemberships.slice(0, 3).map(m => {
            const userName = m.daviplata_usuarios?.nombre || 'Usuario';
            const initials = getUserInitials(userName);
            const color = getUserColor(m.usuario_id);
            return `
                <div class="card-mini-avatar" title="${userName}" style="background: ${color}; width: 18px; height: 18px; font-size: 0.55rem; border: 1.5px solid #fff; margin-left: -5px;">
                    ${initials}
                </div>
            `;
        }).join('');

        return `
            <div class="mobile-project-card" onclick="selectProject('${p.id}')">
                <div class="card-ico-box">
                    <i class="fas fa-folder"></i>
                </div>
                <div class="card-info">
                    <h4 style="display: flex; align-items: center; gap: 0.5rem; justify-content: space-between;">
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${p.nombre}</span>
                        <div style="display:flex; margin-left: auto;">
                            ${memberAvatarsHtml}
                            ${projectMemberships.length > 3 ? `
                                <div class="card-mini-avatar" style="background: #94a3b8; width: 18px; height: 18px; font-size: 0.5rem; border: 1.5px solid #fff; margin-left: -5px; z-index: 0;">
                                    +${projectMemberships.length - 3}
                                </div>
                            ` : ''}
                        </div>
                    </h4>
                    <div class="prog-bar-mini">
                        <div class="prog-fill" style="width: ${prog}%"></div>
                    </div>
                </div>
                <div class="card-meta-end" style="font-size: 0.75rem; font-weight: 700; color: var(--primary);">
                    ${prog}%
                </div>
            </div>
        `;
    };

    // Solo actualizar la galería de la home si no estamos filtrando
    if (!filteredList) {
        const isAdmin = (typeof AuthService !== 'undefined' && typeof AuthService.isAdmin === 'function') 
            ? AuthService.isAdmin() 
            : (localStorage.getItem('user_role') === 'admin');
            
        projectGallery.innerHTML = projects.slice(0, 3).map(renderCard).join('') || `
            <div style="padding: 1rem; text-align: center; opacity: 0.7;">
                <p>${isAdmin ? 'No tienes proyectos aún' : 'No tienes proyectos asignados'}</p>
                ${isAdmin ? '<button class="btn-text" onclick="openNewProjectSheet()" style="margin-top: 0.5rem; color: var(--primary);">Crear nuevo</button>' : ''}
            </div>
        `;
    }
    
    const isAdminAll = (typeof AuthService !== 'undefined' && typeof AuthService.isAdmin === 'function') 
        ? AuthService.isAdmin() 
        : (localStorage.getItem('user_role') === 'admin');
    fullProjectsList.innerHTML = listToRender.map(renderCard).join('') || `
        <div style="text-align:center; padding:3rem; opacity:0.5;">
            <i class="fas fa-folder-open" style="font-size: 2rem; margin-bottom: 1rem; display: block;"></i>
            <p>${isAdminAll ? 'Empieza creando un proyecto.' : 'No se encontraron proyectos.'}</p>
            ${isAdminAll ? '<button class="btn-primary" onclick="openNewProjectSheet()" style="margin-top: 1rem; padding: 0.5rem 1rem; border-radius: 8px;">Nuevo Proyecto</button>' : ''}
        </div>
    `;
}

let selectedUsersForNewProjectMob = [];

function openNewProjectSheet() {
    // Resetear form
    document.getElementById('mobile-project-name-input').value = '';
    document.getElementById('mobile-project-desc-input').value = '';
    document.getElementById('mobile-project-due-input').value = '';
    selectedUsersForNewProjectMob = [];
    
    openMobileSheet('mobile-modal-project');
    renderNewProjectMembersMob();
}

async function renderNewProjectMembersMob() {
    const list = document.getElementById('mobile-new-project-members');
    if (!list) return;
    list.innerHTML = '<div style="padding:1rem; text-align:center;"><div class="spinner-loading"></div></div>';

    try {
        if (allUsersMobileCache.length === 0) {
            allUsersMobileCache = await Storage.getAllUsers();
        }

        list.innerHTML = '';
        const users = allUsersMobileCache.filter(u => u.rol === 'user');

        if (users.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:1rem; color:#64748b;">No hay usuarios</p>';
            return;
        }

        users.forEach(user => {
            const card = document.createElement('div');
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.gap = '0.75rem';
            card.style.padding = '0.75rem';
            card.style.background = 'white';
            card.style.borderRadius = '10px';
            card.style.border = '1px solid #e2e8f0';

            const initials = user.nombre.substring(0, 2).toUpperCase();
            
            card.innerHTML = `
                <div style="width:36px; height:36px; border-radius:8px; background:#082359; color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.8rem;">${initials}</div>
                <div style="flex:1;">
                    <div style="font-weight:700; font-size:0.9rem;">${user.nombre}</div>
                    <div style="font-size:0.7rem; color:#64748b;">${user.email}</div>
                </div>
                <div class="mob-check-box" style="width:20px; height:20px; border-radius:50%; border:2px solid #cbd5e1; display:flex; align-items:center; justify-content:center;">
                    <i class="fas fa-check" style="color:white; font-size:0.7rem; display:none;"></i>
                </div>
            `;

            card.onclick = () => {
                const check = card.querySelector('.mob-check-box');
                const icon = card.querySelector('.fa-check');
                if (selectedUsersForNewProjectMob.includes(user.auth_id)) {
                    selectedUsersForNewProjectMob = selectedUsersForNewProjectMob.filter(id => id !== user.auth_id);
                    check.style.background = 'transparent';
                    check.style.borderColor = '#cbd5e1';
                    icon.style.display = 'none';
                    card.style.borderColor = '#e2e8f0';
                } else {
                    selectedUsersForNewProjectMob.push(user.auth_id);
                    check.style.background = 'var(--primary)';
                    check.style.borderColor = 'var(--primary)';
                    icon.style.display = 'block';
                    card.style.borderColor = 'var(--primary)';
                }
            };

            list.appendChild(card);
        });
    } catch (e) {
        list.innerHTML = '<p style="text-align:center; color:red; padding:1rem;">Error cargando usuarios</p>';
    }
}

async function createProject(nombre, descripcion = '', fecha_vencimiento = null) {
    if (selectedUsersForNewProjectMob.length === 0) {
        showMobileToast("Aviso", "Debes asignar al menos un participante", true);
        return false;
    }

    try {
        const newProj = await Storage.addProject({ 
            name: nombre, 
            description: descripcion, 
            fecha_vencimiento: fecha_vencimiento 
        });

        // Asignar miembros
        for (const userId of selectedUsersForNewProjectMob) {
            await Storage.addProjectMember(newProj.id, userId);
        }
        
        await Storage.addHistory({
            accion: 'CREAR_PROYECTO',
            detalle: `creó el proyecto *"${nombre}"*`,
            proyecto_id: newProj.id
        });

        showMobileToast("Éxito", "Proyecto creado correctamente");
        await loadData();
        return true;
    } catch (e) {
        showMobileToast("Error", "No se pudo crear el proyecto", true);
        return false;
    }
}

function openProjectDetails() {
    const project = projects.find(p => p.id === currentProjectId);
    if (!project) return;

    document.getElementById('proj-detail-name').textContent = project.nombre;
    const descEl = document.getElementById('proj-detail-desc');
    renderDescriptionWithAudios(descEl, project.descripcion || 'Sin descripción.');
    
    // Renderizar miembros en el modal de detalles móvil
    const membersContainer = document.getElementById('proj-detail-members-mobile');
    if (membersContainer) {
        const projectMemberships = project.daviprojects_proyecto_miembros || [];
        membersContainer.innerHTML = projectMemberships.map(m => {
            const userName = m.daviplata_usuarios?.nombre || 'Usu';
            const initials = getUserInitials(userName);
            const color = getUserColor(m.usuario_id);
            return `
                <div class="card-mini-avatar" title="${userName}" style="background: ${color}; width: 28px; height: 28px; font-size: 0.65rem; border-width: 2px;">
                    ${initials}
                </div>
            `;
        }).join('');
    }

    openMobileSheet('mobile-project-details-modal');
}

async function handleDeleteProjectMobile() {
    if (!currentProjectId) return;
    if (!await showMobileConfirm("Eliminar Proyecto", "¿Estás seguro de eliminar todo el proyecto? Esta acción no se puede deshacer.", "danger")) return;

    try {
        await Storage.deleteProject(currentProjectId);
        showMobileToast("Éxito", "Proyecto eliminado");
        closeMobileSheet('mobile-project-details-modal');
        switchView('mobile-gallery-view');
        await loadData();
        await loadMobileIdeas();
    } catch (e) {
        showMobileToast("Error", "No se pudo eliminar", true);
    }
}

function updateMembersButtonVisibilityMobile() {
    const btn = document.getElementById('btn-edit-members-mobile');
    if (!btn) return;
    const userRole = localStorage.getItem('user_role');
    if (userRole === 'admin' && currentProjectId) {
        btn.classList.remove('hidden');
        btn.style.display = ''; // Asegurar que no tenga display:none
    } else {
        btn.classList.add('hidden');
        btn.style.display = 'none';
    }
}

// GESTIÓN DE MIEMBROS MODAL MOBILE
let allUsersMobileCache = [];
let currentProjectMembersMobile = [];

async function openMembersModalMobile() {
    if (!currentProjectId) return;
    openMobileSheet('modal-project-members');
    
    // Reset buscador
    const searchInput = document.getElementById('search-users-mobile');
    if (searchInput) searchInput.value = '';

    await loadAllUsersAndMembersMobile();
}

async function loadAllUsersAndMembersMobile() {
    const gallery = document.getElementById('mobile-users-gallery');
    if (gallery) gallery.innerHTML = '<div class="loader-container"><div class="spinner-loading"></div></div>';
    
    try {
        const [users, membersData] = await Promise.all([
            Storage.getAllUsers(),
            Storage.getProjectMembers(currentProjectId)
        ]);

        allUsersMobileCache = users;
        currentProjectMembersMobile = membersData.map(m => m.usuario_id);
        
        renderMembersGalleryMobile();
        updateMembersCountLabelMobile();
    } catch (e) {
        console.error("Error loading users mobile", e);
        if (gallery) gallery.innerHTML = '<div style="color:red; text-align:center; padding:1rem;">Error de red</div>';
    }
}

function renderMembersGalleryMobile(filter = '') {
    const gallery = document.getElementById('mobile-users-gallery');
    if (!gallery) return;
    gallery.innerHTML = '';

    const term = filter.toLowerCase();
    // Filtro: Debe coincidir con el término de búsqueda Y ser de rol 'user'
    const filtered = allUsersMobileCache.filter(u => 
        (u.nombre.toLowerCase().includes(term) || u.email.toLowerCase().includes(term)) && 
        u.rol === 'user'
    );

    if (filtered.length === 0) {
        gallery.innerHTML = '<div style="text-align:center; padding:2rem; opacity:0.5;">Sin resultados</div>';
        return;
    }

    filtered.forEach(user => {
        const isMember = currentProjectMembersMobile.includes(user.auth_id);
        const card = document.createElement('div');
        card.className = `mobile-user-card ${isMember ? 'is-member' : ''}`;
        
        card.innerHTML = `
            <div class="mobile-card-avatar">${user.nombre.substring(0,2).toUpperCase()}</div>
            <div class="mobile-card-info">
                <span class="mobile-user-name">${user.nombre}</span>
                <span class="mobile-user-email">${user.email}</span>
            </div>
            <div class="mobile-check">
                ${isMember ? '<i class="fas fa-check"></i>' : ''}
            </div>
        `;

        card.onclick = () => toggleUserMembershipMobile(user.auth_id, card);
        gallery.appendChild(card);
    });
}

async function toggleUserMembershipMobile(authId, cardElement) {
    const isMember = currentProjectMembersMobile.includes(authId);
    
    try {
        if (isMember) {
            currentProjectMembersMobile = currentProjectMembersMobile.filter(id => id !== authId);
            cardElement.classList.remove('is-member');
            cardElement.querySelector('.mobile-check').innerHTML = '';
            await Storage.removeProjectMember(currentProjectId, authId);
        } else {
            currentProjectMembersMobile.push(authId);
            cardElement.classList.add('is-member');
            cardElement.querySelector('.mobile-check').innerHTML = '<i class="fas fa-check"></i>';
            await Storage.addProjectMember(currentProjectId, authId);
        }
        updateMembersCountLabelMobile();
    } catch (e) {
        console.error("Error toggling mobile membership:", e);
        loadAllUsersAndMembersMobile();
        showMobileToast("Error", "No se pudo actualizar");
    }
}

function updateMembersCountLabelMobile() {
    const label = document.getElementById('mobile-members-count');
    if (label) label.textContent = currentProjectMembersMobile.length;
}

// Búsqueda mobile
document.getElementById('search-users-mobile')?.addEventListener('input', (e) => {
    renderMembersGalleryMobile(e.target.value);
});

// Listeners
document.getElementById('btn-edit-members-mobile')?.addEventListener('click', openMembersModalMobile);

async function selectProject(id) {
    currentProjectId = id;
    updateMembersButtonVisibilityMobile();
    const project = projects.find(p => p.id === id);
    if (!project) return;

    projectNameTitle.textContent = project.nombre;
    
    // Header Audio Player (si el proyecto tiene audio)
    const headerAudioContainer = document.getElementById('project-audio-header-container');
    const { audios } = extractAudiosFromText(project.descripcion);
    
    if (audios.length > 0 && headerAudioContainer) {
        headerAudioContainer.innerHTML = renderElegantAudioPlayer(audios[0], 'project-header');
        headerAudioContainer.classList.remove('hidden');
    } else if (headerAudioContainer) {
        headerAudioContainer.classList.add('hidden');
        headerAudioContainer.innerHTML = '';
        if (activeAudio && activeAudioId === 'project-header') {
            activeAudio.pause();
            activeAudio = null;
        }
    }

    switchView('mobile-tasks-view');
    
    currentTasks = await Storage.getTasks(id);
    currentStatusFilter = pickInitialStatusFilter(currentTasks);
    syncStatusFilterUI(currentStatusFilter);
    renderTasks();
}

// --- TAREAS ---
function renderTasks() {
    const filtered = currentTasks.filter(t => t.estado === currentStatusFilter);
    
    taskList.innerHTML = filtered.map(t => {
        const isRejected = t.estado === 'REJECTED';
        const prioClass = isRejected ? 'rejected' : (t.prioridad > 7 ? 'prio-high' : (t.prioridad > 4 ? 'prio-med' : ''));
        return `
            <div class="task-item-mobile ${prioClass}" onclick="openTaskDetail('${t.id}')">
                <h4>${t.titulo}</h4>
                <div class="task-meta-row">
                    <span><i class="far fa-calendar-alt"></i> ${t.fecha_vencimiento ? new Date(t.fecha_vencimiento).toLocaleDateString() : 'Sin fecha'}</span>
                    <span><i class="fas fa-layer-group"></i> P${t.prioridad || 1}</span>
                </div>
            </div>
        `;
    }).join('') || `<div style="text-align:center; padding:3rem; color:var(--text-muted);"><i class="fas fa-clipboard-list" style="font-size:2rem; margin-bottom:1rem; opacity:0.3;"></i><p>Nada por aquí en ${currentStatusFilter}</p></div>`;
}

async function handleSaveTask() {
    const title = document.getElementById('mobile-task-title').value;
    const desc = document.getElementById('mobile-task-desc').value;
    const priority = document.getElementById('mobile-task-priority').value;
    const due = document.getElementById('mobile-task-due').value;

    if (!title) return showMobileToast("Error", "El título es obligatorio", true);

    try {
        const newTask = await Storage.addTask({
            title,
            description: desc,
            priority: parseInt(priority),
            dueDate: due || null,
            projectId: currentProjectId
        });

        await logMobileAction('CREAR', `creó la tarea *"${title}"*`, newTask.id);

        closeMobileSheet('mobile-modal-task');
        showMobileToast("Éxito", "Tarea creada");
        
        // Limpiar Formulario
        document.getElementById('mobile-task-title').value = '';
        document.getElementById('mobile-task-desc').value = '';
        document.getElementById('mobile-task-priority').value = 1;
        updateMobilePriorityUI(1);
        document.getElementById('mobile-task-due').value = '';

        currentTasks = await Storage.getTasks(currentProjectId);
        allTasks = await Storage.getTasks(); // Actualizar globales
        renderTasks();
        updateMetrics();
    } catch (e) {
        showMobileToast("Error", "No se pudo guardar", true);
    }
}

// --- GESTIÓN DE ADJUNTOS ---
function handleMobileFileSelect(input) {
    if (input.files && input.files[0]) {
        currentAttachment = input.files[0];
        const fileName = currentAttachment.name;
        const fileType = currentAttachment.type;
        
        document.getElementById('mobile-file-name').textContent = fileName;
        document.getElementById('mobile-attachment-preview').classList.remove('hidden');

        // Vista previa si es imagen
        const thumbContainer = document.getElementById('mobile-preview-thumb-container');
        const iconContainer = document.getElementById('mobile-preview-icon');
        const imgPreview = document.getElementById('mobile-preview-img');

        if (fileType.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                imgPreview.src = e.target.result;
                thumbContainer.classList.remove('hidden');
                
                // Mostrar botón de editar (Mobile)
                const editBtn = document.getElementById('m-btn-edit-preview');
                if (editBtn) {
                    editBtn.classList.remove('hidden');
                    editBtn.onclick = (e) => {
                        e.stopPropagation();
                        ImageEditor.open(imgPreview.src, (editedFile) => {
                            currentAttachment = editedFile;
                            imgPreview.src = URL.createObjectURL(editedFile);
                        });
                    };
                }
            };
            reader.readAsDataURL(currentAttachment);
        } else {
            thumbContainer.classList.add('hidden');
            const editBtn = document.getElementById('m-btn-edit-preview');
            if (editBtn) editBtn.classList.add('hidden');
            if (iconContainer) iconContainer.classList.remove('hidden');
        }
    }
}

function openMobileCamera() {
    const input = document.getElementById('mobile-file-input');
    input.setAttribute('capture', 'camera');
    input.click();
}

function clearMobileAttachment() {
    currentAttachment = null;
    const fileInput = document.getElementById('mobile-file-input');
    if (fileInput) fileInput.value = '';
    
    const preview = document.getElementById('mobile-attachment-preview');
    if (preview) preview.classList.add('hidden');
    
    const thumbContainer = document.getElementById('mobile-preview-thumb-container');
    if (thumbContainer) thumbContainer.classList.add('hidden');
    
    const imgPreview = document.getElementById('mobile-preview-img');
    if (imgPreview) imgPreview.src = '';
    
    // El icono opcional
    const iconContainer = document.getElementById('mobile-preview-icon');
    if (iconContainer) iconContainer.classList.remove('hidden');
}

// --- DETALLE DE TAREA ---
async function openTaskDetail(id, targetType = null) {
    currentTaskId = id;
    
    // Buscar en tareas actuales o en el caché global de todas las tareas
    const task = currentTasks.find(t => t.id === id) || (typeof allTasks !== 'undefined' ? allTasks.find(t => t.id === id) : null);
    
    if (!task) {
        console.warn("No se encontró la tarea en el móvil:", id);
        // Intentar cargar la tarea si no está en caché
        try {
            const tasksFromDB = await Storage.getTasks();
            const found = tasksFromDB.find(t => t.id === id);
            if (found) {
                currentTasks.push(found);
                return openTaskDetail(found.id, targetType);
            }
        } catch (e) {
            console.error("Error al recuperar tarea:", e);
        }
        return;
    }

    document.getElementById('detail-task-title').textContent = task.titulo;
    const descEl = document.getElementById('detail-task-desc');
    renderDescriptionWithAudios(descEl, task.descripcion || 'Sin descripción adicional.');
    
    // Prioridad y Vencimiento
    updateMobilePriorityUI(task.prioridad || 1, 'detail');
    
    const dueDate = task.fecha_vencimiento ? new Date(task.fecha_vencimiento).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : 'Sin fecha';
    document.getElementById('detail-task-due-text').textContent = dueDate;

    // Actualizar visual de botones de estado
    document.querySelectorAll('.status-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.status === task.estado);
    });

    openMobileSheet('mobile-task-detail');
    loadTaskElements();

    // Navegación precisa según el tipo de notificación
    if (targetType === 'COMMENT') {
        openChatMobile();
    } else if (targetType === 'CHECKLIST') {
        openChecklistMobile();
    } else if (targetType === 'NUMBERED') {
        openStepsMobile();
    }
}

function openChatMobile() {
    if (!currentTaskId) return;
    document.getElementById('chat-task-title').textContent = document.getElementById('detail-task-title').textContent;
    openMobileSheet('mobile-chat-modal');
    loadTaskElements();
}

function openChecklistMobile() {
    if (!currentTaskId) return;
    openMobileSheet('mobile-checklist-modal');
    loadTaskElements();
}

function openStepsMobile() {
    if (!currentTaskId) return;
    openMobileSheet('mobile-steps-modal');
    loadTaskElements();
}

// --- HELPERS ---
const nameColors = [
    '#e542a3', // Rosa
    '#34b7f1', // Celeste
    '#f59e0b', // Ambar
    '#10b981', // Esmeralda
    '#6366f1', // Indigo
    '#ef4444'  // Rojo
];

function getUserColor(name) {
    if (!name) return nameColors[0];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return nameColors[Math.abs(hash) % nameColors.length];
}

async function loadTaskElements(silent = false) {
    if (!currentTaskId) return;
    
    console.log(`Cargando elementos de tarea ${currentTaskId}... (silent: ${silent})`);
    
    // Si NO es silencio, o si la lista está vacía, forzamos recarga total
    if (!silent || currentElements.length === 0) {
        const elements = await Storage.getTaskElements(currentTaskId);
        currentElements = elements;
        console.log(`Se cargaron ${elements.length} elementos de la DB.`);
    } else {
        // Si es silencio, confiamos en que Realtime o la inserción local ya actualizó currentElements
        console.log("Modo silencioso: Manteniendo elementos actuales para evitar parpadeos.");
    }
    
    await renderTaskElementsMobile(true); // Siempre intentamos scroll si es necesario
}

async function renderTaskElementsMobile(checkScroll = false) {
    console.log("Renderizando elementos de tarea (Mobile)...");
    const elements = currentElements;
    const commentsList = document.getElementById('mobile-comments-list');
    if (!commentsList) return;

    // Checklist
    const checks = elements.filter(e => e.tipo === 'CHECKLIST').sort((a,b) => a.posicion - b.posicion);
    const checklistContainer = document.getElementById('mobile-checklist-items');
    if (checklistContainer) {
        checklistContainer.innerHTML = checks.map(e => `
            <div class="check-item-mobile">
                <div class="check-box ${e.completada ? 'checked' : ''}" onclick="toggleElement('${e.id}', ${!e.completada})">
                    ${e.completada ? '<i class="fas fa-check"></i>' : ''}
                </div>
                <span class="${e.completada ? 'done' : ''}">${e.contenido}</span>
                <button class="btn-delete-small" onclick="deleteElement('${e.id}')"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
    }

    // Lista Numerada
    const numbered = elements.filter(e => e.tipo === 'NUMBERED').sort((a,b) => a.posicion - b.posicion);
    const orderedListEl = document.getElementById('mobile-ordered-items');
    if (orderedListEl) {
        orderedListEl.innerHTML = numbered.map((e, idx) => `
            <div class="check-item-mobile ordered-item-row" data-id="${e.id}" style="cursor: move;">
                <div class="drag-handle" style="color: #cbd5e1; margin-right: 12px;"><i class="fas fa-grip-vertical"></i></div>
                <div class="step-num" style="background:var(--primary); color:white; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; margin-right:10px;">${idx + 1}</div>
                <span style="flex:1;">${e.contenido}</span>
                <button class="btn-delete-small" onclick="deleteElement('${e.id}')"><i class="fas fa-times"></i></button>
            </div>
        `).join('');
        
        if (numbered.length > 0) {
            if (orderedListEl.sortableInstance) orderedListEl.sortableInstance.destroy();
            orderedListEl.sortableInstance = new Sortable(orderedListEl, {
                animation: 300,
                handle: '.drag-handle',
                onEnd: async () => {
                    const rows = Array.from(orderedListEl.querySelectorAll('.ordered-item-row'));
                    const newOrder = rows.map((row, index) => ({ id: row.dataset.id, posicion: index + 1 }));
                    await Storage.reorderTaskElements(newOrder);
                }
            });
        }
    }

    // Comentarios
    const comments = elements.filter(e => e.tipo === 'COMMENT').sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const session = await AuthService.getSession();
    
    commentsList.innerHTML = comments.map(e => {
        const isMe = session && e.usuario_id === session.user.id;
        const authorName = e.usuario_nombre || 'Usuario';
        const authorColor = isMe ? '#059669' : getUserColor(authorName);
        const hasImage = e.archivo_url && (e.archivo_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || (e.archivo_tipo && e.archivo_tipo.startsWith('image/')));
        const hasAudio = e.archivo_url && (e.archivo_url.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i) || (e.archivo_tipo && e.archivo_tipo.startsWith('audio/')));
        
        let replyBlock = '';
        if (e.reply_to_id) {
            const parent = elements.find(p => p.id === e.reply_to_id);
            if (parent) {
                const parentText = parent.contenido ? ChatUtils.linkify(parent.contenido) : (parent.archivo_url ? '📎 Archivo' : 'Mensaje original');
                const parentAuthor = session && parent.usuario_id === session.user.id ? 'Tú' : (parent.usuario_nombre || 'Usuario');
                replyBlock = `<div class="m-reply-ref" onclick="event.stopPropagation(); scrollToMobileMessage('${parent.id}')"><div class="m-reply-author" style="color: ${getUserColor(parentAuthor)}">${parentAuthor}</div><div class="m-reply-text">${parentText}</div></div>`;
            }
        }

        let contentHtml = `<p>${ChatUtils.linkify(e.contenido || '')}</p>`;
        if (hasImage) contentHtml = `<img src="${e.archivo_url}" class="chat-img-mobile" onclick="event.stopPropagation(); ImageViewer.open('${e.archivo_url}', '${e.id}')" />` + contentHtml;
        else if (hasAudio) contentHtml = renderElegantAudioPlayer(e.archivo_url, e.id) + contentHtml;
        else if (e.archivo_url) contentHtml = `<a href="${e.archivo_url}" target="_blank" class="chat-file-link-mobile" onclick="event.stopPropagation();"><i class="fas fa-file-download"></i> Descargar archivo</a>` + contentHtml;

        return `
            <div class="m-comment-wrapper ${isMe ? 'me' : 'other'}" id="m-comment-${e.id}">
                <div class="m-comment-bubble" onclick="handleCommentClick('${e.id}', \`${(e.contenido || '').replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`, ${isMe}, '${authorName.replace(/'/g, "\\'")}')">
                    <div class="m-comment-header"><span class="m-comment-author" style="color: ${authorColor}">${authorName}</span></div>
                    ${replyBlock}
                    <div class="m-comment-body">${contentHtml}</div>
                    <div class="m-comment-footer"><span>${new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
                </div>
            </div>`;
    }).join('');

    if (checkScroll) {
        commentsList.scrollTop = commentsList.scrollHeight;
    }
}

let activeCommentId = null;
let activeCommentContent = "";
let activeCommentAuthor = "";

// Opciones de comentario (Responder/Editar/Eliminar)
function handleCommentClick(id, currentContent, isMe, author) {
    activeCommentId = id;
    activeCommentContent = currentContent;
    activeCommentAuthor = author;
    
    // Solo permitir editar/eliminar si es mío
    const btnEdit = document.getElementById('btn-edit-comment-option');
    const btnDelete = document.getElementById('btn-delete-comment-option');
    
    if (btnEdit) btnEdit.style.display = isMe ? 'flex' : 'none';
    if (btnDelete) btnDelete.style.display = isMe ? 'flex' : 'none';
    
    openMobileSheet('comment-actions-sheet');
}

function replyMobileComment() {
    currentMobileReplyId = activeCommentId;
    closeMobileSheet('comment-actions-sheet');
    
    const preview = document.getElementById('mobile-reply-preview');
    const authorEl = document.getElementById('mobile-reply-author');
    const textEl = document.getElementById('mobile-reply-text');
    
    if (authorEl && textEl) {
        authorEl.textContent = activeCommentAuthor === 'Tú' ? 'Respondiendo a ti' : `Respondiendo a ${activeCommentAuthor}`;
        textEl.textContent = activeCommentContent || '📎 Archivo adjunto';
    }
    
    preview?.classList.remove('hidden');
    document.getElementById('new-comment-mobile')?.focus();
}

function cancelMobileReply() {
    currentMobileReplyId = null;
    document.getElementById('mobile-reply-preview')?.classList.add('hidden');
}

window.replyToMessageWithEditedImage = async (file, originId) => {
    try {
        const path = `daviprojects/task_${currentTaskId}/${Date.now()}_mobile_edited.webp`;
        const archiveUrl = await Storage.uploadFile(file, path);
        
        await Storage.addTaskElement({
            taskId: currentTaskId,
            tipo: 'COMMENT',
            contenido: 'Imagen editada y enviada:',
            posicion: 0,
            archivo_url: archiveUrl,
            archivo_tipo: 'image',
            reply_to_id: originId
        });
        
        // Refrescar discusión
        await openTaskDetail(currentTaskId);
    } catch (err) {
        console.error("Error al enviar imagen editada en móvil:", err);
    }
};

function scrollToMobileMessage(id) {
    const el = document.getElementById(`mobile-comment-${id}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const originalOpacity = el.style.opacity || '1';
        el.style.filter = 'brightness(1.2)';
        setTimeout(() => {
            el.style.filter = '';
        }, 1500);
    }
}

function openCommentEdit() {
    closeMobileSheet('comment-actions-sheet');
    document.getElementById('edit-comment-textarea').value = activeCommentContent;
    openMobileSheet('comment-edit-modal');
}

async function saveEditedComment() {
    const newText = document.getElementById('edit-comment-textarea').value.trim();
    if (!newText) return;
    
    try {
        await Storage.updateTaskElement(activeCommentId, { contenido: newText });
        closeMobileSheet('comment-edit-modal');
        loadTaskElements();
    } catch (e) {
        console.error(e);
        showMobileToast("Error", "No se pudo actualizar");
    }
}

function openCommentDeleteConfirm() {
    closeMobileSheet('comment-actions-sheet');
    openMobileSheet('comment-delete-confirm');
}

async function confirmDeleteComment() {
    try {
        await Storage.deleteTaskElement(activeCommentId);
        closeMobileSheet('comment-delete-confirm');
        loadTaskElements();
    } catch (e) {
        console.error(e);
        showMobileToast("Error", "No se pudo eliminar");
    }
}

// Sobrescribir handleAddElement para soportar multimedia en comentarios
async function handleAddElement(type) {
    let inputId = '';
    let btnId = '';
    if (type === 'CHECKLIST') { inputId = 'new-check-mobile'; btnId = 'btn-add-check-mobile'; }
    if (type === 'NUMBERED') { inputId = 'new-ordered-mobile'; btnId = 'btn-add-ordered-mobile'; }
    if (type === 'COMMENT') { inputId = 'new-comment-mobile'; btnId = 'btn-send-comment-mobile'; }

    const input = document.getElementById(inputId);
    const btn = document.getElementById(btnId);
    if (!input) return;

    const val = input.value.trim();
    
    // Si es comentario, puede ir solo con adjunto
    if (!val && !(type === 'COMMENT' && currentAttachment)) return;

    const originalBtnContent = btn ? btn.innerHTML : '';

    try {
        if (btn) {
            btn.disabled = true; // Prevenir duplicados por click rápido
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        }

        let archivoUrl = null;
        let attachmentToProcess = currentAttachment;

        if (type === 'COMMENT' && currentAttachment) {
            showMobileToast("Subiendo...", "Estamos cargando tu archivo");
            
            let fileToUpload = currentAttachment;
            let finalName = currentAttachment.name;

            // Compresión WebP 80% si es imagen
            if (currentAttachment.type.startsWith('image/')) {
                try {
                    fileToUpload = await ChatUtils.compressToWebP(currentAttachment, 0.8);
                    finalName = fileToUpload.name;
                    attachmentToProcess = fileToUpload; // Usar el nuevo archivo para el tipo
                } catch (e) {
                    console.error("Error comprimiendo imagen:", e);
                }
            }

            const path = `multimedia/${Date.now()}_${finalName}`;
            archivoUrl = await Storage.uploadFile(fileToUpload, path);
        }

        const newEl = await Storage.addTaskElement({
            taskId: currentTaskId,
            tipo: type,
            contenido: val || (currentAttachment ? 'Adjunto' : ''),
            archivo_url: archivoUrl,
            archivo_tipo: attachmentToProcess ? attachmentToProcess.type : null,
            posicion: Math.floor(Date.now() / 1000),
            reply_to_id: type === 'COMMENT' ? currentMobileReplyId : null
        });

        const labels = { 'COMMENT': 'comentario', 'CHECKLIST': 'checklist', 'NUMBERED': 'lista' };
        
        let logDetail = `Añadió un *${labels[type]}*:\n"${val || (currentAttachment ? 'Archivo adjunto' : '')}"`;
        let logActionType = 'AÑADIR';

        if (type === 'COMMENT' && currentMobileReplyId) {
            const parent = currentElements.find(p => p.id === currentMobileReplyId);
            const truncatedParent = parent?.contenido ? (parent.contenido.substring(0, 30) + (parent.contenido.length > 30 ? '...' : '')) : (parent?.archivo_url ? '📎 Archivo' : 'Mensaje');
            logDetail = `Respondió a: *"${truncatedParent}"*\n💬 *Respuesta:* "${val}"`;
            logActionType = 'RESPONDER';
        }
        
        logMobileAction(logActionType, logDetail, currentTaskId); // No bloquear la UI esperando el log

        input.value = '';
        if (type === 'COMMENT') {
            autoResizeTextarea(input);
            clearMobileAttachment();
            cancelMobileReply();
        }
        
        // Optimización: No recargamos todo de la DB inmediatamente si el Realtime está activo y lo hace
        // O si lo hacemos, asegurémonos de que el Realtime no cause duplicados visuales temporales.
        // Pero lo más seguro es dejar que Realtime maneje la inserción y nosotros solo limpiar.
        // Sin embargo, para seguridad de que se guardó, podemos llamar a loadTaskElements(true)
        await loadTaskElements(true); 
    } catch (e) {
        console.error(e);
        showMobileToast("Error", "No se pudo guardar", true);
    } finally {
        const resetBtn = document.getElementById(btnId);
        if (resetBtn) {
            resetBtn.disabled = false;
            resetBtn.innerHTML = originalBtnContent;
        }
    }
}

// Escuchar click en el boton de enviar comentario específicamente
document.addEventListener('click', (e) => {
    if (e.target.id === 'btn-send-comment-mobile' || e.target.closest('#btn-send-comment-mobile')) {
        handleAddElement('COMMENT');
    }
    if (e.target.id === 'btn-add-check-mobile' || e.target.closest('#btn-add-check-mobile')) {
        handleAddElement('CHECKLIST');
    }
    if (e.target.id === 'btn-add-ordered-mobile' || e.target.closest('#btn-add-ordered-mobile')) {
        handleAddElement('NUMBERED');
    }
});

async function toggleElement(id, status) {
    const item = currentElements.find(e => e.id === id);
    if (!item) return;

    // --- ACCIÓN INSTANTÁNEA (OPTIMISTIC UI) ---
    const oldStatus = item.completada;
    item.completada = status;
    
    // Render local inmediato (actualizamos solo el DOM necesario o todo el panel)
    // Para simplificar y asegurar consistencia, re-renderizamos el checklist
    renderChecklistOnly();

    // --- SINCRONIZACIÓN EN SEGUNDO PLANO ---
    (async () => {
        try {
            await Storage.updateTaskElement(id, { completada: status });
            
            const accion = status ? 'COMPLETAR' : 'DESMARCAR';
            const detalle = `${status ? 'marcó como completada' : 'desmarcó'} el item de checklist "${item.contenido}"`;
            await logMobileAction(accion, detalle, currentTaskId);
        } catch (e) {
            console.error("Error toggling element:", e);
            item.completada = oldStatus;
            renderChecklistOnly();
            showMobileToast("Error", "Error al sincronizar cambio", true);
        }
    })();
}

// Función auxiliar para renderizado rápido de checklist sin recargar de DB
function renderChecklistOnly() {
    const checks = currentElements.filter(e => e.tipo === 'CHECKLIST').sort((a,b) => a.posicion - b.posicion);
    document.getElementById('mobile-checklist-items').innerHTML = checks.map(e => `
        <div class="check-item-mobile">
            <div class="check-box ${e.completada ? 'checked' : ''}" onclick="toggleElement('${e.id}', ${!e.completada})">
                ${e.completada ? '<i class="fas fa-check"></i>' : ''}
            </div>
            <span class="${e.completada ? 'done' : ''}">${e.contenido}</span>
            <button class="btn-delete-small" onclick="deleteElement('${e.id}')"><i class="fas fa-times"></i></button>
        </div>
    `).join('');
}

async function deleteElement(id) {
    const item = currentElements.find(e => e.id === id);
    if (!await showMobileConfirm("Eliminar", "¿Eliminar este elemento?", "danger")) return;
    await Storage.deleteTaskElement(id);
    
    if (item) {
        const labels = { 'COMMENT': 'comentario', 'CHECKLIST': 'checklist', 'NUMBERED': 'lista' };
        await logMobileAction('ELIMINAR', `eliminó un ${labels[item.tipo] || 'elemento'}: *"${item.contenido}"*`, currentTaskId);
    }
    
    loadTaskElements();
}

async function updateTaskStatusMobile(newStatus) {
    const task = currentTasks.find(t => t.id === currentTaskId);
    if (!task) return;
    
    const oldStatus = task.estado;
    if (oldStatus === newStatus) return;

    let motivo = null;
    if (newStatus === 'REVIEW' || newStatus === 'REJECTED') {
        const actionLabel = newStatus === 'REVIEW' ? 'la Revisión' : 'el Rechazo';
        motivo = await promptMotivoMobile(`Motivo de ${actionLabel}`);
        if (motivo === null) return; // Cancelado
    }

    // --- ACCIÓN INSTANTÁNEA (OPTIMISTIC UI) ---
    task.estado = newStatus;
    if (motivo) task.motivo = motivo;
    
    // Cerrar modal y cambiar filtro inmediatamente para feedback instantáneo
    closeMobileSheet('mobile-task-detail');
    currentStatusFilter = newStatus;
    
    document.querySelectorAll('.filter-pill').forEach(pill => {
        pill.classList.toggle('active', pill.dataset.status === newStatus);
    });

    renderTasks();
    updateMetrics();

    // --- SINCRONIZACIÓN EN SEGUNDO PLANO ---
    (async () => {
        try {
            await Storage.updateTaskStatus(currentTaskId, newStatus, motivo);
            
            const labels = {
                'TODO': 'Pendiente',
                'DOING': 'En curso',
                'DONE': 'Listo',
                'REVIEW': 'Revisión',
                'REJECTED': 'Rechazado'
            };
            
            await logMobileAction('MOVER', `movió la tarea *"${task.titulo}"* de *${labels[oldStatus] || oldStatus}* a *${labels[newStatus] || newStatus}*`, currentTaskId);
            
        } catch (e) {
            console.error("Error en sincronización de estado:", e);
            showMobileToast("Sincronización Fallida", "No se pudo actualizar en el servidor. Revirtiendo...", true);
            
            // ROLLBACK (Volver al estado anterior)
            task.estado = oldStatus;
            currentStatusFilter = oldStatus;
            document.querySelectorAll('.filter-pill').forEach(pill => {
                pill.classList.toggle('active', pill.dataset.status === oldStatus);
            });
            renderTasks();
            updateMetrics();
        }
    })();
}

// --- PROMPT MOTIVO MÓVIL ---
function promptMotivoMobile(titulo) {
    return new Promise((resolve) => {
        const modal = document.getElementById('mobile-modal-motivo');
        const input = document.getElementById('mobile-motivo-input');
        const btnConfirm = document.getElementById('btn-confirm-motivo-mobile');
        const btnCancel = document.getElementById('btn-cancel-motivo-mobile');
        const btnCloseX = modal.querySelector('.sheet-header .btn-icon');
        const titleEl = document.getElementById('mobile-motivo-title');

        titleEl.textContent = titulo;
        input.value = '';
        openMobileSheet('mobile-modal-motivo');
        setTimeout(() => input.focus(), 300);

        const handleConfirm = () => {
            const val = input.value.trim();
            if (!val) {
                showMobileToast("Aviso", "El motivo es obligatorio", true);
                return;
            }
            removeListeners();
            closeMobileSheet('mobile-modal-motivo');
            resolve(val);
        };

        const handleCancel = () => {
            removeListeners();
            closeMobileSheet('mobile-modal-motivo');
            resolve(null);
        };

        const removeListeners = () => {
            btnConfirm.removeEventListener('click', handleConfirm);
            btnCancel.removeEventListener('click', handleCancel);
            btnCloseX.removeEventListener('click', handleCancel);
        };

        btnConfirm.addEventListener('click', handleConfirm);
        btnCancel.addEventListener('click', handleCancel);
        btnCloseX.addEventListener('click', handleCancel);
        
        // También manejar clic fuera si el sistema lo soporta (overlay)
        modal.onclick = (e) => { if (e.target === modal) handleCancel(); };
    });
}

async function handleDeleteTask() {
    const task = currentTasks.find(t => t.id === currentTaskId);
    if (!task) return;
    if (!await showMobileConfirm("Eliminar Tarea", "¿Estás seguro de eliminar esta tarea permanentemente?", "danger")) return;
    
    try {
        const title = task.titulo;
        await Storage.deleteTask(currentTaskId);
        
        await logMobileAction('ELIMINAR', `eliminó la tarea *"${title}"*`, currentTaskId);

        closeMobileSheet('mobile-task-detail');
        currentTasks = await Storage.getTasks(currentProjectId);
        renderTasks();
        updateMetrics();
        showMobileToast("Eliminada", "Tarea borrada con éxito");
    } catch (e) {
        showMobileToast("Error", "No se pudo eliminar", true);
    }
}

// --- EDICIÓN DE TAREAS ---
function openEditTaskMobile() {
    const task = currentTasks.find(t => t.id === currentTaskId);
    if (!task) return;

    document.getElementById('mobile-edit-task-title').value = task.titulo;
    document.getElementById('mobile-edit-task-desc').value = task.descripcion || '';
    document.getElementById('mobile-edit-task-priority').value = task.prioridad || 1;
    document.getElementById('mobile-edit-task-due').value = task.fecha_vencimiento ? task.fecha_vencimiento.split('T')[0] : '';
    
    updateMobilePriorityUI(task.prioridad || 1, 'mobile-edit');
    openMobileSheet('mobile-modal-edit-task');
}

async function saveTaskUpdateMobile() {
    const btn = document.getElementById('btn-save-edit-task-mobile');
    const title = document.getElementById('mobile-edit-task-title').value.trim();
    const desc = document.getElementById('mobile-edit-task-desc').value.trim();
    const priority = parseInt(document.getElementById('mobile-edit-task-priority').value);
    const dueDate = document.getElementById('mobile-edit-task-due').value;

    if (!title) return showMobileToast("Error", "El título es obligatorio", true);

    const originalText = btn.innerHTML;
    try {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Actualizando...';

        await Storage.updateTask(currentTaskId, {
            titulo: title,
            descripcion: desc,
            prioridad: priority,
            fecha_vencimiento: dueDate || null
        });

        await logMobileAction('EDITAR', `editó la tarea *"${title}"*`, currentTaskId);

        // Actualizar datos locales
        currentTasks = await Storage.getTasks(currentProjectId);
        
        // Refrescar modal de detalle con los nuevos datos
        const updatedTask = currentTasks.find(t => t.id === currentTaskId);
        if (updatedTask) {
            document.getElementById('detail-task-title').textContent = updatedTask.titulo;
            renderDescriptionWithAudios(document.getElementById('detail-task-desc'), updatedTask.descripcion || 'Sin descripción adicional.');
            updateMobilePriorityUI(updatedTask.prioridad, 'detail');
            const newDue = updatedTask.fecha_vencimiento ? new Date(updatedTask.fecha_vencimiento).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : 'Sin fecha';
            document.getElementById('detail-task-due-text').textContent = newDue;
        }

        renderTasks();
        updateMetrics();
        closeMobileSheet('mobile-modal-edit-task');
        showMobileToast("Éxito", "Tarea actualizada correctamente");

    } catch (e) {
        console.error(e);
        showMobileToast("Error", "No se pudo actualizar la tarea", true);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- HISTORIAL ---
async function renderHistory() {
    const list = document.getElementById('mobile-history-list');
    
    try {
        const history = await Storage.getAllHistory();
        
        if (!history || history.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:2rem; opacity:0.5;">No hay actividad reciente.</p>';
            return;
        }

        // --- AGRUPAR POR TAREA (CARPETAS) ---
        const taskGroups = {};
        history.forEach(item => {
            const taskId = item.tarea_id || `gen_${item.proyecto_id}`;
            if (!taskGroups[taskId]) {
                const project = projects.find(p => p.id === item.proyecto_id);
                taskGroups[taskId] = {
                    id: taskId,
                    projectId: item.proyecto_id,
                    projectName: project ? project.nombre : 'Proyecto desconocido',
                    items: [],
                    lastActivity: item.created_at,
                    title: item.tarea_id ? 'Cargando...' : 'General / Proyecto'
                };
            }
            taskGroups[taskId].items.push(item);
            if (new Date(item.created_at) > new Date(taskGroups[taskId].lastActivity)) {
                taskGroups[taskId].lastActivity = item.created_at;
            }
        });

        // Intentar obtener nombres de tareas para los grupos
        Object.keys(taskGroups).forEach(tid => {
            if (tid.startsWith('gen_')) return;
            const task = allTasks.find(t => t.id === tid);
            if (task) {
                taskGroups[tid].title = task.titulo;
            } else {
                const namedLog = [...taskGroups[tid].items].reverse().find(i => i.detalle && i.detalle.includes('"'));
                if (namedLog) {
                    const match = namedLog.detalle.match(/"([^"]+)"/);
                    if (match) taskGroups[tid].title = match[1];
                } else {
                    taskGroups[tid].title = "Tarea cerrada/eliminada";
                }
            }
        });

        // --- RENDERIZADO SEGÚN ESTADO (GRID O DETALLE) ---
        if (currentHistoryFolder) {
            const group = taskGroups[currentHistoryFolder];
            if (!group) { currentHistoryFolder = null; renderHistory(); return; }

            const itemsHTML = group.items.map(log => {
                let icon = 'fa-history';
                let color = 'var(--accent-color)';
                let detail = log.detalle || '';
                
                if (log.accion === 'RESPONDER') {
                    icon = 'fa-reply'; color = '#8b5cf6';
                } else if (log.accion === 'AÑADIR' && detail.includes('comentario')) {
                    icon = 'fa-comment-dots'; color = '#0d9488';
                } else if (log.accion.includes('ELIMINAR')) {
                    icon = 'fa-trash-alt'; color = '#ef4444';
                } else if (log.accion.includes('CREAR')) {
                    icon = 'fa-plus-circle'; color = '#10b981';
                }

                return `
                <div class="log-item-mobile">
                    <div class="log-icon" style="background: ${color}20; color: ${color};"><i class="fas ${icon}"></i></div>
                    <div class="log-details">
                        <p><strong>${log.usuario_nombre || 'Usuario'}</strong> ${log.accion === 'RESPONDER' ? '' : log.accion.toLowerCase() + ': '}${detail}</p>
                        <span>${new Date(log.created_at).toLocaleString()}</span>
                    </div>
                </div>
                `;
            }).join('');

            list.innerHTML = `
                <div class="history-detail-view">
                    <div class="history-back-header" onclick="currentHistoryFolder = null; renderHistory();">
                        <i class="fas fa-chevron-left"></i>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:0.7rem; opacity:0.6; text-transform:uppercase;">${group.projectName}</span>
                            <span>${group.title}</span>
                        </div>
                    </div>
                    <div class="history-list-mobile">${itemsHTML}</div>
                </div>
            `;
        } else {
            // Agrupar grupos de tareas por PROYECTO para la vista principal
            const projectGroups = {};
            Object.values(taskGroups).forEach(tg => {
                if (!projectGroups[tg.projectId]) {
                    projectGroups[tg.projectId] = {
                        name: tg.projectName,
                        tasks: [],
                        lastActivity: tg.lastActivity
                    };
                }
                projectGroups[tg.projectId].tasks.push(tg);
                if (new Date(tg.lastActivity) > new Date(projectGroups[tg.projectId].lastActivity)) {
                    projectGroups[tg.projectId].lastActivity = tg.lastActivity;
                }
            });

            // Ordenar proyectos por actividad más reciente
            const sortedProjectIds = Object.keys(projectGroups).sort((a,b) => 
                new Date(projectGroups[b].lastActivity) - new Date(projectGroups[a].lastActivity)
            );

            let finalHTML = '';
            sortedProjectIds.forEach(pid => {
                const pg = projectGroups[pid];
                // Ordenar tareas dentro del proyecto por actividad reciente
                const sortedTasks = pg.tasks.sort((a,b) => new Date(b.lastActivity) - new Date(a.lastActivity));
                
                finalHTML += `
                    <div class="history-project-section">
                        <div class="history-project-header">
                            <i class="fas fa-project-diagram"></i>
                            <span>${pg.name}</span>
                        </div>
                        <div class="history-folder-grid">
                            ${sortedTasks.map(group => {
                                const lastDate = new Date(group.lastActivity);
                                const timeStr = getRelativeTime(lastDate);
                                const iconClass = group.id.startsWith('gen_') ? 'fa-info-circle' : 'fa-folder';

                                return `
                                    <div class="history-folder-card" onclick="currentHistoryFolder='${group.id}'; renderHistory();">
                                        <div class="folder-icon-wrapper">
                                            <i class="fas ${iconClass}"></i>
                                        </div>
                                        <div class="folder-content-info">
                                            <h4>${group.title}</h4>
                                            <p>${group.items.length} regs • ${timeStr}</p>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            });

            list.innerHTML = finalHTML;
        }

    } catch (e) {
        console.error("Error al cargar historial.", e);
        list.innerHTML = '<p style="text-align:center; padding:2rem; color:var(--red);">Error al cargar historial.</p>';
    }
}

function getRelativeTime(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);
    if (diffInSeconds < 60) return 'Ahora';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    return date.toLocaleDateString([], { day: '2-digit', month: '2-digit' });
}

// --- HELPERS ---
function openMobileSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    
    sheet.classList.remove('hidden');
    // Forzamos un reflow para que la transición funcione
    void sheet.offsetWidth;
    sheet.classList.add('active');
    
    // Evitar scroll del fondo
    document.body.style.overflow = 'hidden';
}

function closeMobileSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    
    sheet.classList.remove('active');
    // Esperar a que termine la animación antes de ocultar
    setTimeout(() => {
        sheet.classList.add('hidden');
        // Restaurar scroll solo si no hay otros sheets abiertos
        if (!document.querySelector('.mobile-bottom-sheet.active')) {
            document.body.style.overflow = '';
        }
    }, 300);
}

async function showMobileConfirm(title, message, type = 'warning') {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'mobile-confirm-overlay';
        
        const icons = {
            warning: 'fa-exclamation-triangle',
            danger: 'fa-trash-alt',
            info: 'fa-info-circle'
        };

        overlay.innerHTML = `
            <div class="mobile-confirm-card">
                <div class="confirm-icon-box ${type}">
                    <i class="fas ${icons[type] || icons.warning}"></i>
                </div>
                <h4>${title}</h4>
                <p>${message}</p>
                <div class="confirm-actions-row">
                    <button class="confirm-btn-mob cancel">Cancelar</button>
                    <button class="confirm-btn-mob ${type === 'danger' ? 'danger' : 'confirm'}">
                        ${type === 'danger' ? 'Eliminar' : 'Confirmar'}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        overlay.querySelector('.cancel').onclick = () => {
            overlay.remove();
            resolve(false);
        };

        overlay.querySelector('.confirm-btn-mob:not(.cancel)').onclick = () => {
            overlay.remove();
            resolve(true);
        };
    });
}

function showMobileToast(title, message, isError = false) {
    const overlay = document.createElement('div');
    overlay.className = 'mobile-alert-overlay';
    overlay.style.background = 'rgba(7,26,64,0.8)';
    overlay.innerHTML = `
        <div class="mobile-alert-card" style="padding: 1.5rem; text-align: center; border-radius: 1.5rem 1.5rem 0 0;">
            <div class="mob-alert-icon" style="font-size: 2rem; color: ${isError ? '#ef4444' : '#05A64B'};">
                <i class="fas ${isError ? 'fa-times-circle' : 'fa-check-circle'}"></i>
            </div>
            <div class="mob-alert-title" style="font-size: 1.1rem; font-weight: 800; margin-top: 0.5rem;">${title}</div>
            <div class="mob-alert-msg" style="margin-bottom: 1.5rem; font-size: 0.9rem;">${message}</div>
            <button class="mob-alert-btn" style="background:var(--primary); font-weight:700;">Entendido</button>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('button').onclick = () => overlay.remove();
}

// Inicializar
initMobile();

async function initGlobalRealtimeMobile() {
    if (taskElementsChannelMobile) return;

    const session = await AuthService.getSession();
    if (session?.access_token) {
        if (typeof supabaseClient.realtime.setAuth === 'function') {
            supabaseClient.realtime.setAuth(session.access_token);
        }
    }

    console.log("Iniciando suscripción Realtime Global (Mobile)...");

    taskElementsChannelMobile = supabaseClient
        .channel('global-task-elements') // Usar el mismo canal que en Desktop
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'daviprojects_elementos_tarea'
            },
            async (payload) => {
                console.log('⚡ Evento Realtime detectado (Mobile):', payload.eventType, payload);
                const newEl = payload.new;
                const oldEl = payload.old;
                
                // Supabase Realtime DELETE no envía todos los campos en 'old' a menos que la tabla tenga REPLICA IDENTITY FULL
                // Por eso, if es DELETE, verificamos si el ID está en nuestra lista actual.
                const affectedTaskId = newEl ? newEl.tarea_id : (oldEl ? oldEl.tarea_id : null);
                const isRelevant = (currentTaskId && currentTaskId === affectedTaskId) || 
                                  (payload.eventType === 'DELETE' && oldEl && currentElements.some(e => e.id === oldEl.id));

                // 1. Actualización Optimista de la UI
                if (isRelevant) {
                    if (payload.eventType === 'INSERT') {
                        const exists = currentElements.some(e => e.id === newEl.id);
                        if (!exists) {
                            console.log('📝 Añadiendo nuevo elemento vía Realtime (Mobile)...');
                            currentElements.push(newEl);
                            // IMPORTANTE: Ordenar por created_at para mantener consistencia visual
                            currentElements.sort((a, b) => {
                                if (a.tipo === 'COMMENT' && b.tipo === 'COMMENT') {
                                    return new Date(a.created_at) - new Date(b.created_at);
                                }
                                return (a.posicion || 0) - (b.posicion || 0);
                            });
                            renderTaskElementsMobile(true);
                        } else {
                            console.log('⏭️ Elemento ya existe en la lista, saltando render Realtime.');
                        }
                    } else if (payload.eventType === 'UPDATE') {
                        console.log('🔄 Actualizando elemento vía Realtime (Mobile)...');
                        const index = currentElements.findIndex(e => e.id === newEl.id);
                        if (index !== -1) {
                            currentElements[index] = { ...currentElements[index], ...newEl };
                            renderTaskElementsMobile(false);
                        }
                    } else if (payload.eventType === 'DELETE') {
                        console.log('🗑️ Eliminando elemento vía Realtime (Mobile)...');
                        currentElements = currentElements.filter(e => e.id !== oldEl.id);
                        renderTaskElementsMobile(false);
                    }
                }

                // 2. Notificaciones (Solo si es INSERT y no es nuestro)
                if (payload.eventType === 'INSERT' && newEl && newEl.usuario_id !== currentUserIdMobile) {
                    console.log('🔔 Notificación externa recibida!');
                    playNotificationSoundMobile();

                    const labels = {
                        'COMMENT': 'nuevo comentario',
                        'CHECKLIST': 'nuevo elemento de checklist',
                        'NUMBERED': 'nuevo elemento de lista'
                    };

                    const typeLabel = labels[newEl.tipo] || 'nuevo elemento';
                    const userLabel = newEl.usuario_nombre || 'Usuario';

                    showMobileNotificationToast(typeLabel, userLabel, newEl.contenido, newEl.tarea_id, newEl.tipo);
                    
                    if (window.NotificationHelper) {
                        NotificationHelper.showNotification(`🔔 ${userLabel}: ${typeLabel}`, {
                            body: newEl.contenido || '(Adjunto)',
                            tag: `task-${newEl.tarea_id}`,
                            data: { taskId: newEl.tarea_id }
                        });
                    }
                }
            }
        )
        .subscribe((status) => {
            console.log("Estado suscripción Realtime Mobile:", status);
        });
}

function playNotificationSoundMobile() {
    const audio = document.getElementById('notifSound') || new Audio('https://cdnjs.cloudflare.com/ajax/libs/ion-sound/3.0.7/sounds/button_tiny.mp3');
    if (audio) {
        audio.currentTime = 0;
        audio.play().catch(e => console.warn("Audio play blocked", e));
    }
}

function showMobileNotificationToast(type, user, content, taskId, targetType = null) {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'toast';
    
    let displayContent = content || '';
    if (displayContent.length > 50) displayContent = displayContent.substring(0, 50) + '...';

    let iconClass = 'fa-comment-alt';
    if (type.includes('checklist')) iconClass = 'fa-check-square';
    if (type.includes('lista')) iconClass = 'fa-list-ol';

    toast.innerHTML = `
        <div class="toast-icon-circle">
            <i class="fas ${iconClass}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-header">
                <span class="toast-type">${type}</span>
                <span class="toast-user">${user}</span>
            </div>
            <div class="toast-body">${displayContent || '(Adjunto)'}</div>
        </div>
        <button class="toast-btn"><i class="fas fa-chevron-right"></i></button>
    `;

    toast.onclick = () => {
        openTaskDetail(taskId, targetType);
        toast.style.animation = 'fadeOutToast 0.3s forwards';
        setTimeout(() => toast.remove(), 300);
    };

    container.appendChild(toast);
    setTimeout(() => { 
        if (toast.parentElement) {
            toast.style.animation = 'fadeOutToast 0.3s forwards';
            setTimeout(() => toast.remove(), 300); 
        }
    }, 6000);
}

// --- FUNCIONES NUEVA NAVEGACIÓN Y MÚSICA ---
let mobileMusicData = []; 
let isReactingMobile = false; // Bloqueo para evitar spam de clics

// Configuración de Caché DreamNotes Music Mobile
const MUSIC_CACHE_KEY_MOB = 'dreamnotes_music_cache_mobile';
const MUSIC_CACHE_DAYS_MOB = 7;

function getMusicCacheMobile() {
    const cached = localStorage.getItem(MUSIC_CACHE_KEY_MOB);
    if (!cached) return null;
    try {
        const parsed = JSON.parse(cached);
        const days = (Date.now() - parsed.timestamp) / (1000 * 60 * 60 * 24);
        return days > MUSIC_CACHE_DAYS_MOB ? null : parsed.data;
    } catch (e) { return null; }
}

function saveMusicCacheMobile(data) {
    localStorage.setItem(MUSIC_CACHE_KEY_MOB, JSON.stringify({
        timestamp: Date.now(),
        data: data
    }));
}

function showMusicLoadingMobile() {
    const loader = document.getElementById('music-loader-container');
    if (loader) loader.classList.remove('hidden');
}

function hideMusicLoadingMobile() {
    const loader = document.getElementById('music-loader-container');
    if (loader) loader.classList.add('hidden');
}

function getStarColor(percentage) {
    if (percentage === 0) return '#cbd5e1'; // Gris si no hay votos
    if (percentage < 40) return '#ef4444';  // Rojo
    if (percentage < 75) return '#f97316';  // Naranja
    return '#facc15';                       // Amarillo medio
}

function openMobileMoreMenu() {
    openMobileSheet('mobile-more-menu');
}

function goToMenuOption(viewId) {
    closeMobileSheet('mobile-more-menu');
    switchView(viewId);
}

// Inicializar clics de música
if(document.getElementById('nav-btn-music')) {
    document.getElementById('nav-btn-music').onclick = () => switchView('mobile-music-view');
}
if(document.getElementById('btn-upload-music-mobile')) {
    document.getElementById('btn-upload-music-mobile').onclick = () => openMobileSheet('mobile-modal-music');
}
if(document.getElementById('btn-cancel-music-mobile')) {
    document.getElementById('btn-cancel-music-mobile').onclick = () => closeMobileSheet('mobile-modal-music');
}

async function renderMusicListMobile(skipFetch = false) {
    const list = document.getElementById('mobile-music-list');
    if (!list) return;

    // 1. Carga desde Caché (Instantánea - Vista Cached)
    const cachedData = getMusicCacheMobile();
    if (cachedData && !skipFetch && mobileMusicData.length === 0) {
        mobileMusicData = cachedData;
        console.log("Cargando música móvil desde caché...");
        _doRenderMusicMobile();
        
        // Sincronizar en segundo plano sin bloquear
        setTimeout(async () => {
            try {
                const freshData = await Storage.getMusic();
                saveMusicCacheMobile(freshData);
                if (JSON.stringify(freshData) !== JSON.stringify(mobileMusicData)) {
                    mobileMusicData = freshData;
                    _doRenderMusicMobile();
                }
            } catch (e) { console.error("Error background sync (Mobile):", e); }
        }, 300);
        return;
    }

    // 2. Si no hay caché o es refresh forzado, mostrar Screenlocker
    if (!skipFetch) showMusicLoadingMobile();

    try {
        if (!skipFetch) {
            mobileMusicData = await Storage.getMusic();
            saveMusicCacheMobile(mobileMusicData);
        }
        _doRenderMusicMobile();
    } catch (e) {
        list.innerHTML = `<p style="padding: 2rem; text-align: center; color: #ef4444;">No se pudo conectar con el Studio.</p>`;
    } finally {
        if (!skipFetch) hideMusicLoadingMobile();
    }
}

function _doRenderMusicMobile() {
    const list = document.getElementById('mobile-music-list');
    if (!list) return;

    if (!mobileMusicData || mobileMusicData.length === 0) {
        list.innerHTML = `<p style="padding: 2rem; text-align: center; color: #94a3b8;">No hay música.</p>`;
        return;
    }

    list.innerHTML = '';
    mobileMusicData.forEach(song => {
        const totalRec = (song.likes_total || 0) + (song.dislikes_total || 0);
        const percentage = totalRec > 0 ? Math.round((song.likes_total || 0) / totalRec * 100) : 0;
        const starColor = getStarColor(percentage);

            const card = document.createElement('div');
            card.className = 'music-card-mobile';
            card.id = `music-card-${song.id}`;
            card.innerHTML = `
                <div class="music-card-header">
                    <div class="music-card-titles">
                        <h4>${song.nombre}</h4>
                        <p>${song.descripcion_corta || 'Sin descripción'}</p>
                    </div>
                    <div class="music-star-badge" style="background: ${starColor}15; color: ${starColor}; border: 1px solid ${starColor}30;">
                        <i class="fas fa-star"></i> <span>${percentage}%</span>
                    </div>
                </div>
                <div class="music-card-footer">
                    <button class="btn-primary-play" onclick="handlePlayClickMobile('${song.id}')">
                        <i class="fas fa-play"></i> Reproducir sesión
                    </button>
                </div>`;
            list.appendChild(card);
        });
}

function handlePlayClickMobile(songId) {
    const song = mobileMusicData.find(s => s.id === songId);
    if (song) playSongMobile(song);
}

async function handleMusicReaction(event, musicId, type) {
    if (isReactingMobile) return;
    
    const idToReact = musicId || (window.currentPlayingSong ? window.currentPlayingSong.id : null);
    if (!idToReact) return;

    isReactingMobile = true;
    
    const targetSong = mobileMusicData.find(s => s.id === idToReact);
    if (!targetSong) { isReactingMobile = false; return; }

    const clickBtn = event ? event.currentTarget : null;
    if (clickBtn) {
        clickBtn.style.transform = "scale(0.85)";
        clickBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        clickBtn.disabled = true;
    }

    const backup = {
        likes: targetSong.likes_total || 0,
        dislikes: targetSong.dislikes_total || 0,
        uLike: targetSong.user_likes_count || 0,
        uDislike: targetSong.user_dislikes_count || 0
    };

    const isLike = type === 'like';
    
    // Lógica Optimista
    if (isLike) {
        if (backup.uLike > 0) { // Quitar like
            targetSong.user_likes_count = 0;
            targetSong.likes_total = Math.max(0, backup.likes - 1);
        } else { // Poner like
            targetSong.user_likes_count = 1;
            targetSong.likes_total = backup.likes + 1;
            if (backup.uDislike > 0) { // Quitar dislike
                targetSong.user_dislikes_count = 0;
                targetSong.dislikes_total = Math.max(0, backup.dislikes - 1);
            }
        }
    } else {
        if (backup.uDislike > 0) { // Quitar dislike
            targetSong.user_dislikes_count = 0;
            targetSong.dislikes_total = Math.max(0, backup.dislikes - 1);
        } else { // Poner dislike
            targetSong.user_dislikes_count = 1;
            targetSong.dislikes_total = backup.dislikes + 1;
            if (backup.uLike > 0) { // Quitar like
                targetSong.user_likes_count = 0;
                targetSong.likes_total = Math.max(0, backup.likes - 1);
            }
        }
    }

    updateMusicCardUI(idToReact, targetSong);

    try {
        const result = await Storage.toggleMusicReaction(idToReact, type);
        if (result && result.success) {
            targetSong.likes_total = result.likes_total;
            targetSong.dislikes_total = result.dislikes_total;
            
            // Sincronización absoluta con el objeto del reproductor si es el mismo tema
            if (window.currentPlayingSong && window.currentPlayingSong.id === idToReact) {
                window.currentPlayingSong.likes_total = targetSong.likes_total;
                window.currentPlayingSong.dislikes_total = targetSong.dislikes_total;
            }

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

            // Sync user counts too
            if (window.currentPlayingSong && window.currentPlayingSong.id === idToReact) {
                window.currentPlayingSong.user_likes_count = targetSong.user_likes_count;
                window.currentPlayingSong.user_dislikes_count = targetSong.user_dislikes_count;
            }
        }
        updateMusicCardUI(idToReact, targetSong);
    } catch (e) {
        console.error("Error en reacción:", e);
        targetSong.likes_total = backup.likes;
        targetSong.dislikes_total = backup.dislikes;
        targetSong.user_likes_count = backup.uLike;
        targetSong.user_dislikes_count = backup.uDislike;
        updateMusicCardUI(idToReact, targetSong);
    } finally {
        isReactingMobile = false;

        // Breve espera para asegurar sincronía entre DB y renderizado del DOM
        setTimeout(() => {
            if (clickBtn) {
                clickBtn.style.transform = "scale(1)";
                clickBtn.disabled = false;
                
                // Reconstruir counts para asegurar que los IDs del toast existan si se acaba de inyectar HTML
                if (type === 'like') {
                    clickBtn.innerHTML = `<i class="fas fa-heart"></i> <span id="toast-like-count">${targetSong.likes_total || 0}</span>`;
                } else {
                    clickBtn.innerHTML = `<i class="fas fa-heart-broken"></i> <span id="toast-dislike-count">${targetSong.dislikes_total || 0}</span>`;
                }
            }
            updateMusicCardUI(idToReact, targetSong);
        }, 50);
    }
}

function updateMusicCardUI(musicId, song) {
    // Actualizar UI del reproductor Toast si es la canción actual
    if (window.currentPlayingSong && window.currentPlayingSong.id === musicId) {
        const btnLikeToast = document.getElementById('btn-toast-like');
        const btnDislikeToast = document.getElementById('btn-toast-dislike');
        const countLikeToast = document.getElementById('toast-like-count');
        const countDislikeToast = document.getElementById('toast-dislike-count');
        
        if (btnLikeToast) {
            btnLikeToast.className = `btn-toast-reaction ${song.user_likes_count > 0 ? 'active-like' : ''}`;
        }
        if (countLikeToast) {
            countLikeToast.textContent = song.likes_total || 0;
        }
        if (btnDislikeToast) {
            btnDislikeToast.className = `btn-toast-reaction ${song.user_dislikes_count > 0 ? 'active-dislike' : ''}`;
        }
        if (countDislikeToast) {
            countDislikeToast.textContent = song.dislikes_total || 0;
        }
    }

    const card = document.getElementById(`music-card-${musicId}`);
    if (!card) return;

    // Estrellas
    const total = (song.likes_total || 0) + (song.dislikes_total || 0);
    const pct = total > 0 ? Math.round((song.likes_total || 0) / total * 100) : 0;
    const color = getStarColor(pct);
    let badge = card.querySelector('.music-star-badge');

    if (badge) {
        badge.style.background = `${color}15`;
        badge.style.color = color;
        badge.style.border = `1px solid ${color}30`;
        badge.innerHTML = `<i class="fas fa-star"></i> <span>${pct}%</span>`;
    }
}


function copyMusicUrl(url) {
    navigator.clipboard.writeText(url).then(() => {
        alert("Enlace copiado al portapapeles");
    });
}

// Lógica de subida música mobile
const musicFileInput = document.getElementById('music-file-mobile');
if (musicFileInput) {
    musicFileInput.onchange = (e) => {
        const dropZone = document.getElementById('music-drop-zone-mobile');
        const statusText = document.getElementById('music-file-status-mobile');
        if (e.target.files && e.target.files[0]) {
            const fileName = e.target.files[0].name;
            statusText.innerHTML = `<strong>Seleccionado:</strong><br>${fileName}`;
            dropZone.classList.add('active');
        } else {
            statusText.innerText = 'Toca para seleccionar archivo MP3';
            dropZone.classList.remove('active');
        }
    };
}

if (document.getElementById('btn-save-music-mobile')) {
    document.getElementById('btn-save-music-mobile').onclick = async () => {
        const btn = document.getElementById('btn-save-music-mobile');
        const name = document.getElementById('music-name-mobile').value;
        const desc = document.getElementById('music-desc-mobile').value;
        const projId = document.getElementById('music-project-select-mobile').value;
        const fileInput = document.getElementById('music-file-mobile');
        const lyrics = document.getElementById('music-lyrics-mobile').value;

        if (!name || !fileInput.files[0]) {
            alert("Nombre y archivo son obligatorios");
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Subiendo material...';

        try {
            const file = fileInput.files[0];
            const fileName = `${Date.now()}_${file.name}`;
            const path = `daviprojects/musicas/${fileName}`;
            
            const publicUrl = await Storage.uploadFile(file, path);
            
            await Storage.addMusic({
                nombre: name,
                descripcion_corta: desc,
                proyecto_id: projId || null,
                url_archivo: publicUrl,
                letra: lyrics
            });

            closeMobileSheet('mobile-modal-music');
            renderMusicListMobile();
            
            // Limpiar campos
            document.getElementById('music-name-mobile').value = '';
            document.getElementById('music-desc-mobile').value = '';
            document.getElementById('music-lyrics-mobile').value = '';
            fileInput.value = '';
            document.getElementById('music-file-status-mobile').innerText = 'Toca para seleccionar archivo MP3';
            document.getElementById('music-drop-zone-mobile').classList.remove('active');

        } catch (error) {
            console.error(error);
            alert("Error al subir música");
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle"></i> Guardar en la Nube';
        }
    };
}

// Cargar proyectos en el select de música
async function loadMusicProjectsMobile() {
    const select = document.getElementById('music-project-select-mobile');
    if (!select) return;
    
    try {
        const projects = await Storage.getProjects();
        select.innerHTML = '<option value="">Sin vincular a proyecto</option>';
        projects.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.nombre;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error("Error cargando proyectos para música:", e);
    }
}
loadMusicProjectsMobile();

// --- LÓGICA DE REPRODUCTOR DREAMNOTES MUSIC (TOAST & PERSISTENCIA) ---
const audio = document.getElementById('globalMusicAudio');
const toastPlayer = document.getElementById('music-toast-player');
const floatingBtn = document.getElementById('music-floating-play');
const playPauseBtn = document.getElementById('btn-toast-play-pause');
const songNameEl = document.getElementById('toast-song-name');
const songStatusEl = document.getElementById('toast-song-status');
const seekSlider = document.getElementById('music-seek-slider');
const progressFill = document.getElementById('toast-progress-fill');
const volumeBtn = document.getElementById('btn-toast-volume');
const volumeSlider = document.getElementById('music-volume-slider');
const volumePopover = document.getElementById('toast-volume-popover');
const toastLikeBtn = document.getElementById('btn-toast-like');
const toastDislikeBtn = document.getElementById('btn-toast-dislike');

// Lógica de Expansión/Contracción (Lite Mode)
function expandToastPlayer() {
    if (toastPlayer.classList.contains('is-lite')) {
        toastPlayer.classList.remove('is-lite');
    }
}

function shrinkToastPlayer() {
    if (!toastPlayer.classList.contains('hidden') && !toastPlayer.classList.contains('is-lite')) {
        toastPlayer.classList.add('is-lite');
    }
}

// Click en el toast para expandir
toastPlayer.addEventListener('click', (e) => {
    // Si se hace click en el botón de play/pause o volumen no expandir
    const isControl = e.target.closest('#btn-toast-play-pause') || 
                      e.target.closest('.volume-control-group') ||
                      e.target.closest('.toast-reactions-player');
    
    if (isControl) return; 

    if (toastPlayer.classList.contains('is-lite')) {
        expandToastPlayer();
        e.stopPropagation(); 
    }
});

// Detectar scroll para contraer (usamos window para mayor cobertura en mobile)
window.addEventListener('scroll', () => {
    if (currentViewId === 'mobile-music-view') {
        shrinkToastPlayer();
    }
}, { passive: true });

// Detectar clicks fuera para contraer
document.addEventListener('click', (e) => {
    const isMusicView = (currentViewId === 'mobile-music-view');
    if (!isMusicView) return;

    const clickedInsidePlayer = toastPlayer.contains(e.target);
    const clickedPlayButton = e.target.closest('.btn-primary-play');

    // Si clicamos fuera del player y no es el botón de "reproducir" de una card -> contraer
    if (!clickedInsidePlayer && !clickedPlayButton) {
        shrinkToastPlayer();
    }
});

// Cargar volumen guardado
const savedVolume = localStorage.getItem('daviMusicVolume');
if (savedVolume !== null) {
    audio.volume = parseFloat(savedVolume);
    volumeSlider.value = audio.volume;
}

function playSongMobile(song) {
    if (!song) return;
    
    if (audio.src !== song.url_archivo) {
        audio.src = song.url_archivo;
    }
    
    window.currentPlayingSong = song;
    songNameEl.textContent = song.nombre;
    songStatusEl.textContent = "Reproduciendo ahora";
    
    // Actualizar botones y contadores de reacción en el toast
    if (toastLikeBtn) {
        toastLikeBtn.className = `btn-toast-reaction ${song.user_likes_count > 0 ? 'active-like' : ''}`;
        document.getElementById('toast-like-count').textContent = song.likes_total || 0;
        toastLikeBtn.onclick = (e) => handleMusicReaction(e, song.id, 'like');
    }
    if (toastDislikeBtn) {
        toastDislikeBtn.className = `btn-toast-reaction ${song.user_dislikes_count > 0 ? 'active-dislike' : ''}`;
        document.getElementById('toast-dislike-count').textContent = song.dislikes_total || 0;
        toastDislikeBtn.onclick = (e) => handleMusicReaction(e, song.id, 'dislike');
    }

    audio.play().catch(e => console.error("Error al reproducir:", e));
    
    // Mostrar Toast Player Expandido al inicio
    toastPlayer.classList.remove('hidden');
    toastPlayer.classList.remove('is-lite'); 
    
    // Si no estamos en la vista de música, ocultamos el toast y mostramos el flotante
    updatePlayerVisibility();
}


function togglePlayPause() {
    if (audio.paused) {
        audio.play();
    } else {
        audio.pause();
    }
}

playPauseBtn.onclick = togglePlayPause;
floatingBtn.onclick = togglePlayPause;

// Control de Volumen
volumeBtn.onclick = (e) => {
    e.stopPropagation();
    volumePopover.classList.toggle('hidden');
};

volumeSlider.oninput = (e) => {
    const vol = parseFloat(e.target.value);
    audio.volume = vol;
    localStorage.setItem('daviMusicVolume', vol);
    
    // Actualizar icono
    const icon = volumeBtn.querySelector('i');
    if (vol === 0) icon.className = 'fas fa-volume-mute';
    else if (vol < 0.5) icon.className = 'fas fa-volume-down';
    else icon.className = 'fas fa-volume-up';
};

// Cerrar popover de volumen al tocar fuera
document.addEventListener('click', (e) => {
    if (volumePopover && !volumePopover.contains(e.target) && e.target !== volumeBtn) {
        volumePopover.classList.add('hidden');
    }
});

// Seek Bar logic
seekSlider.oninput = () => {
    const seekTo = audio.duration * (seekSlider.value / 100);
    audio.currentTime = seekTo;
};

audio.ontimeupdate = () => {
    if (!audio.duration) return;
    const progress = (audio.currentTime / audio.duration) * 100;
    seekSlider.value = progress;
    progressFill.style.width = `${progress}%`;
};

audio.onplay = () => {
    playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
    floatingBtn.innerHTML = '<div class="pulse-ring"></div><i class="fas fa-pause"></i>';
    songStatusEl.textContent = "En curso";
};

audio.onpause = () => {
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    floatingBtn.innerHTML = '<i class="fas fa-play"></i>';
    songStatusEl.textContent = "En pausa";
};

audio.onended = () => {
    playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
    floatingBtn.innerHTML = '<i class="fas fa-play"></i>';
    songStatusEl.textContent = "Finalizado";
};

// Lógica de visibilidad persistente
function updatePlayerVisibility() {
    if (!audio || !toastPlayer || !floatingBtn) return;
    
    const isMusicView = (currentViewId === 'mobile-music-view');
    const hasAudio = audio.src && audio.src.length > 5 && !audio.src.endsWith(window.location.pathname) && window.currentPlayingSong;

    if (!hasAudio) {
        toastPlayer.classList.add('hidden');
        floatingBtn.classList.add('hidden');
        return;
    }

    if (isMusicView) {
        toastPlayer.classList.remove('hidden');
        floatingBtn.classList.add('hidden');
    } else {
        toastPlayer.classList.add('hidden');
        
        // REGLA: Si salimos de música y NO está sonando, no mostramos el flotante.
        // Pero si ya estaba visible el flotante (porque estaba sonando), se mantiene aunque pausemos.
        const isAlreadyVisible = !floatingBtn.classList.contains('hidden');
        const isPlaying = !audio.paused;

        if (isPlaying || isAlreadyVisible) {
            floatingBtn.classList.remove('hidden');
        } else {
            floatingBtn.classList.add('hidden');
        }
    }
}

// Si switchView no es global, lo buscamos en el script
// He visto que se usa en event listeners al principio del archivo.
// Vamos a buscar la definición de switchView.

