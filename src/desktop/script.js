// Variables de estado
let projects = [];
let currentProject = null;
let tasks = [];
let currentUserId = null; // Guardar ID del usuario actual
let currentReplyId = null; // ID del comentario al que se está respondiendo
let draggedTaskId = null;
let lastActiveView = 'kanban'; // Persistencia de vista (kanban o history)
let currentHistoryFolder = null; // Carpeta seleccionada en el historial

const STATUS_NAMES = {
    'TODO': 'Por Hacer',
    'DOING': 'En Progreso',
    'DONE': 'Finalizado',
    'REVIEW': 'En Revisión',
    'REJECTED': 'Rechazado'
};

// --- AUTO-SCROLL HORIZONTAL ---
let autoScrollInterval = null;
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

async function showApp() {
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
            }
        } catch (e) {
            console.error("Error al obtener perfil:", e);
        }
    }
    
    // Configurar Sidebar Toggles
    document.getElementById('btn-open-sidebar').onclick = () => {
        document.getElementById('sidebar').classList.remove('closed');
    };
    document.getElementById('btn-close-sidebar').onclick = () => {
        document.getElementById('sidebar').classList.add('closed');
    };

    // Home & Logout
    document.getElementById('btn-home').onclick = showGallery;
    document.getElementById('btn-logout').onclick = async () => {
        await AuthService.logout();
    };

    // Cargar proyectos de Supabase
    projects = await Storage.getProjects();
    await refreshProjectViews();

    // Soporte para Deep Linking (Prioridad Tarea -> Proyecto)
    const urlParams = new URLSearchParams(window.location.search);
    const taskIdParam = urlParams.get('taskId');
    const projectIdParam = urlParams.get('projectId');
    
    // 1. Si hay una tarea, la buscamos para saber a qué proyecto pertenece
    if (taskIdParam) {
        try {
            const targetTask = await Storage.getTask(taskIdParam);
            if (targetTask) {
                const targetProject = projects.find(p => p.id === targetTask.proyecto_id);
                if (targetProject) {
                    await selectProject(targetProject);
                    setTimeout(() => openTaskModal(taskIdParam), 500);
                    return;
                }
            }
        } catch (e) {
            console.error("Error al cargar tarea desde URL:", e);
        }
    }

    // 2. Si solo hay ID de proyecto
    if (projectIdParam) {
        const targetProject = projects.find(p => p.id === projectIdParam);
        if (targetProject) {
            await selectProject(targetProject);
            return;
        }
    }

    // Ya no seleccionamos el primer proyecto por defecto, mostramos la galería (Dashboard)
    await showGallery();
}

async function updateDashboardMetrics() {
    document.getElementById('count-projects').textContent = projects.length;
    
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
    
    document.getElementById('count-tasks-pending').textContent = pending;
    document.getElementById('count-tasks-done').textContent = done;
    
    const countReviewEl = document.getElementById('count-tasks-review');
    if (countReviewEl) countReviewEl.textContent = review;
}

// --- PROJECTS ---
async function showGallery() {
    currentProject = null;
    document.getElementById('current-project-name').textContent = "Dashboard";
    
    // Ocultar todas las vistas y mostrar el dashboard
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('gallery-view').classList.remove('hidden');
    viewControls.classList.add('hidden');
    
    // Auto-contraer sidebar
    document.getElementById('sidebar').classList.add('closed');

    // Navegación active
    document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
    document.getElementById('nav-dashboard').classList.add('active');

    renderProjectList();
    await renderProjectGallery('project-gallery', 3, true);
}

async function showFullProjectsView() {
    currentProject = null;
    document.getElementById('current-project-name').textContent = "Todos los Proyectos";
    
    // Ocultar todas las vistas y mostrar la de proyectos
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById('projects-view').classList.remove('hidden');
    viewControls.classList.add('hidden');
    
    // Auto-contraer sidebar
    document.getElementById('sidebar').classList.add('closed');

    // Navegación active
    document.querySelectorAll('.sidebar-nav li').forEach(li => li.classList.remove('active'));
    document.getElementById('nav-projects').classList.add('active');

    renderProjectList();
    await renderProjectGallery('full-project-gallery', null, false);
}

async function refreshProjectViews() {
    renderProjectList();
    if (!document.getElementById('gallery-view').classList.contains('hidden')) {
        await renderProjectGallery('project-gallery', 3, true);
    }
    if (!document.getElementById('projects-view').classList.contains('hidden')) {
        await renderProjectGallery('full-project-gallery', null, false);
    }
    updateDashboardMetrics();
}

async function renderProjectGallery(containerId = 'project-gallery', limit = null, sortByDueDate = false) {
    const gallery = document.getElementById(containerId);
    if (!gallery) return;
    
    gallery.innerHTML = '';
    
    if (projects.length === 0) {
        gallery.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 3rem; margin-bottom: 1rem;"><i class="fas fa-rocket" style="color: var(--primary);"></i></div>
                <h3>No tienes proyectos aún</h3>
                <p style="color: var(--text-muted); margin-bottom: 1.5rem;">Comienza organizando tu primer gran idea.</p>
                <button class="btn-start" onclick="document.getElementById('modal-project').classList.remove('hidden')">
                    Para empezar crea tu primer proyecto
                </button>
            </div>
        `;
        return;
    }

    // Obtener todas las tareas para calcular porcentajes
    let allTasks = [];
    try {
        allTasks = await Storage.getTasks();
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
        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 0.75rem;">
                <h3 style="margin:0; font-size: 1.1rem; color: var(--primary);">${project.nombre || project.name}</h3>
                <i class="fas fa-trash-alt" style="color:#cbd5e1; cursor:pointer;" onclick="event.stopPropagation(); deleteProject('${project.id}')" title="Eliminar Proyecto"></i>
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

            <div class="project-progress-container" style="margin-bottom: 1.5rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.5rem;">
                    <span style="font-size: 0.75rem; font-weight: 700; color: #64748b;">PROGRESO</span>
                    <span style="font-size: 0.75rem; font-weight: 700; color: var(--primary);">${progress}%</span>
                </div>
                <div style="width: 100%; height: 6px; background: #f1f5f9; border-radius: 10px; overflow: hidden;">
                    <div style="width: ${progress}%; height: 100%; background: var(--primary); border-radius: 10px; transition: width 0.5s ease-out;"></div>
                </div>
                <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 0.4rem;">
                    ${completedTasks} de ${totalTasks} tareas completadas
                </div>
            </div>

            <div style="margin-top: auto; display:flex; justify-content:space-between; align-items:center;">
                <span class="btn-view-details">VER DETALLES <i class="fas fa-arrow-right"></i></span>
                <div class="project-badge">${progress === 100 ? 'Finalizado' : 'Activo'}</div>
            </div>
        `;
        card.onclick = () => selectProject(project);
        gallery.appendChild(card);
    });
}

function renderProjectList() {
    projectList.innerHTML = '';
    
    projects.forEach(project => {
        const li = document.createElement('li');
        li.className = 'nav-item';
        li.innerHTML = `
            <div class="nav-item-content">
                <i class="fas fa-folder"></i>
                <span>${project.nombre || project.name}</span>
            </div>
            <i class="fas fa-chevron-right arrow"></i>
        `;
        li.onclick = () => selectProject(project);
        if (currentProject && currentProject.id === project.id) li.classList.add('active');
        projectList.appendChild(li);
    });
}

async function selectProject(project) {
    currentProject = project;
    document.getElementById('current-project-name').textContent = project.nombre || project.name;
    
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
    
    // Auto-contraer sidebar
    document.getElementById('sidebar').classList.add('closed');

    // Navegación active
    document.getElementById('nav-dashboard').classList.remove('active');

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

document.getElementById('btn-new-project').addEventListener('click', () => {
    document.getElementById('modal-project').classList.remove('hidden');
});

document.getElementById('save-project').addEventListener('click', async () => {
    const name = document.getElementById('new-project-name').value;
    const description = document.getElementById('new-project-desc')?.value;
    const dueDate = document.getElementById('new-project-due')?.value;
    
    if (!name) return;

    try {
        const newProj = await Storage.addProject({ 
            name, 
            description,
            fecha_vencimiento: dueDate || null
        });
        projects.unshift(newProj);
        
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
    } catch (error) {
        console.error("Error al crear proyecto:", error);
    }
});

// --- TASKS ---
let editingTaskId = null;
let isEditMode = false;

function openTaskModal(taskId = null) {
    editingTaskId = taskId;
    const modal = document.getElementById('modal-task');
    const btnEdit = document.getElementById('btn-edit-task');
    const formContainer = document.getElementById('task-form-container');
    const infoContainer = document.getElementById('task-info-container');
    const saveBtn = document.getElementById('save-task');
    const titleDisplay = document.getElementById('modal-task-title-display');
    const motivoField = document.getElementById('motivo-field-container');
    const infoMotivoBox = document.getElementById('info-motivo-box');

    // Resetear Tabs a Chat por defecto
    document.querySelectorAll('.tab-link').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelector('.tab-link[data-tab="sec-comments"]')?.classList.add('active');
    document.getElementById('sec-comments')?.classList.add('active');

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
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

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

function closeModals() {
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
    } else {
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
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    const MAX_WIDTH = 1200;
                    let width = img.width;
                    let height = img.height;
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        resolve(new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".webp", { type: 'image/webp' }));
                    }, 'image/webp', 0.8);
                };
            };
        });
    }
    return file; // PDF y Audio se suben directo
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

        // Mostrar el reproductor inmediatamente para feedback visual
        audioPlayerBar?.classList.remove('hidden');
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

async function fetchTaskElements(taskId) {
    const overlays = [
        document.getElementById('pane-loading-comments'),
        document.getElementById('pane-loading-check'),
        document.getElementById('pane-loading-steps')
    ];

    try {
        // Mostrar cargando en todo el panel (Carga inicial)
        overlays.forEach(ov => ov?.classList.remove('hidden'));
        
        taskElements = await Storage.getTaskElements(taskId);
        renderTaskElements();
    } catch (error) {
        console.error("Error al obtener elementos de la tarea:", error);
    } finally {
        // Ocultar con un pequeño delay para que se sienta la transición profesional
        setTimeout(() => {
            overlays.forEach(ov => ov?.classList.add('hidden'));
        }, 500);
    }
}

function renderTaskElements() {
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
                const parentText = parent.contenido ? parent.contenido : (parent.archivo_url ? '📎 Archivo' : 'Mensaje original');
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
                    <div class="comment-image-preview" onclick="openZoom('${item.archivo_url}')">
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
                <p>${item.contenido}</p>
                ${attachmentHTML}
            </div>
        `;
        taskDiscussion.appendChild(div);
    });
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
        renderTaskElements();

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
        alert("Error al procesar la solicitud.");
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

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(reg => console.log('Service Worker registrado', reg))
            .catch(err => console.error('Error al registrar Service Worker', err));
    });
}

