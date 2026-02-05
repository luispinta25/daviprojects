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

    async _notifyWebhook(nombre, accion, detalle, proyectoId, tareaId = null, musicId = null) {
        const url = 'https://lpn8nwebhook.luispintasolutions.com/webhook/daviprojects1';
        
        // Determinar el módulo/tipo para deep linking
        let targetType = null;
        const detLower = (detalle || '').toLowerCase();
        
        if (accion === 'RESPONDER' || accion === 'NUEVO_COMENTARIO' || detLower.includes('comentario')) {
            targetType = 'COMMENT';
        } else if (detLower.includes('checklist')) {
            targetType = 'CHECKLIST';
        } else if (detLower.includes('lista') || detLower.includes('pasos')) {
            targetType = 'NUMBERED';
        }

        // Priorizar el enlace a la tarea si existe
        let projectLink = '';
        if (musicId) {
            projectLink = `https://daviprojects.luispinta.com/?musicId=${musicId}`;
        } else if (tareaId) {
            projectLink = `https://daviprojects.luispinta.com/?taskId=${tareaId}${targetType ? `&targetType=${targetType}` : ''}`;
        } else if (proyectoId) {
            projectLink = `https://daviprojects.luispinta.com/?projectId=${proyectoId}`;
        }
        
        const icons = {
            'NUEVA_MUSICA': '🎵',
            'REACCION_MUSICA': '❤️',
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
    },

    // LLAMADAS SUPABASE (Música)
    async getMusic() {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        // 1. Obtener canciones (Forzamos evitar el cache interno del cliente si fuera necesario)
        const { data: musicData, error } = await supabaseClient
            .from('daviprojects_musica')
            .select(`
                *,
                proyecto:daviprojects_proyectos(nombre)
            `)
            .order('created_at', { ascending: false });
        
        if (error) throw error;

        // 2. Si hay usuario, obtener sus reacciones reales desde DB
        // IMPORTANTE: No usar variables locales persistentes para reacciones
        let userReactions = [];
        if (user && musicData.length > 0) {
            const { data: reactions, error: rError } = await supabaseClient
                .from('daviprojects_musica_reacciones')
                .select('musica_id, tipo')
                .eq('usuario_id', user.id);
            
            if (rError) console.error("Error cargando reacciones reales:", rError);
            userReactions = reactions || [];
        }
        
        return musicData.map(song => {
            const userSongReactions = userReactions.filter(react => react.musica_id === song.id);
            return { 
                ...song, 
                user_likes_count: userSongReactions.filter(r => r.tipo === 'like').length > 0 ? 1 : 0,
                user_dislikes_count: userSongReactions.filter(r => r.tipo === 'dislike').length > 0 ? 1 : 0
            };
        });
    },

    async addMusic(music) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        // Obtener nombre para el historial/webhook
        let userDisplayName = 'Usuario';
        try {
            const { data: profile } = await supabaseClient
                .from('daviplata_usuarios')
                .select('nombre')
                .eq('auth_id', user.id)
                .single();
            if (profile && profile.nombre) userDisplayName = profile.nombre;
        } catch (e) { console.error(e); }

        const { data, error } = await supabaseClient
            .from('daviprojects_musica')
            .insert([{
                usuario_id: user.id,
                proyecto_id: music.proyecto_id || null,
                nombre: music.nombre,
                descripcion_corta: music.descripcion_corta || null,
                url_archivo: music.url_archivo,
                letra: music.letra || null
            }])
            .select();

        if (error) throw error;

        // Notificar Webhook
        this._notifyWebhook(
            userDisplayName, 
            'NUEVA_MUSICA', 
            `Ha subido un nuevo tema: *${music.nombre}*`, 
            music.proyecto_id,
            null,
            data[0].id
        );

        return data[0];
    },

    async updateMusic(id, music) {
        const { data: { user } } = await supabaseClient.auth.getUser();
        
        const updateData = {
            proyecto_id: music.proyecto_id || null,
            nombre: music.nombre,
            descripcion_corta: music.descripcion_corta || null,
            letra: music.letra || null
        };

        if (music.url_archivo) {
            updateData.url_archivo = music.url_archivo;
        }

        const { data, error } = await supabaseClient
            .from('daviprojects_musica')
            .update(updateData)
            .eq('id', id)
            .select();

        if (error) throw error;
        return data[0];
    },

    async toggleMusicReaction(musicaId, tipo) {
        try {
            const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
            if (authError || !user) throw new Error("Debes iniciar sesión");

            // Obtener nombre del usuario para el webhook
            let userDisplayName = 'Usuario';
            try {
                const { data: profile } = await supabaseClient
                    .from('daviplata_usuarios')
                    .select('nombre')
                    .eq('auth_id', user.id)
                    .single();
                if (profile && profile.nombre) userDisplayName = profile.nombre;
            } catch (e) { console.error(e); }

            // Obtener info de la canción para el mensaje
            const { data: songInfo } = await supabaseClient
                .from('daviprojects_musica')
                .select('nombre, proyecto_id')
                .eq('id', musicaId)
                .single();

            // 1. Verificar si ya existe la reacción (mismo usuario y canción)
            const { data: existing, error: fError } = await supabaseClient
                .from('daviprojects_musica_reacciones')
                .select('id, tipo')
                .eq('musica_id', musicaId)
                .eq('usuario_id', user.id)
                .maybeSingle();

            if (fError) throw fError;

            let actionText = '';
            if (existing) {
                if (existing.tipo === tipo) {
                    // Caso A: Click en el mismo botón -> ELIMINAR reacción
                    const { error: dError } = await supabaseClient
                        .from('daviprojects_musica_reacciones')
                        .delete()
                        .eq('id', existing.id);
                    if (dError) throw dError;
                    actionText = `ha quitado su reacción a *${songInfo?.nombre || 'un tema'}*`;
                } else {
                    // Caso B: Click en el botón opuesto -> ACTUALIZAR tipo
                    const { error: uError } = await supabaseClient
                        .from('daviprojects_musica_reacciones')
                        .update({ tipo: tipo })
                        .eq('id', existing.id);
                    if (uError) throw uError;
                    actionText = `ha cambiado su reacción a *${tipo === 'like' ? 'Me gusta 👍' : 'No me gusta 👎'}* en *${songInfo?.nombre || 'un tema'}*`;
                }
            } else {
                // Caso C: No existía reacción -> INSERTAR
                const { error: iError } = await supabaseClient
                    .from('daviprojects_musica_reacciones')
                    .insert([{ 
                        musica_id: musicaId, 
                        usuario_id: user.id, 
                        tipo: tipo 
                    }]);
                if (iError && iError.code !== '23505') throw iError;
                actionText = `ha reaccionado con *${tipo === 'like' ? 'Me gusta 👍' : 'No me gusta 👎'}* a *${songInfo?.nombre || 'un tema'}*`;
            }

            // Notificar Webhook
            if (actionText) {
                this._notifyWebhook(
                    userDisplayName, 
                    'REACCION_MUSICA', 
                    actionText, 
                    songInfo?.proyecto_id,
                    null,
                    musicaId
                );
            }

            // Obtener conteos actualizados para la UI
            const { data: updatedSong, error: sError } = await supabaseClient
                .from('daviprojects_musica')
                .select('likes_total, dislikes_total')
                .eq('id', musicaId)
                .single();

            if (sError) throw sError;

            return { 
                success: true, 
                likes_total: updatedSong?.likes_total || 0, 
                dislikes_total: updatedSong?.dislikes_total || 0 
            };
        } catch (err) {
            console.error("[Storage] Error crítico en toggleMusicReaction:", err);
            throw err;
        }
    }
};

window.Storage = Storage;
