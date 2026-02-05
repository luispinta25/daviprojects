/**
 * Visor de imágenes a pantalla completa con Zoom y opción de edición.
 */
const ImageViewer = {
    currentImageUrl: null,
    scale: 1,
    originId: null,

    init() {
        if (document.getElementById('pwa-image-viewer')) return;

        const html = `
        <div id="pwa-image-viewer" class="iv-overlay hidden">
            <div class="iv-header">
                <button class="iv-btn-close" id="iv-close"><i class="fas fa-times"></i></button>
                <div class="iv-zoom-controls">
                    <button class="iv-zoom-btn" id="iv-zoom-out"><i class="fas fa-minus"></i></button>
                    <button class="iv-zoom-btn" id="iv-zoom-in"><i class="fas fa-plus"></i></button>
                </div>
                <div style="width: 40px;"></div> <!-- Spacer -->
            </div>
            <div class="iv-container" id="iv-container">
                <img id="iv-img" src="">
            </div>
            <div class="iv-footer-actions">
                <button class="iv-action-btn iv-edit" id="iv-edit"><i class="fas fa-pencil-alt"></i> Editar</button>
                <button class="iv-action-btn iv-send" id="iv-send"><i class="fas fa-paper-plane"></i> Enviar</button>
            </div>
        </div>
        <style>
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translate(-50%, 20px); opacity: 0; } to { transform: translate(-50%, 0); opacity: 1; } }
            @keyframes slideDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

            .iv-overlay { 
                position: fixed; inset: 0; background: rgba(0,0,0,0.95); z-index: 6000; 
                display: flex; flex-direction: column; 
                animation: fadeIn 0.3s ease-out;
                backdrop-filter: blur(10px);
            }
            .iv-overlay.hidden { display: none !important; }
            
            .iv-header { 
                padding: env(safe-area-inset-top, 20px) 20px 20px; 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                color: white; 
                position: absolute; 
                top: 0;
                width: 100%; 
                z-index: 10;
                pointer-events: none;
                animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .iv-header > * { pointer-events: auto; }

            .iv-zoom-controls { 
                display: flex; 
                background: rgba(255,255,255,0.1); 
                backdrop-filter: blur(15px);
                border-radius: 30px; 
                padding: 5px;
                border: 1px solid rgba(255,255,255,0.1);
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            }
            
            .iv-zoom-btn { 
                background: none; border: none; color: white; width: 40px; height: 40px; border-radius: 50%; 
                display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;
                font-size: 1rem;
            }
            .iv-zoom-btn:hover { background: rgba(255,255,255,0.1); }
            .iv-zoom-btn:active { background: rgba(255,255,255,0.2); transform: scale(0.9); }

            .iv-btn-close {
                background: rgba(255,255,255,0.1);
                backdrop-filter: blur(15px);
                border: 1px solid rgba(255,255,255,0.1);
                color: white; width: 44px; height: 44px; border-radius: 50%;
                display: flex; align-items: center; justify-content: center; cursor: pointer;
                box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                transition: all 0.2s;
                font-size: 1.1rem;
            }
            .iv-btn-close:hover { background: rgba(255, 255, 255, 0.2); }

            .iv-footer-actions {
                position: absolute;
                bottom: calc(40px + env(safe-area-inset-bottom, 0px));
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                gap: 12px;
                background: rgba(28, 28, 30, 0.85);
                backdrop-filter: blur(25px);
                padding: 12px;
                border-radius: 40px;
                border: 1px solid rgba(255,255,255,0.15);
                box-shadow: 0 20px 50px rgba(0,0,0,0.6);
                z-index: 10;
                animation: slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1);
            }

            .iv-action-btn {
                border: none; padding: 14px 28px; border-radius: 30px; font-weight: 700; font-size: 0.95rem;
                display: flex; align-items: center; gap: 10px; cursor: pointer; transition: all 0.2s;
                letter-spacing: 0.3px;
            }
            
            .iv-edit { background: rgba(255, 255, 255, 0.95); color: #000; }
            .iv-edit:hover { background: #fff; transform: translateY(-2px); }
            .iv-edit:active { transform: translateY(0) scale(0.96); }
            
            .iv-send { background: #007aff; color: white; box-shadow: 0 4px 15px rgba(0, 122, 255, 0.3); }
            .iv-send:hover { background: #0084ff; transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0, 122, 255, 0.4); }
            .iv-send:active { transform: translateY(0) scale(0.96); }
            .iv-send:disabled { background: #3a3a3c; color: #8e8e93; cursor: not-allowed; box-shadow: none; transform: none; }

            .iv-container { flex: 1; display: flex; align-items: center; justify-content: center; overflow: hidden; background: transparent; }
            #iv-img { 
                max-width: 95%; max-height: 95%; 
                transition: transform 0.25s cubic-bezier(0.2, 0, 0.2, 1); 
                border-radius: 12px;
                box-shadow: 0 0 40px rgba(0,0,0,0.5);
            }
            
            @media (max-width: 600px) {
                .iv-header { padding: env(safe-area-inset-top, 15px) 15px 15px; }
                .iv-zoom-controls { display: none; }
                .iv-footer-actions { width: 90%; max-width: 350px; justify-content: center; bottom: calc(30px + env(safe-area-inset-bottom, 0px)); }
                .iv-action-btn { flex: 1; justify-content: center; padding: 14px 15px; font-size: 0.9rem; }
            }
        </style>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div);

        document.getElementById('iv-close').onclick = () => this.hide();
        document.getElementById('iv-zoom-in').onclick = () => this.zoom(0.2);
        document.getElementById('iv-zoom-out').onclick = () => this.zoom(-0.2);
        document.getElementById('iv-edit').onclick = () => this.editCurrentImage();
        document.getElementById('iv-send').onclick = () => this.sendOriginalImage();

        this.container = document.getElementById('iv-container');
        this.img = document.getElementById('iv-img');
    },

    open(url, originId = null) {
        this.init();
        this.currentImageUrl = url;
        this.originId = originId;
        this.scale = 1;
        this.img.src = url;
        this.img.style.transform = `scale(${this.scale})`;
        document.getElementById('pwa-image-viewer').classList.remove('hidden');
    },

    hide() {
        document.getElementById('pwa-image-viewer').classList.add('hidden');
    },

    zoom(delta) {
        this.scale = Math.max(0.5, Math.min(4, this.scale + delta));
        this.img.style.transform = `scale(${this.scale})`;
    },

    async sendOriginalImage() {
        const btnSend = document.getElementById('iv-send');
        const originalContent = btnSend.innerHTML;
        btnSend.disabled = true;
        btnSend.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        try {
            // Convertir la imagen actual a Blob/File para enviarla
            const response = await fetch(this.currentImageUrl);
            const blob = await response.blob();
            const file = new File([blob], "original.webp", { type: 'image/webp' });
            
            if (typeof window.replyToMessageWithEditedImage === 'function') {
                await window.replyToMessageWithEditedImage(file, this.originId);
            }
            this.hide();
        } catch (err) {
            console.error("Error enviando imagen original:", err);
        } finally {
            btnSend.disabled = false;
            btnSend.innerHTML = originalContent;
        }
    },

    editCurrentImage() {
        // Al editar una imagen que ya existe, la abrimos en el editor y al guardar
        // Se activa el callback que subirá la nueva imagen y responderá al original.
        ImageEditor.open(this.currentImageUrl, async (editedFile) => {
            if (typeof window.replyToMessageWithEditedImage === 'function') {
                await window.replyToMessageWithEditedImage(editedFile, this.originId);
            }
            this.hide();
        });
    }
};

window.ImageViewer = ImageViewer;
