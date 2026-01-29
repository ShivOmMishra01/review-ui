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

const imageStage = document.getElementById("imageStage");
const imageViewer = document.getElementById("imageViewer");

/* ---------- CSV LOAD ---------- */
document.getElementById("csvInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
        images = reader.result
            .split(/\r?\n/)
            .map(r => r.replace(/"/g, "").trim())
            .filter(r => r.startsWith("http"));

        currentIndex = 0;
        loadImage();
    };
    reader.readAsText(file);
});

/* ---------- IMAGE LOAD ---------- */
function loadImage() {
    resetView();
    const url = images[currentIndex];
    imageViewer.src = url;
    originalSrc = url;
}

/* ---------- ZOOM (CLICK ONLY IF NOT DRAGGED) ---------- */
imageStage.addEventListener("click", () => {
    if (dragMoved) {
        dragMoved = false;
        return;
    }

    isZoomed = !isZoomed;
    scale = isZoomed ? 2 : 1;
    translateX = translateY = 0;

    imageStage.classList.toggle("zoomed", isZoomed);
    applyTransform();
});

/* ---------- PAN ---------- */
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

/* ---------- APPLY TRANSFORM ---------- */
function applyTransform() {
    imageStage.style.transform =
        `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

/* ---------- CLAMP ---------- */
function clampPan() {
    const rect = imageStage.getBoundingClientRect();
    const maxX = rect.width * (scale - 1) / 2;
    const maxY = rect.height * (scale - 1) / 2;

    translateX = Math.max(-maxX, Math.min(maxX, translateX));
    translateY = Math.max(-maxY, Math.min(maxY, translateY));
}

/* ---------- RESET ---------- */
function resetView() {
    scale = 1;
    translateX = translateY = 0;
    isZoomed = false;
    imageStage.classList.remove("zoomed");
    imageStage.style.transform = "none";
}

/* ---------- FILTERS ---------- */
function applyFilters() {
    imageViewer.style.filter = `
        brightness(${brightness.value}%)
        contrast(${contrast.value}%)
        saturate(${saturation.value}%)
    `;
}

/* ---------- TRUE GAMMA ---------- */
gamma.addEventListener("input", () => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = originalSrc;

    img.onload = () => {
        const c = document.createElement("canvas");
        const ctx = c.getContext("2d");
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);

        const d = ctx.getImageData(0, 0, c.width, c.height);
        const g = gamma.value / 100;
        const inv = 1 / g;

        for (let i = 0; i < d.data.length; i += 4) {
            d.data[i] = 255 * Math.pow(d.data[i] / 255, inv);
            d.data[i + 1] = 255 * Math.pow(d.data[i + 1] / 255, inv);
            d.data[i + 2] = 255 * Math.pow(d.data[i + 2] / 255, inv);
        }

        ctx.putImageData(d, 0, 0);
        imageViewer.src = c.toDataURL();
    };
});

/* ---------- RESET FILTERS ---------- */
resetFiltersBtn.onclick = () => {
    brightness.value = contrast.value = saturation.value = gamma.value = 100;
    imageViewer.src = originalSrc;
    imageViewer.style.filter = "none";
};
