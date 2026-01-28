let images = [];
let currentIndex = 0;
let annotations = {};
let originalSrc = null;

const imageViewer = document.getElementById("imageViewer");
const imageLink = document.getElementById("imageLink");
const counter = document.getElementById("counter");
const status = document.getElementById("status");

const scratch = document.getElementById("scratch");
const crack = document.getElementById("crack");
const needsReview = document.getElementById("needsReview");

const brightness = document.getElementById("brightness");
const contrast = document.getElementById("contrast");
const saturation = document.getElementById("saturation");
const gammaSlider = document.getElementById("gamma");

document.getElementById("csvInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    status.textContent = "Loading CSV...";
    const reader = new FileReader();

    reader.onload = () => {
        images = reader.result
            .split(/\r?\n/)
            .map(r => r.replace(/"/g, "").trim())
            .filter(r => r.startsWith("http"));

        currentIndex = 0;
        status.textContent = `Loaded ${images.length} images`;
        loadImage();
    };

    reader.readAsText(file);
});

function loadImage() {
    const url = images[currentIndex];
    imageViewer.src = url;
    imageViewer.classList.remove("zoomed");
    imageLink.textContent = url;
    imageLink.href = url;
    counter.textContent = `${currentIndex + 1} / ${images.length}`;

    const a = annotations[url] || {};
    scratch.checked = a.scratch || false;
    crack.checked = a.crack || false;
    needsReview.checked = a.needsReview || false;
}

imageViewer.onload = () => {
    originalSrc = imageViewer.src;
    applyFilters();
};

function saveState() {
    annotations[images[currentIndex]] = {
        scratch: scratch.checked,
        crack: crack.checked,
        needsReview: needsReview.checked
    };
}

[scratch, crack, needsReview].forEach(cb =>
    cb.addEventListener("change", saveState)
);

document.getElementById("nextBtn").onclick = () => {
    saveState();
    if (currentIndex < images.length - 1) {
        currentIndex++;
        loadImage();
    }
};

document.getElementById("prevBtn").onclick = () => {
    saveState();
    if (currentIndex > 0) {
        currentIndex--;
        loadImage();
    }
};

/* Filters */
function applyFilters() {
    imageViewer.style.filter = `
    brightness(${brightness.value}%)
    contrast(${contrast.value}%)
    saturate(${saturation.value}%)
  `;
}

[brightness, contrast, saturation].forEach(sl =>
    sl.addEventListener("input", applyFilters)
);

/* True gamma */
gammaSlider.addEventListener("input", () => {
    if (!originalSrc) return;

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
        const g = gammaSlider.value / 100;
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

/* Reset */
document.getElementById("resetFiltersBtn").onclick = () => {
    brightness.value = contrast.value = saturation.value = gammaSlider.value = 100;
    imageViewer.src = originalSrc;
    imageViewer.style.filter = "none";
};

/* Click zoom */
imageViewer.addEventListener("click", () => {
    imageViewer.classList.toggle("zoomed");
});

/* Export */
document.getElementById("downloadBtn").onclick = () => {
    let csv = "image_url,scratch,crack,needs_review\n";
    for (const [url, v] of Object.entries(annotations)) {
        csv += `${url},${v.scratch || false},${v.crack || false},${v.needsReview || false}\n`;
    }

    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "audit_results.csv";
    a.click();
};
