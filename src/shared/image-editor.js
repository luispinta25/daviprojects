/**
 * Editor de imágenes ligero: Dibujo a mano alzada y Recorte manual.
 */
const ImageEditor = {
    canvas: null,
    ctx: null,
    history: [],
    isDrawing: false,
    mode: 'pencil', // pencil, highlight, crop
    color: '#ff0000',
    originalImage: null,
    callback: null,
    cropBox: { x: 0, y: 0, w: 0, h: 0 },
    activeHandle: null,
    lastMousePos: { x: 0, y: 0 },

    init() {
        if (document.getElementById('pwa-image-editor')) return;

        const html = `
        <div id="pwa-image-editor" class="ie-overlay hidden">
            <div class="ie-container">
                <div class="ie-header">
                    <button class="ie-hdr-btn ie-cancel" id="ie-close"><i class="fas fa-times"></i> Cancelar</button>
                    <h3 id="ie-title">Editor</h3>
                    <button class="ie-hdr-btn ie-save" id="ie-save"><i class="fas fa-paper-plane"></i> Enviar</button>
                </div>
                <div class="ie-canvas-wrapper" id="ie-wrapper">
                    <canvas id="ie-canvas"></canvas>
                    <div id="ie-crop-overlay" class="ie-crop-overlay hidden">
                        <div class="ie-handle ie-handle-nw" data-handle="nw"></div>
                        <div class="ie-handle ie-handle-n" data-handle="n"></div>
                        <div class="ie-handle ie-handle-ne" data-handle="ne"></div>
                        <div class="ie-handle ie-handle-w" data-handle="w"></div>
                        <div class="ie-handle ie-handle-e" data-handle="e"></div>
                        <div class="ie-handle ie-handle-sw" data-handle="sw"></div>
                        <div class="ie-handle ie-handle-s" data-handle="s"></div>
                        <div class="ie-handle ie-handle-se" data-handle="se"></div>
                    </div>
                </div>
                <div class="ie-toolbar">
                    <div class="ie-tool-group">
                        <button class="ie-tool-btn active" data-tool="pencil" title="Lápiz"><i class="fas fa-pencil-alt"></i></button>
                        <button class="ie-tool-btn" data-tool="highlight" title="Resaltador"><i class="fas fa-highlighter"></i></button>
                        <button class="ie-tool-btn" data-tool="crop" title="Recortar"><i class="fas fa-crop-alt"></i></button>
                    </div>
                    
                    <button class="ie-confirm-crop-btn hidden" id="ie-apply-crop"><i class="fas fa-check"></i> Aplicar Recorte</button>
                    
                    <div class="ie-tool-group">
                        <button class="ie-tool-btn" id="ie-undo" title="Deshacer"><i class="fas fa-undo"></i></button>
                        <div class="ie-color-wrapper">
                            <input type="color" id="ie-color" value="#ff0000">
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <style>
            @keyframes slideUpToolbar { from { transform: translateY(100%); } to { transform: translateY(0); } }
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

            .ie-overlay { 
                position: fixed; inset: 0; background: rgba(0, 0, 0, 0.98); z-index: 9000; 
                display: flex; align-items: center; justify-content: center; 
                animation: fadeIn 0.3s ease-out;
            }
            .ie-overlay.hidden { display: none !important; }
            .ie-container { width: 100vw; height: 100vh; display: flex; flex-direction: column; background: #000; overflow: hidden; }
            
            .ie-header { 
                padding: env(safe-area-inset-top, 20px) 20px 20px; 
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                color: white; 
                background: rgba(28, 28, 30, 0.95); 
                backdrop-filter: blur(30px);
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                z-index: 50;
            }
            .ie-header h3 { font-size: 0.9rem; font-weight: 700; margin: 0; color: #fff; text-transform: uppercase; letter-spacing: 1.5px; opacity: 0.8; }

            .ie-hdr-btn {
                border: none; padding: 12px 24px; border-radius: 30px; font-weight: 700; font-size: 0.9rem;
                display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s; color: white;
            }
            .ie-cancel { background: rgba(255,255,255,0.08); }
            .ie-cancel:active { background: rgba(255,255,255,0.15); transform: scale(0.95); }
            
            .ie-save { background: #007aff; box-shadow: 0 4px 15px rgba(0, 122, 255, 0.3); }
            .ie-save:active { background: #0063ce; transform: scale(0.95); }
            .ie-save:disabled { background: #333; color: #777; cursor: not-allowed; box-shadow: none; }

            .ie-canvas-wrapper { 
                flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; 
                position: relative; background: #000; 
                background-image: radial-gradient(circle at center, #1a1a1a 0%, #000 100%);
            }
            #ie-canvas { max-width: 95%; max-height: 95%; object-fit: contain; box-shadow: 0 0 60px rgba(0,0,0,1); cursor: crosshair; border-radius: 4px; }
            
            .ie-toolbar { 
                padding: 20px 25px; 
                background: rgba(28, 28, 30, 0.95); 
                backdrop-filter: blur(30px);
                display: flex; 
                justify-content: space-between; 
                align-items: center; 
                padding-bottom: calc(25px + env(safe-area-inset-bottom, 0px)); 
                border-top: 1px solid rgba(255, 255, 255, 0.1);
                animation: slideUpToolbar 0.4s cubic-bezier(0.16, 1, 0.3, 1);
                z-index: 50;
            }
            
            .ie-tool-group { display: flex; gap: 15px; align-items: center; }
            
            .ie-tool-btn { 
                background: rgba(255, 255, 255, 0.05); border: none; color: #fff; font-size: 1.15rem; 
                width: 52px; height: 52px; border-radius: 50%; display: flex; align-items: center; 
                justify-content: center; cursor: pointer; transition: all 0.2s; 
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }
            .ie-tool-btn:hover { background: rgba(255, 255, 255, 0.1); }
            .ie-tool-btn:active { transform: scale(0.9); }
            .ie-tool-btn.active { background: #007aff; box-shadow: 0 4px 20px rgba(0, 122, 255, 0.5); transform: scale(1.1); }
            
            .ie-confirm-crop-btn {
                background: #34c759; color: white; border: none; padding: 14px 28px; border-radius: 30px;
                font-weight: 800; cursor: pointer; display: flex; align-items: center; gap: 10px;
                box-shadow: 0 10px 25px rgba(52, 199, 89, 0.4);
                animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            @keyframes popIn { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }

            .ie-color-wrapper {
                width: 40px; height: 40px; border-radius: 50%; border: 2px solid rgba(255,255,255,0.5); 
                overflow: hidden; position: relative; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,0.3);
                transition: transform 0.2s;
            }
            .ie-color-wrapper:active { transform: scale(0.9); }
            #ie-color { position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; border: none; padding: 0; cursor: pointer; }
            
            .ie-crop-overlay { 
                position: absolute; border: 1px solid #007aff; background: rgba(0, 122, 255, 0.05); 
                box-shadow: 0 0 0 5000px rgba(0,0,0,0.8); pointer-events: auto; cursor: move; z-index: 10;
            }
            .ie-crop-overlay::after {
                content: ''; position: absolute; inset: 0;
                background-image: linear-gradient(to right, rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.3) 1px, transparent 1px);
                background-size: 33.33% 33.33%; pointer-events: none;
            }
            
            .ie-handle { 
                position: absolute; width: 14px; height: 14px; background: white; 
                border: 2px solid #007aff; border-radius: 50%; z-index: 11; 
                box-shadow: 0 2px 6px rgba(0,0,0,0.5);
                transition: transform 0.15s;
            }
            .ie-handle:hover { transform: scale(1.4); }
            
            /* Ajuste de handles para que sea más fácil tocarlos */
            .ie-handle::before { content: ''; position: absolute; inset: -15px; }

            .ie-handle-nw { top: -7px; left: -7px; cursor: nwse-resize; }
            .ie-handle-ne { top: -7px; right: -7px; cursor: nesw-resize; }
            .ie-handle-sw { bottom: -7px; left: -7px; cursor: nesw-resize; }
            .ie-handle-se { bottom: -7px; right: -7px; cursor: nwse-resize; }
            .ie-handle-n { top: -7px; left: 50%; margin-left: -7px; cursor: ns-resize; }
            .ie-handle-s { bottom: -7px; left: 50%; margin-left: -7px; cursor: ns-resize; }
            .ie-handle-w { top: 50%; left: -7px; margin-top: -7px; cursor: ew-resize; }
            .ie-handle-e { top: 50%; right: -7px; margin-top: -7px; cursor: ew-resize; }
            
            @media (min-width: 768px) {
                .ie-container { width: 90%; height: 90%; border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); }
            }
        </style>
        `;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div);

        this.canvas = document.getElementById('ie-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Events
        document.getElementById('ie-close').onclick = () => this.hide();
        document.getElementById('ie-save').onclick = () => this.save();
        document.getElementById('ie-undo').onclick = () => this.undo();
        document.getElementById('ie-apply-crop').onclick = () => this.applyCrop();
        document.getElementById('ie-color').onchange = (e) => this.color = e.target.value;

        const tools = document.querySelectorAll('.ie-tool-btn[data-tool]');
        tools.forEach(btn => {
            btn.onclick = () => {
                tools.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.mode = btn.getAttribute('data-tool');
                
                const cropOverlay = document.getElementById('ie-crop-overlay');
                const btnApply = document.getElementById('ie-apply-crop');
                
                if (this.mode === 'crop') {
                    cropOverlay.classList.remove('hidden');
                    // Mostrar "Aplicar Recorte" solo en modo crop
                    btnApply.classList.remove('hidden');
                    if (this.cropBox.w === 0) this.initCropBox();
                } else {
                    cropOverlay.classList.add('hidden');
                    btnApply.classList.add('hidden');
                }
            };
        });

        const wrapper = document.getElementById('ie-wrapper');
        
        wrapper.onmousedown = (e) => this.start(e);
        wrapper.ontouchstart = (e) => this.start(e.touches[0]);
        
        window.onmousemove = (e) => this.move(e);
        window.ontouchmove = (e) => {
            if (this.mode === 'crop' || this.isDrawing) e.preventDefault();
            this.move(e.touches[0]);
        };
        
        window.onmouseup = () => this.end();
        window.ontouchend = () => this.end();
    },

    initCropBox() {
        if (this.cropBox.w === 0) {
            this.cropBox = { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height };
        }
        this.updateCropUI();
    },

    updateCropUI() {
        const overlay = document.getElementById('ie-crop-overlay');
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = rect.width / this.canvas.width;
        const scaleY = rect.height / this.canvas.height;

        overlay.style.left = (this.canvas.offsetLeft + this.cropBox.x * scaleX) + 'px';
        overlay.style.top = (this.canvas.offsetTop + this.cropBox.y * scaleY) + 'px';
        overlay.style.width = (this.cropBox.w * scaleX) + 'px';
        overlay.style.height = (this.cropBox.h * scaleY) + 'px';
    },

    async open(imageSource, callback) {
        this.init();
        this.callback = callback;
        this.cropBox = { x: 0, y: 0, w: 0, h: 0 }; 
        const img = new Image();
        img.crossOrigin = "anonymous"; 
        
        // Si el source es un Blob URL, no necesitamos crossOrigin anonymous
        if (imageSource.startsWith('blob:')) {
            img.removeAttribute('crossOrigin');
        }

        img.src = imageSource;
        img.onload = () => {
            this.canvas.width = img.width;
            this.canvas.height = img.height;
            this.ctx.drawImage(img, 0, 0);
            this.saveHistory();
            document.getElementById('pwa-image-editor').classList.remove('hidden');
        };
    },

    hide() {
        document.getElementById('pwa-image-editor').classList.add('hidden');
    },

    saveHistory() {
        this.history.push(this.canvas.toDataURL());
        if (this.history.length > 20) this.history.shift();
    },

    undo() {
        if (this.history.length <= 1) return;
        this.history.pop();
        const prev = this.history[this.history.length - 1];
        const img = new Image();
        // Las imágenes del historial son DataURLs locales (base64), no necesitan crossOrigin
        img.src = prev;
        img.onload = () => {
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.drawImage(img, 0, 0);
        };
    },

    start(e) {
        if (this.mode === 'crop') {
            const handle = e.target.closest('.ie-handle');
            if (handle) {
                this.activeHandle = handle.dataset.handle;
            } else if (e.target.id === 'ie-crop-overlay') {
                this.activeHandle = 'move';
            } else {
                this.activeHandle = 'new';
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;
                this.cropBox = { x, y, w: 0, h: 0 };
            }
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            return;
        }
        this.isDrawing = true;
        this.ctx.beginPath();
        const pos = this.getPos(e);
        this.ctx.moveTo(pos.x, pos.y);
    },

    move(e) {
        if (this.mode === 'crop' && this.activeHandle) {
            const rect = this.canvas.getBoundingClientRect();
            const scaleX = this.canvas.width / rect.width;
            const scaleY = this.canvas.height / rect.height;
            
            const dx = (e.clientX - this.lastMousePos.x) * scaleX;
            const dy = (e.clientY - this.lastMousePos.y) * scaleY;

            if (this.activeHandle === 'move') {
                this.cropBox.x += dx;
                this.cropBox.y += dy;
            } else if (this.activeHandle === 'new') {
                this.cropBox.w += dx;
                this.cropBox.h += dy;
            } else {
                // handles: nw, n, ne, w, e, sw, s, se
                if (this.activeHandle.includes('n')) { this.cropBox.y += dy; this.cropBox.h -= dy; }
                if (this.activeHandle.includes('s')) { this.cropBox.h += dy; }
                if (this.activeHandle.includes('w')) { this.cropBox.x += dx; this.cropBox.w -= dx; }
                if (this.activeHandle.includes('e')) { this.cropBox.w += dx; }
            }

            // Constrain
            this.cropBox.x = Math.max(0, this.cropBox.x);
            this.cropBox.y = Math.max(0, this.cropBox.y);
            this.cropBox.w = Math.min(this.canvas.width - this.cropBox.x, this.cropBox.w);
            this.cropBox.h = Math.min(this.canvas.height - this.cropBox.y, this.cropBox.h);

            this.updateCropUI();
            this.lastMousePos = { x: e.clientX, y: e.clientY };
            return;
        }
        if (!this.isDrawing) return;
        const pos = this.getPos(e);
        this.ctx.lineTo(pos.x, pos.y);
        this.ctx.strokeStyle = this.color;
        this.ctx.lineWidth = this.mode === 'highlight' ? 20 : 5;
        this.ctx.lineCap = 'round';
        this.ctx.globalAlpha = this.mode === 'highlight' ? 0.3 : 1;
        this.ctx.stroke();
    },

    end() {
        if (this.mode === 'crop') {
            this.activeHandle = null;
            if (this.cropBox.w < 0) { this.cropBox.x += this.cropBox.w; this.cropBox.w = Math.abs(this.cropBox.w); }
            if (this.cropBox.h < 0) { this.cropBox.y += this.cropBox.h; this.cropBox.h = Math.abs(this.cropBox.h); }
            this.updateCropUI();
            return;
        }
        if (this.isDrawing) {
            this.isDrawing = false;
            this.ctx.globalAlpha = 1;
            this.saveHistory();
        }
    },

    applyCrop() {
        const { x, y, w, h } = this.cropBox;
        if (w < 10 || h < 10) return;

        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        tempCanvas.getContext('2d').drawImage(this.canvas, x, y, w, h, 0, 0, w, h);
        
        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.drawImage(tempCanvas, 0, 0);
        
        // Reset crop box to new canvas size
        this.cropBox = { x: 0, y: 0, w: this.canvas.width, h: this.canvas.height };
        
        // Desactivar modo recorte tras aplicar
        this.mode = 'pencil';
        document.getElementById('ie-crop-overlay').classList.add('hidden');
        document.getElementById('ie-apply-crop').classList.add('hidden');
        
        // Actualizar visual de botones de herramientas
        document.querySelectorAll('.ie-tool-btn[data-tool]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tool') === 'pencil');
        });

        this.saveHistory();
    },

    getPos(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY
        };
    },

    save() {
        const btnSave = document.getElementById('ie-save');
        const originalContent = btnSave.innerHTML;
        
        btnSave.disabled = true;
        btnSave.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        
        // Enviar resultado WebP comprimido
        this.canvas.toBlob(async (blob) => {
            try {
                const file = new File([blob], "edited.webp", { type: 'image/webp' });
                if (this.callback) {
                    await this.callback(file);
                }
                this.hide();
            } catch (err) {
                console.error("Error al guardar imagen editada:", err);
                alert("Error al enviar la imagen");
            } finally {
                btnSave.disabled = false;
                btnSave.innerHTML = originalContent;
            }
        }, 'image/webp', 0.82);
    }
};

window.ImageEditor = ImageEditor;
