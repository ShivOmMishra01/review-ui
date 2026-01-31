let images = [];
let currentIndex = 0;
let annotations = {};
let originalSrc = null;

let scale = 1;
let translateX = 0;
let translateY = 0;
let isDragging = false;
let dragMoved = false;
let isZoomed = false;
let startX = 0;
let startY = 0;

// Default defect types
let defectTypes = ["Scratch", "Crack", "Needs Review"];
let defects = {}; // Store defect states per image

// Filter state
let filterState = {
    brightness: 100,
    contrast: 100,
    saturation: 100,
    gamma: 100
};

// Cache for gamma-corrected images
let gammaCache = {};

// DOM Elements
const imageStage = document.getElementById("imageStage");
const imageViewer = document.getElementById("imageViewer");
const counter = document.getElementById("counter");
const imageLink = document.getElementById("imageLink");
const status = document.getElementById("status");
const zoomLevel = document.getElementById("zoomLevel");

// Filter controls
const brightness = document.getElementById("brightness");
const contrast = document.getElementById("contrast");
const saturation = document.getElementById("saturation");
const gamma = document.getElementById("gamma");
const brightnessValue = document.getElementById("brightnessValue");
const contrastValue = document.getElementById("contrastValue");
const saturationValue = document.getElementById("saturationValue");
const gammaValue = document.getElementById("gammaValue");

// Defects controls
const newDefectInput = document.getElementById("newDefectInput");
const addDefectBtn = document.getElementById("addDefectBtn");
const defectList = document.getElementById("defectList");
const currentAnnotations = document.getElementById("currentAnnotations");

/* ---------- INITIALIZATION ---------- */
document.addEventListener('DOMContentLoaded', () => {
    initializeDefects();
    setupEventListeners();
    updateStatus('Ready to load CSV');
});

function setupEventListeners() {
    // CSV Load
    document.getElementById("csvInput").addEventListener("change", handleCSVLoad);

    // Navigation
    document.getElementById("prevBtn").addEventListener("click", () => navigate(-1));
    document.getElementById("nextBtn").addEventListener("click", () => navigate(1));

    // Filters with debouncing for performance
    brightness.addEventListener("input", () => {
        updateBrightness();
        debouncedApplyFilters();
    });

    contrast.addEventListener("input", () => {
        updateContrast();
        debouncedApplyFilters();
    });

    saturation.addEventListener("input", () => {
        updateSaturation();
        debouncedApplyFilters();
    });

    gamma.addEventListener("input", () => {
        updateGamma();
        debouncedApplyGamma();
    });

    // Buttons
    document.getElementById("resetFiltersBtn").addEventListener("click", resetFilters);
    document.getElementById("downloadBtn").addEventListener("click", downloadCSV);
    document.getElementById("openOriginalBtn").addEventListener("click", openOriginal);

    // Defects
    addDefectBtn.addEventListener("click", addNewDefect);
    newDefectInput.addEventListener("keypress", (e) => {
        if (e.key === 'Enter') addNewDefect();
    });
}

// Debounce function for better performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Create debounced versions
const debouncedApplyFilters = debounce(applyAllFilters, 50);
const debouncedApplyGamma = debounce(applyGammaCorrection, 100);

/* ---------- CSV LOAD ---------- */
function handleCSVLoad(e) {
    const file = e.target.files[0];
    if (!file) return;

    updateStatus('Loading CSV...');

    const reader = new FileReader();
    reader.onload = () => {
        images = reader.result
            .split(/\r?\n/)
            .map(r => {
                // Handle quoted URLs
                const match = r.match(/"([^"]+)"/);
                return match ? match[1] : r.trim();
            })
            .filter(r => r && (r.startsWith("http://") || r.startsWith("https://")));

        if (images.length === 0) {
            updateStatus('No valid URLs found in CSV', 'error');
            return;
        }

        currentIndex = 0;
        defects = {}; // Reset defects for new CSV
        gammaCache = {}; // Clear gamma cache
        updateStatus(`Loaded ${images.length} images`);
        loadImage();
    };

    reader.onerror = () => {
        updateStatus('Error reading file', 'error');
    };

    reader.readAsText(file);
}

/* ---------- IMAGE LOAD ---------- */
function loadImage() {
    resetView();
    const url = images[currentIndex];

    updateStatus(`Loading image ${currentIndex + 1}/${images.length}...`);

    // Create an offscreen image for preloading
    const preloadImg = new Image();
    preloadImg.crossOrigin = "anonymous";

    preloadImg.onload = () => {
        // Set the displayed image
        imageViewer.src = url;
        originalSrc = url;

        // Reset gamma cache for this image
        gammaCache[url] = null;

        updateStatus(`Image ${currentIndex + 1}/${images.length} loaded`);
        updateUI();
        resetFilters(); // Apply default filters
    };

    preloadImg.onerror = () => {
        updateStatus('Failed to load image', 'error');
        imageViewer.src = '';
        originalSrc = null;
        updateUI();
    };

    preloadImg.src = url;
}

function updateUI() {
    // Update counter
    counter.textContent = `${currentIndex + 1} / ${images.length}`;

    // Update image link
    const url = images[currentIndex];
    imageLink.textContent = url;
    imageLink.href = url;
    imageLink.title = url;

    // Update defects UI
    updateDefectsUI();

    // Update annotations display
    updateCurrentAnnotations();
}

/* ---------- ZOOM & PAN ---------- */
imageStage.addEventListener("click", () => {
    if (dragMoved) {
        dragMoved = false;
        return;
    }

    isZoomed = !isZoomed;
    scale = isZoomed ? 2 : 1;
    translateX = translateY = 0;

    imageStage.classList.toggle("zoomed", isZoomed);
    zoomLevel.textContent = `${Math.round(scale * 100)}%`;
    applyTransform();
});

imageStage.addEventListener("mousedown", e => {
    if (!isZoomed) return;

    isDragging = true;
    dragMoved = false;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
});

document.addEventListener("mousemove", e => {
    if (!isDragging) return;

    dragMoved = true;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;

    clampPan();
    applyTransform();
});

document.addEventListener("mouseup", () => {
    isDragging = false;
});

function applyTransform() {
    imageStage.style.transform =
        `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

function clampPan() {
    const rect = imageStage.getBoundingClientRect();
    const maxX = rect.width * (scale - 1) / 2;
    const maxY = rect.height * (scale - 1) / 2;

    translateX = Math.max(-maxX, Math.min(maxX, translateX));
    translateY = Math.max(-maxY, Math.min(maxY, translateY));
}

function resetView() {
    scale = 1;
    translateX = translateY = 0;
    isZoomed = false;
    imageStage.classList.remove("zoomed");
    imageStage.style.transform = "none";
    zoomLevel.textContent = "100%";
}

/* ---------- DEFECTS MANAGEMENT ---------- */
function initializeDefects() {
    defectTypes.forEach(defect => {
        addDefectToUI(defect);
    });
}

function addDefectToUI(defectType) {
    const defectId = defectType.toLowerCase().replace(/\s+/g, '-');

    const defectItem = document.createElement('div');
    defectItem.className = 'defect-item';
    defectItem.innerHTML = `
        <label>
            <input type="checkbox" class="defect-checkbox" data-defect="${defectType}">
            ${defectType}
        </label>
        <button class="remove-defect" data-defect="${defectType}" title="Remove defect type">
            <i class="fas fa-times"></i>
        </button>
    `;

    defectList.appendChild(defectItem);

    // Add event listener for checkbox
    const checkbox = defectItem.querySelector('.defect-checkbox');
    checkbox.addEventListener('change', function () {
        updateImageDefects(defectType, this.checked);
    });

    // Add event listener for remove button
    const removeBtn = defectItem.querySelector('.remove-defect');
    removeBtn.addEventListener('click', function () {
        removeDefectType(defectType);
    });
}

function updateImageDefects(defectType, isChecked) {
    const imageUrl = images[currentIndex];
    if (!imageUrl) return;

    if (!defects[imageUrl]) {
        defects[imageUrl] = [];
    }

    if (isChecked) {
        if (!defects[imageUrl].includes(defectType)) {
            defects[imageUrl].push(defectType);
        }
    } else {
        defects[imageUrl] = defects[imageUrl].filter(d => d !== defectType);
    }

    updateCurrentAnnotations();
}

function updateDefectsUI() {
    const imageUrl = images[currentIndex];
    const imageDefects = defects[imageUrl] || [];

    // Uncheck all checkboxes first
    document.querySelectorAll('.defect-checkbox').forEach(checkbox => {
        checkbox.checked = false;
    });

    // Check the ones for current image
    imageDefects.forEach(defectType => {
        const checkbox = document.querySelector(`.defect-checkbox[data-defect="${defectType}"]`);
        if (checkbox) {
            checkbox.checked = true;
        }
    });
}

function addNewDefect() {
    const newDefect = newDefectInput.value.trim();

    if (!newDefect) {
        showAlert('Please enter a defect name', 'warning');
        return;
    }

    if (defectTypes.includes(newDefect)) {
        showAlert('Defect type already exists', 'warning');
        return;
    }

    defectTypes.push(newDefect);
    addDefectToUI(newDefect);
    newDefectInput.value = '';

    showAlert(`Added defect type: ${newDefect}`, 'success');
}

function removeDefectType(defectType) {
    if (defectTypes.length <= 1) {
        showAlert('Cannot remove all defect types', 'error');
        return;
    }

    // Remove from array
    defectTypes = defectTypes.filter(d => d !== defectType);

    // Remove from UI
    const defectItems = document.querySelectorAll('.defect-item');
    defectItems.forEach(item => {
        if (item.querySelector(`[data-defect="${defectType}"]`)) {
            item.remove();
        }
    });

    // Remove from all image defects
    Object.keys(defects).forEach(url => {
        defects[url] = defects[url].filter(d => d !== defectType);
    });

    updateCurrentAnnotations();
    showAlert(`Removed defect type: ${defectType}`, 'info');
}

function updateCurrentAnnotations() {
    const imageUrl = images[currentIndex];
    const imageDefects = defects[imageUrl] || [];

    if (imageDefects.length === 0) {
        currentAnnotations.innerHTML = '<em>No defects selected for this image</em>';
        return;
    }

    currentAnnotations.innerHTML = imageDefects
        .map(defect => `
            <div class="annotation-item">
                <span>${defect}</span>
                <button class="remove-defect btn-small" onclick="removeDefectFromCurrent('${defect}')">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
}

function removeDefectFromCurrent(defectType) {
    const imageUrl = images[currentIndex];
    if (defects[imageUrl]) {
        defects[imageUrl] = defects[imageUrl].filter(d => d !== defectType);
        updateDefectsUI();
        updateCurrentAnnotations();
    }
}

/* ---------- IMAGE FILTERS (OPTIMIZED) ---------- */
function updateBrightness() {
    filterState.brightness = parseInt(brightness.value);
    brightnessValue.textContent = `${filterState.brightness}%`;
}

function updateContrast() {
    filterState.contrast = parseInt(contrast.value);
    contrastValue.textContent = `${filterState.contrast}%`;
}

function updateSaturation() {
    filterState.saturation = parseInt(saturation.value);
    saturationValue.textContent = `${filterState.saturation}%`;
}

function updateGamma() {
    filterState.gamma = parseInt(gamma.value);
    gammaValue.textContent = `${filterState.gamma}%`;
}

// Apply CSS filters (brightness, contrast, saturation)
function applyCSSFilters() {
    imageViewer.style.filter = `
        brightness(${filterState.brightness}%)
        contrast(${filterState.contrast}%)
        saturate(${filterState.saturation}%)
    `;
}

// Apply gamma correction using canvas (with caching)
function applyGammaCorrection() {
    const currentUrl = images[currentIndex];
    if (!currentUrl || filterState.gamma === 100) {
        // Reset to original if gamma is 100%
        imageViewer.src = originalSrc;
        applyCSSFilters();
        return;
    }

    // Check cache first
    const cacheKey = `${currentUrl}_${filterState.gamma}`;
    if (gammaCache[cacheKey]) {
        imageViewer.src = gammaCache[cacheKey];
        applyCSSFilters();
        return;
    }

    // Create offscreen canvas for gamma correction
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = currentUrl;

    img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        // Limit canvas size for performance
        const maxDimension = 2000;
        let width = img.naturalWidth;
        let height = img.naturalHeight;

        if (width > maxDimension || height > maxDimension) {
            const ratio = Math.min(maxDimension / width, maxDimension / height);
            width = Math.floor(width * ratio);
            height = Math.floor(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;

        // Draw image to canvas
        ctx.drawImage(img, 0, 0, width, height);

        // Apply gamma correction
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const g = filterState.gamma / 100;
        const inv = 1 / g;

        // Use lookup table for performance
        const lut = new Array(256);
        for (let i = 0; i < 256; i++) {
            lut[i] = Math.pow(i / 255, inv) * 255;
        }

        // Apply gamma using lookup table
        for (let i = 0; i < data.length; i += 4) {
            data[i] = lut[data[i]];     // R
            data[i + 1] = lut[data[i + 1]]; // G
            data[i + 2] = lut[data[i + 2]]; // B
        }

        ctx.putImageData(imageData, 0, 0);

        // Cache the result
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        gammaCache[cacheKey] = dataUrl;

        // Apply to image
        imageViewer.src = dataUrl;

        // Apply CSS filters on top
        setTimeout(() => applyCSSFilters(), 10);
    };
}

// Apply all filters together
function applyAllFilters() {
    if (filterState.gamma === 100) {
        // If gamma is 100%, just use CSS filters on original
        imageViewer.src = originalSrc;
        applyCSSFilters();
    } else {
        // Apply gamma correction first, then CSS filters
        applyGammaCorrection();
    }
}

function resetFilters() {
    // Reset filter state
    filterState = {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        gamma: 100
    };

    // Reset UI controls
    brightness.value = 100;
    contrast.value = 100;
    saturation.value = 100;
    gamma.value = 100;

    // Reset display values
    brightnessValue.textContent = "100%";
    contrastValue.textContent = "100%";
    saturationValue.textContent = "100%";
    gammaValue.textContent = "100%";

    // Reset image
    imageViewer.src = originalSrc;
    imageViewer.style.filter = "none";

    // Clear gamma cache for current image
    const currentUrl = images[currentIndex];
    if (currentUrl) {
        Object.keys(gammaCache).forEach(key => {
            if (key.startsWith(currentUrl)) {
                delete gammaCache[key];
            }
        });
    }
}

/* ---------- NAVIGATION ---------- */
function navigate(direction) {
    if (images.length === 0) return;

    // Save current filter state before navigating
    const currentUrl = images[currentIndex];
    if (currentUrl) {
        // Cache the gamma-corrected version if needed
        if (filterState.gamma !== 100) {
            const cacheKey = `${currentUrl}_${filterState.gamma}`;
            if (!gammaCache[cacheKey] && imageViewer.src.startsWith('data:')) {
                gammaCache[cacheKey] = imageViewer.src;
            }
        }
    }

    currentIndex += direction;

    // Wrap around
    if (currentIndex < 0) currentIndex = images.length - 1;
    if (currentIndex >= images.length) currentIndex = 0;

    loadImage();
}

/* ---------- CSV EXPORT ---------- */
function downloadCSV() {
    if (images.length === 0) {
        showAlert('No images loaded', 'error');
        return;
    }

    let csvContent = "Image URL,Defects\n";

    images.forEach(url => {
        const imageDefects = defects[url] || [];
        const defectsString = imageDefects.join('; ');
        csvContent += `"${url}","${defectsString}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `image-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    showAlert(`CSV exported with ${images.length} images`, 'success');
}

/* ---------- UTILITY FUNCTIONS ---------- */
function updateStatus(message, type = 'info') {
    const icon = status.querySelector('i');
    const text = status.querySelector('span') || document.createElement('span');

    if (!status.querySelector('span')) {
        status.appendChild(text);
    }

    text.textContent = message;

    // Update icon color based on type
    switch (type) {
        case 'error':
            icon.style.color = '#ef4444';
            break;
        case 'success':
            icon.style.color = '#22c55e';
            break;
        case 'warning':
            icon.style.color = '#f59e0b';
            break;
        default:
            icon.style.color = '#3b82f6';
    }
}

function showAlert(message, type = 'info') {
    // Create alert element
    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <i class="fas fa-${getIconForType(type)}"></i>
        <span>${message}</span>
    `;

    // Style the alert
    alert.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${getBgColorForType(type)};
        color: white;
        padding: 12px 16px;
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 10px;
        z-index: 1000;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        animation: slideIn 0.3s ease;
        max-width: 300px;
    `;

    document.body.appendChild(alert);

    // Remove after 3 seconds
    setTimeout(() => {
        alert.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => alert.remove(), 300);
    }, 3000);

    // Add CSS animations
    if (!document.querySelector('#alert-styles')) {
        const style = document.createElement('style');
        style.id = 'alert-styles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(100%); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
}

function getIconForType(type) {
    switch (type) {
        case 'success': return 'check-circle';
        case 'error': return 'exclamation-circle';
        case 'warning': return 'exclamation-triangle';
        default: return 'info-circle';
    }
}

function getBgColorForType(type) {
    switch (type) {
        case 'success': return '#10b981';
        case 'error': return '#ef4444';
        case 'warning': return '#f59e0b';
        default: return '#3b82f6';
    }
}

function openOriginal() {
    const url = images[currentIndex];
    if (url) {
        window.open(url, '_blank');
    }
}