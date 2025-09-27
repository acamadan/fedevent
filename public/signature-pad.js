/**
 * Simple Signature Pad Implementation
 * Allows users to draw signatures on a canvas
 */
class SignaturePad {
    constructor(canvasElement, options = {}) {
        this.canvas = canvasElement;
        this.context = this.canvas.getContext('2d');
        this.options = {
            penColor: options.penColor || 'black',
            backgroundColor: options.backgroundColor || 'white',
            minWidth: options.minWidth || 1,
            maxWidth: options.maxWidth || 3,
            ...options
        };
        
        this.isDrawing = false;
        this.lastX = 0;
        this.lastY = 0;
        this.points = [];
        
        this.init();
    }
    
    init() {
        // Set canvas dimensions
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        
        // Set up context
        this.context.lineJoin = 'round';
        this.context.lineCap = 'round';
        this.context.strokeStyle = this.options.penColor;
        this.context.lineWidth = this.options.minWidth;
        this.context.fillStyle = this.options.backgroundColor;
        
        // Clear canvas
        this.clear();
        
        // Add event listeners
        this.addEventListeners();
    }
    
    addEventListeners() {
        // Mouse events
        this.canvas.addEventListener('mousedown', this.startDrawing.bind(this));
        this.canvas.addEventListener('mousemove', this.draw.bind(this));
        this.canvas.addEventListener('mouseup', this.stopDrawing.bind(this));
        this.canvas.addEventListener('mouseout', this.stopDrawing.bind(this));
        
        // Touch events for mobile
        this.canvas.addEventListener('touchstart', this.handleTouchStart.bind(this));
        this.canvas.addEventListener('touchmove', this.handleTouchMove.bind(this));
        this.canvas.addEventListener('touchend', this.stopDrawing.bind(this));
    }
    
    handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    handleTouchMove(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
            clientX: touch.clientX,
            clientY: touch.clientY
        });
        this.canvas.dispatchEvent(mouseEvent);
    }
    
    startDrawing(e) {
        this.isDrawing = true;
        const rect = this.canvas.getBoundingClientRect();
        this.lastX = e.clientX - rect.left;
        this.lastY = e.clientY - rect.top;
        this.points = [{ x: this.lastX, y: this.lastY }];
    }
    
    draw(e) {
        if (!this.isDrawing) return;
        
        const rect = this.canvas.getBoundingClientRect();
        const currentX = e.clientX - rect.left;
        const currentY = e.clientY - rect.top;
        
        this.context.beginPath();
        this.context.moveTo(this.lastX, this.lastY);
        this.context.lineTo(currentX, currentY);
        this.context.stroke();
        
        this.lastX = currentX;
        this.lastY = currentY;
        this.points.push({ x: currentX, y: currentY });
    }
    
    stopDrawing() {
        this.isDrawing = false;
    }
    
    clear() {
        this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.points = [];
    }
    
    isEmpty() {
        return this.points.length === 0;
    }
    
    toDataURL(type = 'image/png', encoderOptions = 0.92) {
        return this.canvas.toDataURL(type, encoderOptions);
    }
    
    fromDataURL(dataURL) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                this.context.drawImage(img, 0, 0);
                resolve();
            };
            img.onerror = () => {
                reject(new Error('Failed to load signature from data URL'));
            };
            img.src = dataURL;
        });
    }
    
    getPoints() {
        return this.points;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SignaturePad;
} else if (typeof window !== 'undefined') {
    window.SignaturePad = SignaturePad;
}