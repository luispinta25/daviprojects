// Variables de estado
let projects = [];
let allTasks = []; // Todas las tareas de todos los proyectos (para métricas)
let currentTasks = []; // Tareas del proyecto seleccionado
let currentProjectId = null;
let currentTaskId = null;
let currentAttachment = null;
let currentMobileReplyId = null; // Para respuestas style WhatsApp

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
let currentHistoryFolder = null; // Carpeta de historial seleccionada
let currentElements = []; // Elementos de la tarea actual

// Elementos del DOM
const views = document.querySelectorAll('.view');
const navItems = document.querySelectorAll('.nav-item');
const projectGallery = document.getElementById('mobile-project-gallery');
const fullProjectsList = document.getElementById('mobile-full-projects-list');
const taskList = document.getElementById('mobile-task-list');
const projectNameTitle = document.getElementById('mobile-project-name');
const statusFilters = document.querySelectorAll('.filter-pill');

// --- INICIALIZACIÓN ---
async function initMobile() {
    // Sesión
    supabaseClient.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT') window.location.href = 'auth/login.html';
    });

    const session = await AuthService.getSession();
    if (session) {
        try {
            const profile = await AuthService.getUserProfile(session.user.id);
            if (profile) {
                document.querySelector('.user-avatar-small').textContent = profile.nombre.substring(0,2).toUpperCase();
                document.getElementById('mobile-user-welcome').textContent = `Hola, ${profile.nombre.split(' ')[0]}`;
            }
        } catch (e) {
            console.error("Error cargando perfil", e);
        }
    }

    // Configuración de navegación
    navItems.forEach(item => {
        item.onclick = () => {
            const targetView = item.dataset.view;
            if (targetView) switchView(targetView);
        };
    });

    document.getElementById('btn-see-all-projects').onclick = () => switchView('mobile-all-projects-view');
    document.getElementById('btn-back-to-gallery').onclick = () => switchView('mobile-gallery-view');
    document.getElementById('btn-new-project-mobile').onclick = () => openMobileSheet('mobile-modal-project');
    document.getElementById('mobile-btn-logout').onclick = () => AuthService.logout();
    
    // Filtros de estado
    statusFilters.forEach(btn => {
        btn.onclick = () => {
            statusFilters.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentStatusFilter = btn.dataset.status;
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
        openMobileSheet('mobile-modal-project');
    };

    document.getElementById('save-task-mobile').onclick = handleSaveTask;
    
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
        await createProject(name, desc, due);
        closeMobileSheet('mobile-modal-project');
        // Limpiar
        document.getElementById('mobile-project-name-input').value = '';
        document.getElementById('mobile-project-desc-input').value = '';
        document.getElementById('mobile-project-due-input').value = '';
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
            setTimeout(() => openTaskDetail(taskIdParam), 300);
            return;
        }
    }

    // 2. Si solo hay ID de proyecto
    if (projectIdParam) {
        const targetProject = projects.find(p => p.id === projectIdParam);
        if (targetProject) {
            await selectProject(targetProject.id);
            return;
        }
    }

    switchView('mobile-gallery-view');
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
async function loadData() {
    projects = await Storage.getProjects();
    allTasks = await Storage.getTasks(); // Cargar todas para métricas
    
    updateMetrics();
    renderProjectGalleries();
    if (document.getElementById('mobile-history-view').classList.contains('active')) {
        renderHistory();
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
    views.forEach(v => {
        v.classList.add('hidden');
        v.classList.remove('active');
    });
    const target = document.getElementById(viewId);
    target.classList.remove('hidden');
    target.classList.add('active', 'fadeIn');

    // Actualizar nav bottom
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.view === viewId) item.classList.add('active');
    });

    // --- Lógica Contextual Botón CREAR ---
    const btnAddMain = document.getElementById('btn-add-main-mobile');
    if (viewId === 'mobile-tasks-view') {
        // Modo Tareas (Azul)
        btnAddMain.classList.add('task-mode');
        btnAddMain.onclick = () => {
            if (!currentProjectId) {
                showMobileToast("Aviso", "Primero selecciona un proyecto", true);
                return;
            }
            openMobileSheet('mobile-modal-task');
        };
    } else if (viewId === 'mobile-gallery-view' || viewId === 'mobile-all-projects-view') {
        // Modo Proyectos (Verde)
        btnAddMain.classList.remove('task-mode');
        btnAddMain.onclick = () => {
            openMobileSheet('mobile-modal-project');
        };
    } else {
        // Otros (Selector genérico)
        btnAddMain.classList.remove('task-mode');
        btnAddMain.onclick = () => openMobileSheet('mobile-modal-actions');
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
        // Solo TODO, DOING, DONE
        const pTasks = allTasks.filter(t => t.proyecto_id === p.id && ['TODO', 'DOING', 'DONE'].includes(t.estado || 'TODO'));
        const done = pTasks.filter(t => t.estado === 'DONE').length;
        const prog = pTasks.length > 0 ? Math.round((done / pTasks.length) * 100) : 0;
        
        return `
            <div class="mobile-project-card" onclick="selectProject('${p.id}')">
                <div class="card-ico-box">
                    <i class="fas fa-folder"></i>
                </div>
                <div class="card-info">
                    <h4>${p.nombre}</h4>
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
        projectGallery.innerHTML = projects.slice(0, 3).map(renderCard).join('') || '<p class="text-muted">No hay proyectos</p>';
    }
    
    fullProjectsList.innerHTML = listToRender.map(renderCard).join('') || '<p style="text-align:center; padding:2rem; opacity:0.5;">No se encontraron proyectos.</p>';
}

async function createProject(nombre, descripcion = '', fecha_vencimiento = null) {
    try {
        const newProj = await Storage.addProject({ 
            name: nombre, 
            description: descripcion, 
            fecha_vencimiento: fecha_vencimiento 
        });
        
        await logMobileAction('CREAR_PROYECTO', `creó el proyecto *"${nombre}"*`, null);

        showMobileToast("Éxito", "Proyecto creado correctamente");
        await loadData();
    } catch (e) {
        showMobileToast("Error", "No se pudo crear el proyecto", true);
    }
}

async function selectProject(id) {
    currentProjectId = id;
    const project = projects.find(p => p.id === id);
    if (!project) return;

    projectNameTitle.textContent = project.nombre;
    switchView('mobile-tasks-view');
    
    currentTasks = await Storage.getTasks(id);
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
                iconContainer.classList.add('hidden');
            };
            reader.readAsDataURL(currentAttachment);
        } else {
            thumbContainer.classList.add('hidden');
            iconContainer.classList.remove('hidden');
            // Cambiar icono según tipo si se desea (opcional)
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
    document.getElementById('mobile-file-input').value = '';
    document.getElementById('mobile-attachment-preview').classList.add('hidden');
    // Reset preview visuals
    document.getElementById('mobile-preview-thumb-container').classList.add('hidden');
    document.getElementById('mobile-preview-icon').classList.remove('hidden');
    document.getElementById('mobile-preview-img').src = '';
}

// --- DETALLE DE TAREA ---
async function openTaskDetail(id) {
    currentTaskId = id;
    const task = currentTasks.find(t => t.id === id);
    if (!task) return;

    document.getElementById('detail-task-title').textContent = task.titulo;
    document.getElementById('detail-task-desc').textContent = task.descripcion || 'Sin descripción adicional.';
    
    // Prioridad y Vencimiento
    updateMobilePriorityUI(task.prioridad || 1, 'detail');
    
    const dueDate = task.fecha_vencimiento ? new Date(task.fecha_vencimiento).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : 'Sin fecha';
    document.getElementById('detail-task-due-text').textContent = dueDate;

    // Actualizar visual de botones de estado
    document.querySelectorAll('.status-opt').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.status === task.estado);
    });

    // Resetear Tabs (Mostrar Chat por defecto)
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const chatTabBtn = document.querySelector('[data-tab="tab-comments"]');
    if (chatTabBtn) chatTabBtn.classList.add('active');

    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    const chatTab = document.getElementById('tab-comments');
    if (chatTab) chatTab.classList.remove('hidden');

    openMobileSheet('mobile-task-detail');
    loadTaskElements();
}

async function loadTaskElements() {
    if (!currentTaskId) return;
    const elements = await Storage.getTaskElements(currentTaskId);
    currentElements = elements; // Guardar para referencia
    
    // Checklist
    const checks = elements.filter(e => e.tipo === 'CHECKLIST').sort((a,b) => a.posicion - b.posicion);
    document.getElementById('mobile-checklist-items').innerHTML = checks.map(e => `
        <div class="check-item-mobile">
            <div class="check-box ${e.completada ? 'checked' : ''}" onclick="toggleElement('${e.id}', ${!e.completada})">
                ${e.completada ? '<i class="fas fa-check"></i>' : ''}
            </div>
            <span class="${e.completada ? 'done' : ''}">${e.contenido}</span>
            <button class="btn-delete-small" onclick="deleteElement('${e.id}')"><i class="fas fa-times"></i></button>
        </div>
    `).join('');

    // Lista Numerada - Con soporte visual de orden
    const numbered = elements.filter(e => e.tipo === 'NUMBERED').sort((a,b) => a.posicion - b.posicion);
    const orderedListEl = document.getElementById('mobile-ordered-items');
    orderedListEl.innerHTML = numbered.map((e, idx) => `
        <div class="check-item-mobile ordered-item-row" data-id="${e.id}" style="cursor: move;">
            <div class="drag-handle" style="color: #cbd5e1; margin-right: 12px;"><i class="fas fa-grip-vertical"></i></div>
            <div class="step-num" style="background:var(--primary); color:white; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:bold; margin-right:10px;">${idx + 1}</div>
            <span style="flex:1;">${e.contenido}</span>
            <button class="btn-delete-small" onclick="deleteElement('${e.id}')"><i class="fas fa-times"></i></button>
        </div>
    `).join('');

    // Inicializar Sortable para la lista numerada
    if (numbered.length > 0) {
        // Limpiar cualquier instancia previa para evitar conflictos
        if (orderedListEl.sortableInstance) orderedListEl.sortableInstance.destroy();

        orderedListEl.sortableInstance = new Sortable(orderedListEl, {
            animation: 300,
            handle: '.drag-handle',
            ghostClass: 'sortable-placeholder',
            chosenClass: 'sortable-chosen',
            dragClass: 'sortable-drag',
            forceFallback: true, // Mejor soporte para scroll en móvil durante arrastre
            fallbackTolerance: 3, // Evita disparar arrastre por error al tocar
            onEnd: async () => {
                const rows = Array.from(orderedListEl.querySelectorAll('.ordered-item-row'));
                const newOrder = rows.map((row, index) => ({
                    id: row.dataset.id,
                    posicion: index + 1
                }));
                try {
                    await Storage.reorderTaskElements(newOrder);
                    // Actualizar números visuales (step-num)
                    rows.forEach((row, idx) => {
                        row.querySelector('.step-num').textContent = idx + 1;
                    });
                } catch (e) {
                    console.error("Error reordenando:", e);
                    showMobileToast("Error", "No se pudo guardar el orden");
                    loadTaskElements(); // Recargar para volver al orden real
                }
            }
        });
    }

    // Comentarios (Chat)
    const comments = elements.filter(e => e.tipo === 'COMMENT').sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
    const session = await AuthService.getSession();
    const commentsList = document.getElementById('mobile-comments-list');
    
    commentsList.innerHTML = comments.map(e => {
        const isMe = e.usuario_id === session.user.id;
        const hasImage = e.archivo_url && (e.archivo_url.match(/\.(jpeg|jpg|gif|png|webp)$/i) || (e.archivo_tipo && e.archivo_tipo.startsWith('image/')));
        const hasAudio = e.archivo_url && (e.archivo_url.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i) || (e.archivo_tipo && e.archivo_tipo.startsWith('audio/')));
        
        // Bloque de respuesta (WhatsApp Style)
        let replyBlock = '';
        if (e.reply_to_id) {
            const parent = elements.find(p => p.id === e.reply_to_id);
            if (parent) {
                const parentText = parent.contenido ? parent.contenido : (parent.archivo_url ? '📎 Archivo' : 'Mensaje original');
                replyBlock = `
                    <div class="reply-reference-mobile" onclick="event.stopPropagation(); scrollToMobileMessage('${parent.id}')">
                        <span class="reply-author-mobile">${parent.usuario_id === session.user.id ? 'Tú' : (parent.usuario_nombre || 'Usuario')}</span>
                        <span class="reply-text-mobile">${parentText}</span>
                    </div>
                `;
            }
        }

        return `
            <div id="mobile-comment-${e.id}" class="comment-bubble ${isMe ? 'me' : 'other'}" onclick="handleCommentClick('${e.id}', \`${(e.contenido || '').replace(/`/g, '\\`')}\`, ${isMe}, \`${(e.usuario_nombre || 'Usuario').replace(/`/g, '\\`')}\`)">
                <span class="comment-meta">${isMe ? 'Tú' : (e.usuario_nombre || 'Usuario')}</span>
                <div class="comment-text">
                    ${replyBlock}
                    ${e.contenido || ''}
                    ${hasImage ? `<img src="${e.archivo_url}" class="comment-image" onclick="event.stopPropagation(); window.open('${e.archivo_url}', '_blank')">` : ''}
                    ${hasAudio ? `
                        <div class="audio-container-mobile" onclick="event.stopPropagation()" style="margin-top:10px; width: 100%;">
                            <audio src="${e.archivo_url}" controls style="width: 100%; height: 35px;"></audio>
                            <a href="javascript:void(0)" onclick="event.stopPropagation(); Storage.downloadFile('${e.archivo_url}', 'audio-${e.id}.mp3', this)" class="audio-download-link" style="display:inline-block; margin-top:5px; font-size:0.7rem; color:inherit; opacity:0.8; min-width: 100px;">
                                <i class="fas fa-download"></i> Descargar audio
                            </a>
                        </div>
                    ` : ''}
                    ${e.archivo_url && !hasImage && !hasAudio ? `<a href="${e.archivo_url}" onclick="event.stopPropagation()" target="_blank" style="display:block; margin-top:8px; color:inherit; font-size:0.8rem; text-decoration:underline;"><i class="fas fa-paperclip"></i> Ver archivo adjunto</a>` : ''}
                </div>
            </div>
        `;
    }).join('');
    
    // Auto scroll al final del chat
    commentsList.scrollTop = commentsList.scrollHeight;
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
    
    authorEl.textContent = activeCommentAuthor === 'Tú' ? 'Respondiendo a ti' : `Respondiendo a ${activeCommentAuthor}`;
    textEl.textContent = activeCommentContent || '📎 Archivo adjunto';
    
    preview?.classList.remove('hidden');
    document.getElementById('new-comment-mobile')?.focus();
}

function cancelMobileReply() {
    currentMobileReplyId = null;
    document.getElementById('mobile-reply-preview')?.classList.add('hidden');
}

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
        if (type === 'COMMENT' && currentAttachment) {
            showMobileToast("Subiendo...", "Estamos cargando tu archivo");
            // Usar la ruta que espera Storage.uploadFile(file, path)
            const path = `multimedia/${Date.now()}_${currentAttachment.name}`;
            archivoUrl = await Storage.uploadFile(currentAttachment, path);
        }

        const newEl = await Storage.addTaskElement({
            taskId: currentTaskId,
            tipo: type,
            contenido: val || (currentAttachment ? 'Adjunto' : ''),
            archivo_url: archivoUrl,
            archivo_tipo: currentAttachment ? currentAttachment.type : null,
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
        
        await logMobileAction(logActionType, logDetail, currentTaskId);

        input.value = '';
        if (type === 'COMMENT') {
            clearMobileAttachment();
            cancelMobileReply();
        }
        
        loadTaskElements();
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
    if (!confirm("¿Eliminar este elemento?")) return;
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
    if (!confirm("¿Estás seguro de eliminar esta tarea permanentemente?")) return;
    
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
            document.getElementById('detail-task-desc').textContent = updatedTask.descripcion || 'Sin descripción adicional.';
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

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado', reg))
            .catch(err => console.error('Error al registrar Service Worker', err));
    });
}

