/**
 * Utilidades compartidas para el Chat: Compresión, Detección de URLs y Edición de Imágenes.
 */

const ChatUtils = {
    sanitizeFileName(fileName, fallbackName = 'archivo') {
        const raw = (fileName || '').trim();
        if (!raw) return fallbackName;

        const dotIdx = raw.lastIndexOf('.');
        const hasExt = dotIdx > 0 && dotIdx < raw.length - 1;
        const base = hasExt ? raw.slice(0, dotIdx) : raw;
        const ext = hasExt ? raw.slice(dotIdx + 1) : '';

        const normalize = (value) => value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

        const safeBase = normalize(base) || fallbackName;
        const safeExt = normalize(ext).toLowerCase();

        return safeExt ? `${safeBase}.${safeExt}` : safeBase;
    },

    /**
     * Detecta URLs en el texto y las convierte en enlaces clicables.
     * También añade una opción visual para abrir el enlace.
     */
    linkify(text) {
        if (!text) return "";
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        return text.replace(urlRegex, (url) => {
            return `<a href="${url}" target="_blank" class="chat-link">
                        ${url} <i class="fas fa-external-link-alt" style="font-size: 0.7rem;"></i>
                    </a>`;
        });
    },

    /**
     * Comprime cualquier imagen al 80% y la convierte a WebP.
     * @param {File|Blob} file 
     * @returns {Promise<File>}
     */
    async compressToWebP(file, quality = 0.8) {
        if (!file.type.startsWith('image/')) return file;

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                if (!event.target.result.startsWith('data:image/')) {
                    img.crossOrigin = "anonymous";
                }
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    
                    // Mantener dimensiones originales o un máximo razonable para web
                    const MAX_WIDTH = 1920; 
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
                        const newName = file.name ? file.name.replace(/\.[^/.]+$/, "") : "edited_image";
                        resolve(new File([blob], `${newName}.webp`, { type: 'image/webp' }));
                    }, 'image/webp', quality);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    },

    async optimizePdf(file, options = {}) {
        if (!file || file.type !== 'application/pdf') return file;

        const {
            minSizeKB = 80,
            minReductionPercent = 3
        } = options;

        const minBytes = minSizeKB * 1024;
        if (file.size < minBytes) {
            return file;
        }

        if (typeof PDFLib === 'undefined' || !PDFLib.PDFDocument) {
            console.warn('PDFLib no está disponible; se sube PDF original.');
            return file;
        }

        try {
            const originalSize = file.size;
            const sourceBuffer = await file.arrayBuffer();

            const pdfDoc = await PDFLib.PDFDocument.load(sourceBuffer, {
                ignoreEncryption: true,
                updateMetadata: false
            });

            const optimizedBytes = await pdfDoc.save({
                useObjectStreams: true,
                updateFieldAppearances: false,
                addDefaultPage: false
            });

            const optimizedSize = optimizedBytes.byteLength;
            const requiredMaxSize = Math.floor(originalSize * (1 - (minReductionPercent / 100)));

            if (optimizedSize >= originalSize || optimizedSize > requiredMaxSize) {
                return file;
            }

            const baseName = this.sanitizeFileName((file.name || 'documento').replace(/\.[^/.]+$/, ''), 'documento');
            return new File([optimizedBytes], `${baseName}.pdf`, { type: 'application/pdf' });
        } catch (error) {
            console.warn('No se pudo optimizar PDF; se sube original.', error);
            return file;
        }
    },

    async convertAudioToMp3(file, bitrate = 128) {
        if (!file || !file.type || !file.type.startsWith('audio/')) return file;
        if (typeof lamejs === 'undefined') {
            throw new Error('lamejs no está disponible para convertir audio a mp3.');
        }

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) {
            throw new Error('AudioContext no está disponible en este navegador.');
        }

        const audioContext = new AudioCtx();
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));

        const targetSampleRate = 44100;
        let processedBuffer = decoded;

        if (decoded.sampleRate !== targetSampleRate) {
            const offline = new OfflineAudioContext(
                Math.min(2, decoded.numberOfChannels),
                Math.ceil(decoded.duration * targetSampleRate),
                targetSampleRate
            );
            const source = offline.createBufferSource();
            source.buffer = decoded;
            source.connect(offline.destination);
            source.start(0);
            processedBuffer = await offline.startRendering();
        }

        const channels = Math.min(2, processedBuffer.numberOfChannels);
        const left = processedBuffer.getChannelData(0);
        const right = channels > 1 ? processedBuffer.getChannelData(1) : left;

        const floatTo16BitPCM = (input) => {
            const output = new Int16Array(input.length);
            for (let index = 0; index < input.length; index++) {
                const sample = Math.max(-1, Math.min(1, input[index]));
                output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
            }
            return output;
        };

        const left16 = floatTo16BitPCM(left);
        const right16 = floatTo16BitPCM(right);

        const encoder = new lamejs.Mp3Encoder(channels, targetSampleRate, bitrate);
        const blockSize = 1152;
        const mp3Data = [];

        for (let index = 0; index < left16.length; index += blockSize) {
            const leftChunk = left16.subarray(index, index + blockSize);
            const rightChunk = right16.subarray(index, index + blockSize);
            const mp3buf = channels === 1
                ? encoder.encodeBuffer(leftChunk)
                : encoder.encodeBuffer(leftChunk, rightChunk);
            if (mp3buf.length > 0) mp3Data.push(new Int8Array(mp3buf));
        }

        const flush = encoder.flush();
        if (flush.length > 0) mp3Data.push(new Int8Array(flush));

        await audioContext.close();

        const mp3Blob = new Blob(mp3Data, { type: 'audio/mpeg' });
        const safeBase = this.sanitizeFileName((file.name || 'audio').replace(/\.[^/.]+$/, ''), 'audio');
        return new File([mp3Blob], `${safeBase}.mp3`, { type: 'audio/mpeg' });
    }
};

/**
 * Función global para redimensionar textareas dinámicamente hasta 5 líneas.
 */
function autoResizeTextarea(textarea) {
    // Resetear altura para calcular correctamente el scrollHeight
    textarea.style.height = 'auto';
    
    // Calcular nueva altura basada en el contenido
    // Un lineHeight de 1.4 * 0.95rem (aprox 14-16px) -> 5 líneas son unos 110-120px
    const maxHeight = 120; 
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    
    textarea.style.height = newHeight + 'px';
    
    // Mostrar scrollbar solo si excede el máximo
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

window.ChatUtils = ChatUtils;
window.autoResizeTextarea = autoResizeTextarea;
