/**
 * Helper para gestionar notificaciones y permisos con UI elegante.
 */

const NotificationHelper = {
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
                                // Hay una nueva versión, forzamos SKIP_WAITING para actualización agresiva
                                console.log('Nueva versión detectada, instalando...');
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
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            });
        }
    },

    /**
     * Muestra un modal elegante avisando que hay una nueva versión disponible.
     */
    showUpdateModal() {
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
            navigator.serviceWorker.getRegistration().then(reg => {
                if (reg && reg.waiting) {
                    reg.waiting.postMessage('SKIP_WAITING');
                } else {
                    window.location.reload();
                }
            });
        };
    }
};

window.NotificationHelper = NotificationHelper;
