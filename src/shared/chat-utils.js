/**
 * Utilidades compartidas para el Chat: Compresión, Detección de URLs y Edición de Imágenes.
 */

const ChatUtils = {
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
