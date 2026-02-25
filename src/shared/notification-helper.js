/**
 * Helper para gestionar notificaciones y permisos con UI elegante.
 */

const NotificationHelper = {
    isReloadingForUpdate: false,
    CHANGELOG_PENDING_KEY: 'changelog_pending_version',
    CHANGELOG_SHOWN_KEY: 'changelog_shown_version',
    /**
     * Solicita permisos de notificación usando un modal elegante si el estado es 'default'.
     */
    async requestPermission(isMobile = false) {
        if (!("Notification" in window)) return;
        if (Notification.permission !== "default") return;

        // Crear el modal
        const modalId = 'notification-permission-modal';
        if (document.getElementById(modalId)) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = modalId;
        modalOverlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            backdrop-filter: blur(4px);
            animation: fadeIn 0.3s ease;
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background: white;
            padding: 2rem;
            border-radius: 20px;
            width: 90%;
            max-width: 400px;
            text-align: center;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
            transform: translateY(0);
            animation: slideUp 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        `;

        modalContent.innerHTML = `
            <div style="background: #eefdf3; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.5rem;">
                <i class="fas fa-bell" style="font-size: 1.5rem; color: #05A64B;"></i>
            </div>
            <h3 style="margin-bottom: 0.75rem; color: #071A40; font-size: 1.25rem; font-weight: 700;">¿Activar notificaciones?</h3>
            <p style="color: #64748b; margin-bottom: 2rem; line-height: 1.5; font-size: 0.95rem;">
                Entérate al instante de nuevos comentarios, cambios de estado y actualizaciones en tus proyectos.
            </p>
            <div style="display: flex; gap: 1rem; justify-content: center;">
                <button id="notif-btn-cancel" style="flex: 1; padding: 0.75rem; border-radius: 12px; border: 1px solid #e2e8f0; background: white; color: #64748b; font-weight: 600; cursor: pointer; transition: all 0.2s;">
                    Ahora no
                </button>
                <button id="notif-btn-accept" style="flex: 1; padding: 0.75rem; border-radius: 12px; border: none; background: #05A64B; color: white; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 6px -1px rgba(5, 166, 75, 0.2);">
                    Habilitar
                </button>
            </div>
        `;

        // Añadir animaciones si no existen
        if (!document.getElementById('notif-modal-styles')) {
            const style = document.createElement('style');
            style.id = 'notif-modal-styles';
            style.innerHTML = `
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                #notif-btn-cancel:hover { background: #f8fafc; color: #071A40; }
                #notif-btn-accept:hover { background: #0B8C50; transform: translateY(-1px); }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(modalOverlay);
        modalOverlay.appendChild(modalContent);

        return new Promise((resolve) => {
            document.getElementById('notif-btn-cancel').onclick = () => {
                document.body.removeChild(modalOverlay);
                resolve(Notification.permission);
            };

            document.getElementById('notif-btn-accept').onclick = async () => {
                const permission = await Notification.permission;
                if (permission === 'default') {
                    const result = await Notification.requestPermission();
                    if (result === 'granted') {
                        new Notification("DaviProjects", { 
                            body: "¡Gracias! Las notificaciones están activas ✅",
                            icon: '/img/logo.webp'
                        });
                    }
                }
                document.body.removeChild(modalOverlay);
                resolve(Notification.permission);
            };
        });
    },

    /**
     * Lógica para mostrar una notificación push solo si la ventana no está activa.
     */
    shouldShowNotification() {
        return document.visibilityState !== 'visible';
    },

    /**
     * Gestiona el registro del Service Worker y detecta actualizaciones.
     */
    registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', async () => {
                try {
                    // Detectar si estamos en carpeta produccion o raíz
                    const isProdFolder = window.location.pathname.includes('/produccion/');
                    const swUrl = isProdFolder ? '/produccion/sw.js' : '/sw.js';

                    // updateViaCache: 'none' ayuda a saltar el cache HTTP al buscar el sw.js
                    const reg = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
                    console.log('SW registrado correctamente');

                    // Forzar chequeo inicial
                    reg.update();

                    // Detectar si hay una actualización esperando
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                console.log('Nueva versión detectada. Actualizando automáticamente...');
                                newWorker.postMessage('SKIP_WAITING');
                            }
                        });
                    });

                    // Si ya hay un worker esperando al cargar la página
                    if (reg.waiting) {
                        reg.waiting.postMessage('SKIP_WAITING');
                    }

                    // Chequeo cíclico cada 2 minutos
                    setInterval(() => {
                        reg.update();
                    }, 2 * 60 * 1000);

                } catch (err) {
                    console.error('Error al registrar SW:', err);
                }
            });

            // Recargar cuando el nuevo SW tome el control
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (NotificationHelper.isReloadingForUpdate) return;
                NotificationHelper.isReloadingForUpdate = true;
                window.location.reload();
            });
        }
    },

    /**
     * Muestra un modal elegante avisando que hay una nueva versión disponible.
     */
    showUpdateModal(serviceWorkerRegistration = null) {
        const modalId = 'pwa-update-modal';
        if (document.getElementById(modalId)) return;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = modalId;
        modalOverlay.style.cssText = `
            position: fixed;
            bottom: 2rem;
            right: 2rem;
            background: white;
            padding: 1.25rem;
            border-radius: 16px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.15);
            z-index: 10001;
            display: flex;
            align-items: center;
            gap: 1rem;
            border-left: 5px solid #05A64B;
            animation: slideInRight 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            max-width: 350px;
        `;

        modalOverlay.innerHTML = `
            <div style="background: #eefdf3; width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <i class="fas fa-sync-alt" style="color: #05A64B;"></i>
            </div>
            <div style="flex: 1;">
                <h4 style="margin: 0 0 0.25rem 0; color: #071A40; font-size: 0.95rem; font-weight: 700;">Nueva versión disponible</h4>
                <p style="margin: 0; color: #64748b; font-size: 0.85rem;">Actualiza para disfrutar de las últimas mejoras.</p>
            </div>
            <button id="pwa-update-btn" style="background: #05A64B; color: white; border: none; padding: 0.5rem 1rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 0.85rem; transition: background 0.2s;">
                Actualizar
            </button>
        `;

        if (!document.getElementById('pwa-update-styles')) {
            const style = document.createElement('style');
            style.id = 'pwa-update-styles';
            style.innerHTML = `
                @keyframes slideInRight {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                #pwa-update-btn:hover { background: #0B8C50; }
                @media (max-width: 600px) {
                    #pwa-update-modal {
                        bottom: 1rem;
                        left: 1rem;
                        right: 1rem;
                        max-width: none;
                    }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(modalOverlay);

        document.getElementById('pwa-update-btn').onclick = () => {
            modalOverlay.remove();

            const applyUpdate = (reg) => {
                if (reg && reg.waiting) {
                    reg.waiting.postMessage('SKIP_WAITING');
                } else {
                    window.location.reload();
                }
            };

            if (serviceWorkerRegistration) {
                applyUpdate(serviceWorkerRegistration);
                return;
            }

            navigator.serviceWorker.getRegistration().then(applyUpdate);
        };
    },

    _extractVersionSection(markdown, version) {
        if (!markdown) return '';

        const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const lines = markdown.split(/\r?\n/);
        const headingRegex = new RegExp(`^##\\s*(?:\\[)?v?${escaped}(?:\\])?\\b`, 'i');

        let startIndex = -1;
        for (let i = 0; i < lines.length; i++) {
            if (headingRegex.test(lines[i].trim())) {
                startIndex = i;
                break;
            }
        }

        if (startIndex === -1) return markdown;

        let endIndex = lines.length;
        for (let i = startIndex + 1; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i].trim())) {
                endIndex = i;
                break;
            }
        }

        return lines.slice(startIndex, endIndex).join('\n').trim();
    },

    _markdownToHtml(markdown) {
        const escapeHtml = (value) => String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const formatInline = (value) => {
            const escaped = escapeHtml(value);
            return escaped
                .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9; padding:0.1rem 0.3rem; border-radius:5px; color:#334155;">$1</code>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/\*([^*]+)\*/g, '<em>$1</em>');
        };

        const lines = (markdown || '').split(/\r?\n/);
        let html = '';
        let listType = '';

        for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) {
                if (listType) {
                    html += listType === 'ul' ? '</ul>' : '</ol>';
                    listType = '';
                }
                continue;
            }

            if (/^#{1,4}\s+/.test(line)) {
                if (listType) {
                    html += listType === 'ul' ? '</ul>' : '</ol>';
                    listType = '';
                }
                const level = (line.match(/^#+/)?.[0].length) || 2;
                const title = line.replace(/^#{1,4}\s+/, '');
                const fontSize = level <= 2 ? '1rem' : '0.95rem';
                html += `<h3 style="margin: 0 0 0.7rem; color:#0f172a; font-size:${fontSize};">${formatInline(title)}</h3>`;
                continue;
            }

            const isUnordered = /^[-*]\s+/.test(line);
            const isOrdered = /^\d+\.\s+/.test(line);

            if (isUnordered || isOrdered) {
                const nextType = isOrdered ? 'ol' : 'ul';
                const itemText = line.replace(isOrdered ? /^\d+\.\s+/ : /^[-*]\s+/, '');

                if (listType && listType !== nextType) {
                    html += listType === 'ul' ? '</ul>' : '</ol>';
                    listType = '';
                }

                if (!listType) {
                    html += nextType === 'ol'
                        ? '<ol style="margin:0; padding-left:1.1rem; display:flex; flex-direction:column; gap:0.45rem;">'
                        : '<ul style="margin:0; padding-left:1.1rem; display:flex; flex-direction:column; gap:0.45rem;">';
                    listType = nextType;
                }
                html += `<li style="color:#334155; font-size:0.9rem; line-height:1.4;">${formatInline(itemText)}</li>`;
                continue;
            }

            if (listType) {
                html += listType === 'ul' ? '</ul>' : '</ol>';
                listType = '';
            }
            html += `<p style="margin:0 0 0.55rem; color:#475569; font-size:0.9rem; line-height:1.45;">${formatInline(line)}</p>`;
        }

        if (listType) html += listType === 'ul' ? '</ul>' : '</ol>';
        return html;
    },

    async showVersionChangelogOnce({ version, changelogUrl }) {
        if (!version) return;

        const pendingVersion = localStorage.getItem(this.CHANGELOG_PENDING_KEY);
        const shownVersion = localStorage.getItem(this.CHANGELOG_SHOWN_KEY);

        if (pendingVersion !== version || shownVersion === version) return;
        if (document.getElementById('version-changelog-modal')) return;

        let markdown = '';
        try {
            const response = await fetch(changelogUrl, { cache: 'no-store' });
            if (response.ok) {
                const rawText = await response.text();
                markdown = this._extractVersionSection(rawText, version) || rawText;
            }
        } catch (err) {
            console.warn('No se pudo cargar CHANGELOG.md:', err);
        }

        const contentHtml = markdown
            ? this._markdownToHtml(markdown)
            : `<h3 style="margin:0 0 0.7rem; color:#0f172a; font-size:1rem;">v${version} • Patch</h3><p style="margin:0; color:#475569; font-size:0.9rem; line-height:1.45;">Esta versión mejora el envío de archivos y la estabilidad general de la app.</p>`;

        const overlay = document.createElement('div');
        overlay.id = 'version-changelog-modal';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(2,6,23,0.55);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
            z-index: 10030;
        `;

        overlay.innerHTML = `
            <div style="width: min(620px, 96vw); max-height: 82vh; overflow: auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; box-shadow: 0 18px 45px rgba(15,23,42,0.22); padding: 1rem 1rem 0.95rem;">
                <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.8rem;">
                    <div style="width:34px; height:34px; border-radius:10px; background:#eef2ff; color:#3730a3; display:flex; align-items:center; justify-content:center;"><i class="fas fa-rocket"></i></div>
                    <div style="display:flex; flex-direction:column;">
                        <strong style="font-size:1rem; color:#0f172a;">Actualización aplicada</strong>
                        <span style="font-size:0.78rem; color:#64748b;">Se muestra una sola vez por versión</span>
                    </div>
                </div>
                <div style="padding: 0.15rem 0.1rem 0.4rem;">${contentHtml}</div>
                <div style="display:flex; justify-content:flex-end; margin-top:0.55rem;">
                    <button id="btn-close-version-changelog" style="border:none; background:#05A64B; color:#fff; border-radius:10px; padding:0.55rem 0.95rem; font-weight:700; cursor:pointer;">Entendido</button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const closeModal = () => {
            overlay.remove();
            localStorage.setItem(this.CHANGELOG_SHOWN_KEY, version);
            localStorage.removeItem(this.CHANGELOG_PENDING_KEY);
        };

        overlay.querySelector('#btn-close-version-changelog')?.addEventListener('click', closeModal);
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) closeModal();
        });
    }
};

window.NotificationHelper = NotificationHelper;
