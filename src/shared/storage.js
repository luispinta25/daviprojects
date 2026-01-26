// Lógica persistente compartida con Sincronización Supabase
const Storage = {
    // LLAMADAS LOCALES (Fallback)
    getLocalProjects() {
        return JSON.parse(localStorage.getItem('projects')) || [];
    },
    saveLocalProjects(projects) {
        localStorage.setItem('projects', JSON.stringify(projects));
    },

    // LLAMADAS SUPABASE (Proyectos)
    async getProjects() {
        try {
            const { data, error } = await supabaseClient
                .from('daviprojects_proyectos')
                .select('*')
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            this.saveLocalProjects(data); // Cache local
            return data;
        } catch (err) {
            console.error('Error fetching projects:', err);
            return this.getLocalProjects();
        }
    },

    async addProject(project) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const newProject = { 
            nombre: project.name,
            descripcion: project.description || null,
            fecha_vencimiento: project.fecha_vencimiento || null,
            usuario_id: user.id
            // El campo 'estado' se llenará con el DEFAULT 'activo' de la base de datos
        };

        const { data, error } = await supabaseClient
            .from('daviprojects_proyectos')
            .insert([newProject])
            .select();

        if (error) throw error;
        return data[0];
    },

    // LLAMADAS SUPABASE (Tareas)
    async getTasks(projectId = null) {
        let query = supabaseClient.from('daviprojects_tareas').select('*');
        if (projectId) query = query.eq('proyecto_id', projectId);
        
        const { data, error } = await query.order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    async getTask(taskId) {
        const { data, error } = await supabaseClient
            .from('daviprojects_tareas')
            .select('*')
            .eq('id', taskId)
            .single();
        if (error) throw error;
        return data;
    },

    async addTask(task) {
        const { data, error } = await supabaseClient
            .from('daviprojects_tareas')
            .insert([{
                titulo: task.title,
                descripcion: task.description || null,
                completada: false,
                estado: 'TODO',
                prioridad: task.priority || 1,
                fecha_vencimiento: task.dueDate || null,
                proyecto_id: task.projectId
            }])
            .select();

        if (error) throw error;
        return data[0];
    },

    async updateTaskStatus(taskId, status, motivo = null) {
        const isCompleted = (status === 'DONE');
        const updateData = { 
            estado: status,
            completada: isCompleted 
        };
        if (motivo !== null) updateData.motivo = motivo;

        const { error } = await supabaseClient
            .from('daviprojects_tareas')
            .update(updateData)
            .eq('id', taskId);
        if (error) throw error;
    },

    async updateTask(taskId, updates) {
        const { error } = await supabaseClient
            .from('daviprojects_tareas')
            .update({
                titulo: updates.title,
                descripcion: updates.description,
                prioridad: updates.priority,
                fecha_vencimiento: updates.dueDate,
                estado: updates.status,
                motivo: updates.motivo,
                completada: updates.status === 'DONE'
            })
            .eq('id', taskId);
        if (error) throw error;
    },

    async toggleTask(taskId, completed) {
        const status = completed ? 'DONE' : 'TODO';
        await this.updateTaskStatus(taskId, status);
    },

    async deleteTask(taskId) {
        const { error } = await supabaseClient
            .from('daviprojects_tareas')
            .delete()
            .eq('id', taskId);
        if (error) throw error;
    },

    async deleteProject(projectId) {
        const { error } = await supabaseClient
            .from('daviprojects_proyectos')
            .delete()
            .eq('id', projectId);
        if (error) throw error;
    },

    // --- LOG HISTORIAL ---
    async addHistory(log) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        // Intentar obtener el nombre del perfil
        let nombre = user.email;
        
        try {
            const { data: profile, error } = await supabaseClient
                .from('daviplata_usuarios')
                .select('nombre')
                .eq('auth_id', user.id)
                .single();
            
            if (profile && profile.nombre) {
                nombre = profile.nombre;
            }
        } catch (e) {
            console.error("Error fetching username for history:", e);
        }

        // Notificación Webhook
        this._notifyWebhook(nombre, log.accion, log.detalle, log.proyecto_id, log.tarea_id);

        const { error: insertError } = await supabaseClient
            .from('daviprojects_historial')
            .insert([{
                usuario_id: user.id,
                usuario_nombre: nombre,
                accion: log.accion,
                detalle: log.detalle,
                proyecto_id: log.proyecto_id,
                tarea_id: log.tarea_id || null
            }]);
        if (insertError) console.error("Error al guardar historial:", insertError);
    },

    async _notifyWebhook(nombre, accion, detalle, proyectoId, tareaId = null) {
        const url = 'https://lpn8nwebhook.luispintasolutions.com/webhook/daviprojects1';
        
        // Priorizar el enlace a la tarea si existe
        let projectLink = '';
        if (tareaId) {
            projectLink = `https://daviprojects.luispinta.com/?taskId=${tareaId}`;
        } else if (proyectoId) {
            projectLink = `https://daviprojects.luispinta.com/?projectId=${proyectoId}`;
        }
        
        const icons = {
            'CREAR_PROYECTO': '🚀',
            'CREAR_TAREA': '�',
            'CREAR': '✨',
            'MOVER': '🚚',
            'ELIMINAR': '🗑️',
            'ELIMINAR_TAREA': '✖️',
            'ELIMINAR_PROYECTO': '🧨',
            'EDITAR': '🛠️',
            'EDITAR_COMENTARIO': '✏️',
            'AÑADIR': '➕',
            'NUEVO_COMENTARIO': '💬',
            'RESPONDER': '↩️',
            'REORDENAR': '🔢',
            'COMPLETAR': '✅',
            'LOGIN': '🔑',
            'LOGOUT': '🚪'
        };
        const icon = icons[accion] || '🔔';

        const timestamp = new Date().toLocaleString('es-CO', { 
            timeZone: 'America/Bogota',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        });

        const message = `*DaviProjects* • ${icon} *${accion.replace(/_/g, ' ')}*\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `👤 *Usuario:* \`${nombre}\`\n\n` +
                        `${detalle}\n\n` +
                        `━━━━━━━━━━━━━━━━━━━━\n` +
                        `⏰ _${timestamp}_\n` +
                        (projectLink ? `🔗 *Ver:* ${projectLink}` : '');

        try {
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    message: message,
                    user: nombre,
                    action: accion,
                    detail: detalle,
                    timestamp: timestamp,
                    projectId: proyectoId,
                    link: projectLink
                })
            });
        } catch (e) {
            console.error("Error enviando webhook:", e);
        }
    },

    async getHistory(projectId) {
        const { data, error } = await supabaseClient
            .from('daviprojects_historial')
            .select('*')
            .eq('proyecto_id', projectId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async getAllHistory() {
        const { data, error } = await supabaseClient
            .from('daviprojects_historial')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100); // Límite razonable para móvil
        if (error) throw error;
        return data;
    },

    // --- ELEMENTOS DE TAREA (Comentarios, Checklists, Listas) ---
    async getTaskElements(taskId) {
        const { data, error } = await supabaseClient
            .from('daviprojects_elementos_tarea')
            .select('*')
            .eq('tarea_id', taskId)
            .order('posicion', { ascending: true })
            .order('created_at', { ascending: true });
        if (error) throw error;
        return data;
    },

    async addTaskElement(element) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        // Obtener nombre del perfil de daviplata_usuarios
        let userDisplayName = 'Usuario';
        try {
            const { data: profile } = await supabaseClient
                .from('daviplata_usuarios')
                .select('nombre')
                .eq('auth_id', user.id)
                .single();
            if (profile && profile.nombre) userDisplayName = profile.nombre;
        } catch (e) {
            console.error("No se pudo obtener el nombre del usuario para el elemento:", e);
        }

        const { data, error } = await supabaseClient
            .from('daviprojects_elementos_tarea')
            .insert([{
                tarea_id: element.taskId,
                tipo: element.tipo,
                contenido: element.contenido,
                completada: element.completada || false,
                posicion: element.posicion || 0,
                usuario_id: user.id,
                usuario_nombre: userDisplayName,
                archivo_url: element.archivo_url || null,
                archivo_tipo: element.archivo_tipo || null,
                reply_to_id: element.reply_to_id || null
            }])
            .select();
        if (error) throw error;
        return data[0];
    },

    // --- STORAGE (Subida de archivos) ---
    async uploadFile(file, path) {
        // 'path' debe ser algo como 'daviprojects/nombre-archivo.ext'
        const { data, error } = await supabaseClient.storage
            .from('luispintapersonal')
            .upload(path, file, {
                cacheControl: '3600',
                upsert: true
            });
        
        if (error) throw error;

        // Obtener URL pública
        const { data: { publicUrl } } = supabaseClient.storage
            .from('luispintapersonal')
            .getPublicUrl(path);
        
        return publicUrl;
    },

    async updateTaskElement(elementId, updates) {
        const { error } = await supabaseClient
            .from('daviprojects_elementos_tarea')
            .update(updates)
            .eq('id', elementId);
        if (error) throw error;
    },

    async downloadFile(url, fileName, btn = null) {
        if (btn && btn.getAttribute('data-loading') === 'true') return;

        let originalHTML = '';
        if (btn) {
            console.log("Iniciando descarga animada..."); // Debug para el usuario
            btn.setAttribute('data-loading', 'true');
            originalHTML = btn.innerHTML;
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';

            // Cambiar icono y texto inmediatamente
            const icon = btn.querySelector('i');
            if (icon) {
                icon.className = 'fas fa-spinner fa-spin';
            } else {
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cargando...';
            }
        }

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error('CORS o Red error');
            const blob = await response.blob();
            // ... (el resto sigue igual)
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName || 'archivo-audio';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => window.URL.revokeObjectURL(blobUrl), 100);
            
            if (btn) {
                const icon = btn.querySelector('i');
                if (icon) icon.className = 'fas fa-check';
                setTimeout(() => {
                    btn.innerHTML = originalHTML;
                    btn.style.pointerEvents = 'auto';
                    btn.style.opacity = '1';
                    btn.removeAttribute('data-loading');
                }, 2000);
            }
        } catch (error) {
            console.warn('Download fetch failed, falling back to window.open', error);
            if (btn) {
                btn.innerHTML = originalHTML;
                btn.style.pointerEvents = 'auto';
                btn.style.opacity = '1';
                btn.removeAttribute('data-loading');
            }
            window.open(url, '_blank');
        }
    },

    async deleteTaskElement(elementId) {
        const { error } = await supabaseClient
            .from('daviprojects_elementos_tarea')
            .delete()
            .eq('id', elementId);
        if (error) throw error;
    },

    async reorderTaskElements(elements) {
        // 'elements' should be an array of {id, posicion}
        const promises = elements.map(el => 
            supabaseClient
                .from('daviprojects_elementos_tarea')
                .update({ posicion: el.posicion })
                .eq('id', el.id)
        );
        await Promise.all(promises);
    },

    // LLAMADAS SUPABASE (Ideas)
    async getIdeas() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const { data, error } = await supabaseClient
            .from('daviprojects_ideas')
            .select('*')
            .eq('usuario_id', user.id)
            .order('es_favorito', { ascending: false })
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        return data;
    },

    async addIdea(idea) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        const { data, error } = await supabaseClient
            .from('daviprojects_ideas')
            .insert([{
                usuario_id: user.id,
                titulo: idea.titulo,
                contenido: idea.contenido || null,
                audio_url: idea.audio_url || null,
                color: idea.color || '#fff9c4', // Amarillo sticky note por defecto
                es_favorito: idea.es_favorito || false
            }])
            .select();

        if (error) throw error;
        return data[0];
    },

    async updateIdea(ideaId, updates) {
        const { error } = await supabaseClient
            .from('daviprojects_ideas')
            .update(updates)
            .eq('id', ideaId);
        if (error) throw error;
    },

    async deleteIdea(ideaId) {
        const { error } = await supabaseClient
            .from('daviprojects_ideas')
            .delete()
            .eq('id', ideaId);
        if (error) throw error;
    }
};

window.Storage = Storage;
