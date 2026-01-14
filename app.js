let currentPath = "";
let filesList = [];
let sortBy = 'name_asc';
let selectedItem = null;
let adminKey = new URLSearchParams(window.location.search).get('show_hidden') || "";

let activeFilter = 'all';
let isSelecting = false;
let selectedItems = new Set();
let currentEditorFile = null;
let lastSelectedIndex = -1;
let inRecycleBin = false;
let monacoEditor = null;

function setLoader(show) {
    document.getElementById('globalLoader').style.display = show ? 'flex' : 'none';
}

// Monaco Loader
require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.45.0/min/vs' } });

function toggleTheme() {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    const icon = document.getElementById('themeIcon');
    if (icon) {
        icon.setAttribute('data-lucide', isLight ? 'moon' : 'sun');
        lucide.createIcons();
    }
}

if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
}

// Initial icon render
window.addEventListener('DOMContentLoaded', () => {
    if (document.body.classList.contains('light-mode')) {
        const icon = document.getElementById('themeIcon');
        if (icon) icon.setAttribute('data-lucide', 'moon');
    }
    lucide.createIcons();
    initResizer();
});

function initResizer() {
    const resizer = document.getElementById('panelResizer');
    const panel = document.getElementById('detailsPanel');
    if (!resizer || !panel) return;
    let isResizing = false;

    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none'; // Disable text selection while resizing
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const width = window.innerWidth - e.clientX;
        if (width >= 200 && width <= 800) {
            panel.style.width = `${width}px`;
            if (monacoEditor) monacoEditor.layout();
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = 'default';
            document.body.style.userSelect = 'auto';
        }
    });
}

function toggleSelectMode() {
    isSelecting = !isSelecting;
    const btn = document.getElementById('selectModeBtn');

    // Toggle UI state
    document.querySelectorAll('.file-card').forEach(c => {
        c.classList.toggle('selecting', isSelecting);
        if (!isSelecting) {
            c.classList.remove('selected');
            const cb = c.querySelector('.select-checkbox');
            if (cb) cb.checked = false;
        }
    });

    if (isSelecting) {
        btn.innerHTML = `<i data-lucide="x"></i> Cancel`;
    } else {
        btn.innerHTML = `<i data-lucide="check-square"></i> Select`;
        selectedItems.clear();
        updateBatchToolbar();
    }
    lucide.createIcons();
}

function toggleItemSelection(item, card, index, isShift) {
    if (isShift && lastSelectedIndex !== -1) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const cards = document.querySelectorAll('.file-card');
        const items = activeFilter === 'all' ? filesList : filesList.filter(it => it.is_dir || getFileType(it.name) === activeFilter);

        for (let i = start; i <= end; i++) {
            const it = items[i];
            const c = cards[i];
            const key = JSON.stringify({ path: it.path || currentPath, name: it.name });
            if (!selectedItems.has(key)) {
                selectedItems.add(key);
                c.classList.add('selected');
                c.querySelector('.select-checkbox').checked = true;
            }
        }
    } else {
        const key = JSON.stringify({ path: item.path || currentPath, name: item.name });
        if (selectedItems.has(key)) {
            selectedItems.delete(key);
            card.classList.remove('selected');
            card.querySelector('.select-checkbox').checked = false;
        } else {
            selectedItems.add(key);
            card.classList.add('selected');
            card.querySelector('.select-checkbox').checked = true;
        }
    }
    lastSelectedIndex = index;
    updateBatchToolbar();
}

function updateBatchToolbar() {
    const bar = document.getElementById('batchToolbar');
    const count = document.getElementById('batchCount');
    count.textContent = `${selectedItems.size} items selected`;
    bar.classList.toggle('active', selectedItems.size > 0);
}

async function fetchSysInfo() {
    try {
        const res = await fetch('/api/sysinfo');
        const data = await res.json();
        document.getElementById('sysInfo').innerHTML = `
            <span><i data-lucide="monitor" style="width:14px; height:14px;"></i> ${data.os}</span>
            <span><i data-lucide="cpu" style="width:14px; height:14px;"></i> CPU: ${data.cpu}%</span>
            <span><i data-lucide="memory-stick" style="width:14px; height:14px;"></i> RAM: ${data.ram}%</span>
            <span><i data-lucide="hard-drive" style="width:14px; height:14px;"></i> Disk: ${data.disk.percent}%</span>
        `;
        lucide.createIcons();
    } catch (e) { }
}
setInterval(fetchSysInfo, 10000);
fetchSysInfo();

function setFilter(button) {
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderFiles();
}



async function openSendToModal() {
    // selectedItem is the item you right-clicked on
    if (!selectedItem) return;

    document.getElementById('contextMenu').style.display = 'none';
    const modal = document.getElementById('sendToModal');
    const list = document.getElementById('folderList');
    list.innerHTML = "Loading folders...";
    modal.style.display = "flex";

    const res = await fetch('/api/all_folders');
    const folders = await res.json();

    list.innerHTML = "";

    // Create a button for the Root "Home" folder
    createFolderBtn(list, `<i data-lucide="home" style="width:14px; height:14px; margin-right:4px;"></i> Home (Root)`, "");

    folders.forEach(path => {
        if (path === "") return; // Skip root as we added it manually
        // Indent subfolders for a "tree" look
        const depth = path.split('/').length - 1;
        const name = "  ".repeat(depth) + `<i data-lucide="folder" style="width:14px; height:14px; margin-right:4px;"></i> ` + path.split('/').pop();
        createFolderBtn(list, name, path);
    });
    lucide.createIcons();
}

function createFolderBtn(container, displayName, targetPath) {
    const btn = document.createElement('button');
    btn.className = "btn";
    btn.style.textAlign = "left";
    btn.style.padding = "10px";
    btn.innerHTML = displayName;
    btn.onclick = () => moveFile(targetPath);
    container.appendChild(btn);
}

async function moveFile(destFolderPath) {
    if (selectedItems.size > 0) {
        const items = Array.from(selectedItems).map(s => JSON.parse(s));
        for (const item of items) {
            const finalDestination = destFolderPath ? `${destFolderPath}/${item.name}` : item.name;
            await fetch('/api/rename', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    path: item.path,
                    old_name: item.name,
                    new_name: finalDestination
                })
            });
        }
        showToast(`Moved ${selectedItems.size} items to ${destFolderPath || 'Home'}`);
        selectedItems.clear();
        updateBatchToolbar();
        closeSendToModal();
        fetchFiles(currentPath);
        return;
    }

    if (!selectedItem) return;

    const fileName = selectedItem.name;
    // This creates a path like "Folder/Subfolder/filename.ext"
    // If destFolderPath is empty (Home), it becomes just "filename.ext"
    const finalDestination = destFolderPath ? `${destFolderPath}/${fileName}` : fileName;

    const res = await fetch('/api/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            path: currentPath,      // Where the file is now
            old_name: fileName,     // The file name
            new_name: finalDestination // Where the file is going
        })
    });

    if (res.ok) {
        showToast(`Moved to ${destFolderPath || 'Home'}`);
        closeSendToModal();
        fetchFiles(currentPath);
    } else {
        showToast("Failed to move file. Check if a file with that name already exists in the destination.", "error");
    }
}

function closeSendToModal() {
    document.getElementById('sendToModal').style.display = 'none';
}


const FILE_TYPES = {
    image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'],
    video: ['mp4', 'webm', 'mkv', 'avi', 'mov', 'flv', 'mpeg'],
    audio: ['mp3', 'wav', 'ogg', 'aac', 'flac'],
    pdf: ['pdf'],
    html: ['html', 'htm'],
    text: [
        'txt', 'md', 'log', 'ini', 'cfg', 'csv', 'json', 'xml', 'yml', 'yaml',
    ],
    code: [
        'c', 'h', 'cpp', 'hpp', 'cc',
        'py', 'js', 'ts', 'java', 'cs', 'go', 'rs',
        'php', 'rb', 'sh', 'bat', 'ps1',
        'swift', 'kt', 'dart', 'lua', 'r'
    ],
    archive: ['zip', 'rar', '7z', 'tar', 'gz'],
    others: ['xls', 'xlsx', 'xlsm', 'xlsb', 'xltx', 'docx'],
};

function getFileType(name) {
    const ext = name.split('.').pop().toLowerCase();
    for (const [type, list] of Object.entries(FILE_TYPES)) {
        if (list.includes(ext)) return type;
    }
    return 'other';
}

function updateStats() {
    const counts = {
        total: 0,
        image: 0,
        video: 0,
        audio: 0,
        pdf: 0,
        text: 0,
        code: 0,
        html: 0,
        other: 0
    };

    filesList.forEach(f => {
        if (f.is_dir) return;
        counts.total++;
        const t = getFileType(f.name);
        counts[t] = (counts[t] || 0) + 1;
    });

    const stats = [];

    // Total (always show)
    stats.push(`
<button class="count-btn" title="Total Files">
    <i data-lucide="file"></i>
    <span>${counts.total}</span>
</button>
`);

    if (counts.image > 0) stats.push(statBtn('Images', 'image', counts.image));
    if (counts.video > 0) stats.push(statBtn('Videos', 'video', counts.video));
    if (counts.audio > 0) stats.push(statBtn('Audios', 'music', counts.audio));
    if (counts.pdf > 0) stats.push(statBtn('PDFs', 'file-text', counts.pdf));

    const textCode = counts.text + counts.code;
    if (textCode > 0) stats.push(statBtn('Text & Code', 'code', textCode));

    if (counts.html > 0) stats.push(statBtn('HTML Files', 'file-code', counts.html));
    if (counts.other > 0) stats.push(statBtn('Other Files', 'file-digit', counts.other));

    document.getElementById('statsBar').innerHTML = stats.join('');
    lucide.createIcons();
}

/* Helper */
function statBtn(title, icon, value) {
    return `
<button class="count-btn" title="${title}">
    <i data-lucide="${icon}"></i>
    <span>${value}</span>
</button>
`;
}



async function fetchFiles(path = "") {
    setLoader(true);
    const isGlobal = document.getElementById('globalSearch').checked;
    const q = document.getElementById('searchInput').value;

    let url;
    if (inRecycleBin) {
        url = `/api/recycle_bin`;
    } else if (isGlobal && q) {
        url = `/api/search?q=${encodeURIComponent(q)}`;
    } else {
        url = `/api/list?path=${encodeURIComponent(path)}`;
    }

    if (adminKey) url += (url.includes('?') ? '&' : '?') + `show_hidden=${adminKey}`;

    const res = await fetch(url);
    const data = await res.json();
    setLoader(false);

    if (Array.isArray(data)) {
        // Global search results
        filesList = data;
        currentPath = path; // Keep path same or handle as search view
    } else {
        currentPath = data.path;
        filesList = data.items;
    }

    updateBreadcrumbs();
    applySortAndRender();
    updateStats();
}

function updateBreadcrumbs() {
    const container = document.getElementById('breadcrumb');
    container.innerHTML = `<span onclick="fetchFiles('')"><i data-lucide="home" style="width:14px; height:14px; vertical-align:text-bottom;"></i></span>`;
    let accum = "";
    currentPath.split('/').filter(p => p).forEach(part => {
        accum += (accum ? '/' : '') + part;
        const thisPath = accum;
        container.innerHTML += ` <span style="opacity:0.3">/</span> <span onclick="fetchFiles('${thisPath}')">${part}</span>`;
    });
}

// Lazy Load Globals
let renderedCount = 0;
const BATCH_SIZE = 50;
let currentFilteredList = [];
let observerTarget = null;

function renderFiles(reset = true) {
    const container = document.getElementById('explorer');
    const isGrid = container.classList.contains('grid');

    // Store filtered list globally for pagination
    currentFilteredList = filesList.filter(item => {
        const fileType = item.is_dir ? 'dir' : getFileType(item.name);
        return activeFilter === 'all' || fileType === activeFilter || item.is_dir;
    });

    if (currentFilteredList.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="folder-open"></i>
                <h3>No items found</h3>
                <p>Try changing the filter or uploading a new file.</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    if (reset) {
        container.innerHTML = "";
        renderedCount = 0;
        // Create Sentinel for Infinite Scroll
        observerTarget = document.createElement('div');
        observerTarget.id = 'scroll-sentinel';
        observerTarget.style.height = '10px';
        container.appendChild(observerTarget);

        // Setup Observer
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) {
                renderNextBatch();
            }
        }, { root: container, rootMargin: '200px' });
        observer.observe(observerTarget);
    }

    // Initial Render
    renderNextBatch();
}

function renderNextBatch() {
    const container = document.getElementById('explorer');
    const isGrid = container.classList.contains('grid');
    const sentinel = document.getElementById('scroll-sentinel');

    const nextBatch = currentFilteredList.slice(renderedCount, renderedCount + BATCH_SIZE);
    if (nextBatch.length === 0) return;

    nextBatch.forEach((item, index) => {
        const globalIndex = renderedCount + index; // Track actual index

        const card = document.createElement('div');
        card.className = 'file-card';
        card.dataset.name = item.name.toLowerCase();
        const encodedUrl = getFullUrl(item.name);
        const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.name);

        const isSelected = selectedItems.has(JSON.stringify({ path: item.path || currentPath, name: item.name }));
        card.innerHTML = `
            <input type="checkbox" class="select-checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
            ${isGrid ? `
                <div class="preview-area">${isImg ? `<img src="${encodedUrl}" loading="lazy">` : `<i data-lucide="${item.is_dir ? 'folder' : 'file-text'}"></i>`}</div>
                <div class="file-info"><div class="file-name">${item.name}</div></div>
            ` : `
                <div class="preview-area">${isImg ? `<img src="${encodedUrl}" loading="lazy">` : `<i data-lucide="${item.is_dir ? 'folder' : 'file-text'}"></i>`}</div>
                <div class="file-info">
                    <div class="file-name">${item.name}</div>
                    <div class="list-meta">${item.is_dir ? 'Folder' : formatSize(item.size)}</div>
                    <div class="list-meta">${item.is_dir ? '--' : item.name.split('.').pop().toUpperCase()}</div>
                </div>
            `}
        `;
        if (isSelecting) card.classList.add('selecting');
        if (isSelected) card.classList.add('selected');

        card.oncontextmenu = (e) => { e.preventDefault(); showMenu(e, item); };

        card.onclick = (e) => {
            if (e.target.classList.contains('select-checkbox')) {
                toggleItemSelection(item, card, globalIndex, e.shiftKey);
                return;
            }
            if (isSelecting) {
                toggleItemSelection(item, card, globalIndex, e.shiftKey);
                return;
            }

            // Single click for preview/drill-down
            if (item.is_dir) {
                const targetPath = item.path !== undefined ? item.path : (currentPath ? `${currentPath}/${item.name}` : item.name);
                fetchFiles(targetPath);
            } else {
                const itemRelativePath = item.path !== undefined ? (item.path ? `${item.path}/${item.name}` : item.name) : (currentPath ? `${currentPath}/${item.name}` : item.name);
                const type = getFileType(item.name);
                if (type === 'image' || type === 'video') {
                    openMediaFullscreen(getFullUrl(item.name), type);
                } else {
                    openFilePreview({ ...item, relativePath: itemRelativePath });
                }
            }
        };
        card.title = item.name;

        // Insert before sentinel
        if (sentinel) {
            container.insertBefore(card, sentinel);
        } else {
            container.appendChild(card);
        }
    });

    renderedCount += nextBatch.length;
    lucide.createIcons();
}





function copyToClipboard(text) {
    // Attempt the modern way first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            showToast("Copied!");
        }).catch(err => {
            fallbackCopyTextToClipboard(text);
        });
    } else {
        // Use the old-school way if modern API is blocked
        fallbackCopyTextToClipboard(text);
    }
}

function fallbackCopyTextToClipboard(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;

    // Ensure the textarea is off-screen
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);

    textArea.focus();
    textArea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) showToast("Copied (Fallback)!");
    } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
    }

    document.body.removeChild(textArea);
}

function renderLinkDashboard(links, fullPath) {
    const isEditMode = document.body.dataset.dashEdit === 'true';
    let html = `
<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
    <h2 style="margin:0; font-family:'Outfit';">Design Space</h2>
    <div style="display:flex; gap:10px;">
        <button class="btn ${isEditMode ? 'btn-primary' : ''}" onclick="toggleDashEdit('${fullPath}')"><i data-lucide="edit-2"></i> ${isEditMode ? 'Finish' : 'Edit Interface'}</button>
        ${isEditMode ? `<button class="btn" onclick="promptAddLink('${fullPath}')"><i data-lucide="plus"></i> Add Item</button>` : ''}
    </div>
</div>
<div class="dash-grid">`;

    links.forEach((link, index) => {
        const icon = link.type === 'url' ? 'external-link' : 'file-text';
        const displayDesc = link.description || (link.type === 'text' ? link.value : 'No description provided.');
        html += `
    <div class="dash-card">
        ${isEditMode ? `<span style="position:absolute; top:12px; right:12px; cursor:pointer; color:#fb7185;" onclick="deleteLink('${fullPath}', ${index})"><i data-lucide="x-circle"></i></span>` : ''}
        <i data-lucide="${icon}"></i>
        <div>
            <h3>${link.title}</h3>
            <p style="word-break:break-all;">${displayDesc}</p>
        </div>
        <div style="display:flex; gap:8px; margin-top:auto;">
            ${link.type === 'url' ?
                `<a href="${link.value}" target="_blank" class="btn btn-primary" style="flex:1; justify-content:center; text-decoration:none;">Open Resource</a>` :
                `<div style="display:flex; gap:4px; flex:1;">
                    <button onclick="copyToClipboard('${link.value}')" class="btn btn-primary" style="flex:1; justify-content:center;">Copy Value</button>
                    ${link.value.includes('\n') ? `<button class="btn" onclick="viewValue('${link.value.replace(/'/g, "\\'")}')" title="Expand"><i data-lucide="maximize-2" style="width:14px;"></i></button>` : ''}
                </div>`
            }
        </div>
    </div>`;
    });
    html += `</div>`;
    setTimeout(() => lucide.createIcons(), 10);
    return html;
}

function toggleDashEdit(path) {
    document.body.dataset.dashEdit = document.body.dataset.dashEdit === 'true' ? 'false' : 'true';
    openFilePreview({ name: path.split('/').pop(), relativePath: path });
}

async function promptAddLink(filename) {
    const title = prompt("Enter Title (e.g., My Portfolio):");
    if (!title) return;
    const description = prompt("Enter short description:");
    const value = prompt("Enter URL or Text data:");
    if (!value) return;
    const type = value.startsWith('http') ? 'url' : 'text';

    const res = await fetch(getFullUrl(filename));
    const data = await res.json();

    data.links.push({ title, description, value, type });
    saveJsonToServer(filename, data);
}

async function deleteLink(filename, index) {
    if (!confirm("Delete this link?")) return;
    const res = await fetch(getFullUrl(filename));
    const data = await res.json();
    data.links.splice(index, 1);
    saveJsonToServer(filename, data);
}

async function saveJsonToServer(fullPath, content) {
    const res = await fetch('/api/save_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            filename: fullPath,
            content: content
        })
    });

    if (res.ok) {
        showToast("Updated successfully");
        // Don't reopen preview if we are in search mode or similar
        if (!document.getElementById('saveFileBtn').style.display) {
            openFilePreview({ name: fullPath.split('/').pop(), relativePath: fullPath });
        }
    } else {
        showToast("Error saving file. Check server logs.", "error");
    }
}

async function saveEditorContent() {
    if (!currentEditorFile) return;
    const content = monacoEditor ? monacoEditor.getValue() : document.getElementById('editorArea').value;

    const res = await fetch('/api/save_json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            filename: currentEditorFile.relativePath,
            content: content,
            raw: true // Backend should handle raw text if needed, or we just use save_json for now
        })
    });
    // Wait, handle_save_json expects content to be JSON object. 
    // I should either update server.py or send as a string in a JSON object.
    // Let's send it as a string in a JSON object for simplicity.

    if (res.ok) {
        showToast("File saved!");
        document.getElementById('saveFileBtn').style.display = 'none';
        toggleDetails(false);
    } else {
        showToast("Error saving file.", "error");
    }
}

async function openFilePreview(item) {
    const panel = document.getElementById('detailsPanel');
    const content = document.getElementById('detailContent');
    const path = item.relativePath || item.name;
    const url = `/${path}`;
    const type = getFileType(item.name);

    setLoader(true);
    let preview = '';

    if (item.name.endsWith('.json')) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (data && Array.isArray(data.links)) {
                content.innerHTML = renderLinkDashboard(data.links, path);
                panel.classList.add('active');
                setLoader(false);
                return;
            }
        } catch (e) { }
    }

    if (type === 'image') {
        preview = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="display:flex; justify-content:center; position:relative;">
                    <img src="${url}" style="max-width:100%; max-height:70vh; border-radius:12px; box-shadow:var(--shadow-lg);">
                    <button class="btn" style="position:absolute; bottom:12px; right:12px;" onclick="openMediaFullscreen('${url}', 'image')"><i data-lucide="maximize"></i> Fullscreen</button>
                </div>
            </div>`;
    }
    else if (type === 'video') {
        preview = `
            <div style="display:flex; flex-direction:column; gap:16px;">
                <div style="position:relative;">
                    <video src="${url}" controls style="width:100%; border-radius:12px;"></video>
                    <button class="btn" style="position:absolute; top:12px; right:12px;" onclick="openMediaFullscreen('${url}', 'video')"><i data-lucide="maximize"></i> Fullscreen</button>
                </div>
            </div>`;
    }
    else if (type === 'audio') preview = `<audio src="${url}" controls style="width:100%"></audio>`;
    else if (type === 'pdf') preview = `<iframe src="${url}" style="width:100%; height:80vh; border:none; border-radius:12px;"></iframe>`;
    else if (item.name.endsWith('.md')) {
        const text = await fetch(url).then(r => r.text());
        preview = `<div class="split-preview">
            <div id="monaco-container" class="editor-container" style="position:relative;">
                <button class="btn" style="position:absolute; top:8px; right:8px; z-index:10; padding:4px;" onclick="toggleFullscreen()" title="Fullscreen"><i data-lucide="maximize"></i></button>
            </div>
            <div class="markdown-body" id="md-render" style="background:var(--bg-card); padding:24px; border-radius:12px; overflow-y:auto;">${marked.parse(text)}</div>
        </div>`;
        setTimeout(() => createMonaco(text, 'markdown', true), 100);
    }
    else if (type === 'text' || type === 'code' || type === 'html' || item.name.endsWith('.json')) {
        const text = await fetch(url).then(r => r.text());
        currentEditorFile = item;
        document.getElementById('saveFileBtn').style.display = 'block';
        preview = `
            <div id="monaco-container" class="editor-container" style="position:relative;">
                <button class="btn" style="position:absolute; top:8px; right:8px; z-index:10; padding:4px;" onclick="toggleFullscreen()" title="Fullscreen"><i data-lucide="maximize"></i></button>
            </div>
            <div style="display:flex; gap:12px; margin-top:16px;">
                <button class="btn btn-primary" onclick="saveEditorContent()"><i data-lucide="save"></i> Save Changes</button>
                <button class="btn" onclick="copyToClipboard(monacoEditor.getValue())"><i data-lucide="copy"></i> Copy Source</button>
                <button class="btn" onclick="openRaw(currentEditorFile)"><i data-lucide="external-link"></i> New Tab</button>
                ${type === 'html' ? `<button class="btn" onclick="openPage('${path}')"><i data-lucide="external-link"></i> Live Preview</button>` : ''}
            </div>`;
        const lang = item.name.endsWith('.c') ? 'c' : (item.name.endsWith('.java') ? 'java' : (item.name.endsWith('.py') ? 'python' : type));
        setTimeout(() => createMonaco(text, lang), 100);
    }
    else {
        preview = `<div style="text-align:center; padding:40px;">
            <i data-lucide="file" style="width:64px; height:64px; opacity:0.2;"></i>
            <h3>No preview available</h3>
            <a href="${url}" download class="btn btn-primary" style="margin-top:16px;">Download to View</a>
        </div>`;
    }

    content.innerHTML = `
        <div style="margin-bottom:24px;">${preview}</div>
        <div class="glass-info" style="padding:20px; border-radius:16px; background:var(--glass);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <h2 style="margin:0; font-family:'Outfit';">${item.name}</h2>
                    <p style="color:var(--text-muted); margin:4px 0;">${item.is_dir ? 'Directory' : formatSize(item.size)} • /Home/${path}</p>
                </div>
            </div>
        </div>
        
        <!-- Comments Section -->
        <div class="comments-section" style="margin-top:20px; border-top:1px solid var(--border); padding-top:15px;">
            <h4 style="margin:0 0 10px 0;">Comments</h4>
            <div id="commentsList" style="max-height:200px; overflow-y:auto; margin-bottom:10px;"></div>
            <div style="display:flex; gap:8px;">
                 <input type="text" id="commentInput" class="search-box" placeholder="Add a comment..." onkeydown="if(event.key==='Enter') postComment('${path}')">
                 <button class="btn" onclick="postComment('${path}')"><i data-lucide="send"></i></button>
            </div>
        </div>
    </div>
    `;
    panel.classList.add('active');
    lucide.createIcons();
    setLoader(false);
    loadComments(path);
}

function createMonaco(content, lang, isMarkdown = false) {
    if (monacoEditor) { monacoEditor.dispose(); }
    require(['vs/editor/editor.main'], function () {
        monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
            value: content,
            language: lang === 'code' ? 'javascript' : lang,
            theme: document.body.classList.contains('light-mode') ? 'vs' : 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            fontFamily: 'Fira Code, monospace',
            minimap: { enabled: false },
            roundedSelection: true,
            scrollBeyondLastLine: false,
            padding: { top: 16 }
        });

        if (isMarkdown) {
            monacoEditor.onDidChangeModelContent(() => {
                document.getElementById('md-render').innerHTML = marked.parse(monacoEditor.getValue());
            });
        }
    });
}

async function deleteBatch() {
    if (selectedItems.size === 0) return;
    if (!confirm(`Delete ${selectedItems.size} items?`)) return;

    const items = Array.from(selectedItems).map(s => JSON.parse(s));
    const res = await fetch('/api/batch_delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items })
    });

    if (res.ok) {
        showToast(`Deleted ${selectedItems.size} items`);
        selectedItems.clear();
        updateBatchToolbar();
        fetchFiles(currentPath);
    }
}

async function downloadBatch() {
    if (selectedItems.size === 0) return;
    const items = Array.from(selectedItems).map(s => JSON.parse(s));

    const res = await fetch('/api/zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, filename: `selected_items_${Date.now()}.zip` })
    });

    if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `selected_items_${Date.now()}.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    } else {
        showToast("Failed to create ZIP.", "error");
    }
}

function openBatchMove() {
    if (selectedItems.size === 0) return;
    openSendToModal();
}

function escapeHtml(str) {
    return str.replace(/[&<>"']/g, m => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[m]));
}


function showMenu(e, item) {
    selectedItem = item;
    const menu = document.getElementById('contextMenu');

    // Hide all items first
    menu.querySelectorAll('.dropdown-item').forEach(el => el.style.display = 'none');

    if (inRecycleBin) {
        menu.querySelector('[onclick="handleMenuAction(\'restore\')"]').style.display = 'flex';
        menu.querySelector('[onclick="handleMenuAction(\'purge\')"]').style.display = 'flex';
        menu.querySelector('[onclick="handleMenuAction(\'details\')"]').style.display = 'flex';
    } else {
        menu.querySelector('[onclick="handleMenuAction(\'details\')"]').style.display = 'flex';
        menu.querySelector('[onclick="handleMenuAction(\'rename\')"]').style.display = 'flex';
        menu.querySelector('[onclick="openSendToModal()"]').style.display = 'flex';
        menu.querySelector('[onclick="handleMenuAction(\'delete\')"]').style.display = 'flex';
        if (!item.is_dir) {
            menu.querySelector('[onclick="handleMenuAction(\'download\')"]').style.display = 'flex';
            menu.querySelector('[onclick="handleMenuAction(\'share\')"]').style.display = 'flex';
        }
    }

    menu.style.display = 'block';
    const x = Math.min(e.clientX, window.innerWidth - 190);
    const y = Math.min(e.clientY, window.innerHeight - (inRecycleBin ? 120 : 200));
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
}

function toggleDetails(show, item = null) {
    const panel = document.getElementById('detailsPanel');
    if (!show) return panel.classList.remove('active');
    const encodedUrl = getFullUrl(item.name);
    const isImg = !item.is_dir && /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(item.name);

    document.getElementById('detailContent').innerHTML = `
        <div style="width:100%; height:200px; background:#000; display:flex; align-items:center; justify-content:center; border-radius:12px; margin-bottom:1.5rem; overflow:hidden;">
            ${isImg ? `<img src="${encodedUrl}" style="max-width:100%; max-height:100%; object-fit:contain;">` : `<i data-lucide="${item.is_dir ? 'folder' : 'file-text'}" style="width:80px; height:80px;"></i>`}
        </div>
        <div style="display:grid; gap:15px;">
            <div><small style="color:var(--text-muted)">NAME</small><p style="word-break:break-all;">${item.name}</p></div>
            <div><small style="color:var(--text-muted)">SIZE</small><p>${item.is_dir ? 'Folder' : formatSize(item.size)}</p></div>
            <div><small style="color:var(--text-muted)">LOCATION</small><p style="color:var(--primary)">/Home/${currentPath}</p></div>
        </div>
    `;
    panel.classList.add('active');
    lucide.createIcons();
}

function uploadFiles(files) {
    const drawer = document.getElementById('uploadDrawer');
    const list = document.getElementById('uploadList');
    drawer.style.display = 'flex';

    // Clear previous finished uploads if drawer was closed
    // list.innerHTML = "";

    Array.from(files).forEach(file => {
        const item = document.createElement('div');
        item.className = 'upload-item';
        const fileId = 'up-' + Math.random().toString(36).substr(2, 9);
        item.id = fileId;
        item.innerHTML = `
            <div class="upload-item-header">
                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:180px;">${file.name}</span>
                <span class="up-percent">0%</span>
            </div>
            <div class="upload-item-bar"><div class="upload-item-progress"></div></div>
        `;
        list.prepend(item);

        const xhr = new XMLHttpRequest();
        const fd = new FormData();
        fd.append('file', file);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const p = Math.round((e.loaded / e.total) * 100);
                item.querySelector('.up-percent').textContent = `${p}%`;
                item.querySelector('.upload-item-progress').style.width = `${p}%`;
            }
        };

        xhr.onload = () => {
            item.style.borderColor = 'var(--primary)';
            setTimeout(() => {
                // Keep it for a bit then maybe fade out or stay in list
                item.querySelector('.up-percent').innerHTML = '<i data-lucide="check" style="width:12px; height:12px; color:#10b981"></i>';
                lucide.createIcons();
            }, 1000);
            fetchFiles(currentPath);
        };

        xhr.open('POST', `/api/upload?path=${encodeURIComponent(currentPath)}`);
        xhr.send(fd);
    });
}

function closeUploadDrawer() {
    document.getElementById('uploadDrawer').style.display = 'none';
    document.getElementById('uploadList').innerHTML = "";
}

// --- Standard Logic & Listeners ---
function handleMenuAction(action) {
    const encodedUrl = getFullUrl(selectedItem.name);
    if (action === 'details') toggleDetails(true, selectedItem);
    if (action === 'download') { const a = document.createElement('a'); a.href = encodedUrl; a.download = selectedItem.name; a.click(); }
    if (action === 'rename') renameItem(selectedItem.name);
    if (action === 'delete') deleteItem(selectedItem.name);
    if (action === 'restore') restoreItem(selectedItem.name);
    if (action === 'purge') purgeItem(selectedItem.name);
    if (action === 'share') shareItem(selectedItem);
    if (action === 'open-page') openPage(getFullUrl(selectedItem.name));
    document.getElementById('contextMenu').style.display = 'none';
}

function openPage(url) {
    window.open('/' + url, '_blank');
}

function openMediaFullscreen(url, type) {
    const overlay = document.getElementById('mediaFullscreenOverlay');
    const content = document.getElementById('fullscreenContent');
    content.innerHTML = type === 'image' ? `<img src="${url}">` : `<video src="${url}" controls autoplay></video>`;
    overlay.style.display = 'flex';
    lucide.createIcons();
}

function closeMediaFullscreen() {
    const overlay = document.getElementById('mediaFullscreenOverlay');
    const content = document.getElementById('fullscreenContent');
    content.innerHTML = '';
    overlay.style.display = 'none';
}

// Media Fullscreen Logic
let currentMediaList = [];
let currentMediaIndex = -1;

function openMediaFullscreen(url, type) {
    const overlay = document.getElementById('mediaFullscreenOverlay');
    const content = document.getElementById('fullscreenContent');
    const encodedName = url.split('/').pop(); // rough check

    // Build list of valid media from current file list
    // We filter using the same extensions logic
    currentMediaList = filesList.filter(f => !f.is_dir && ['image', 'video'].includes(getFileType(f.name)));
    currentMediaIndex = currentMediaList.findIndex(f => getFullUrl(f.name) === url || f.name === decodeURIComponent(encodedName));

    // If not found (shouldn't happen often), just use single item list
    if (currentMediaIndex === -1) {
        // Try to match by just name if URL mismatch
        const clickedName = decodeURIComponent(url.split('/').pop());
        currentMediaIndex = currentMediaList.findIndex(f => f.name === clickedName);
    }

    renderFullscreenContent(url, type);
    overlay.style.display = 'flex';
    // Focus overlay for keyboard events
    overlay.focus();
    lucide.createIcons();

    // Add temporary key listener
    window.addEventListener('keydown', handleFullscreenKeys);
}

function renderFullscreenContent(url, type) {
    const content = document.getElementById('fullscreenContent');
    // Simple transition fade could be added here
    content.style.opacity = '0';
    setTimeout(() => {
        content.innerHTML = type === 'image' ? `<img src="${url}">` : `<video src="${url}" controls autoplay></video>`;
        content.style.opacity = '1';

        // Update nav buttons visibility
        document.querySelector('.nav-btn.prev').style.display = currentMediaList.length > 1 ? 'flex' : 'none';
        document.querySelector('.nav-btn.next').style.display = currentMediaList.length > 1 ? 'flex' : 'none';
    }, 50);
}

function closeMediaFullscreen() {
    const overlay = document.getElementById('mediaFullscreenOverlay');
    const content = document.getElementById('fullscreenContent');
    content.innerHTML = '';
    overlay.style.display = 'none';
    window.removeEventListener('keydown', handleFullscreenKeys);
}

function navigateMedia(dir) {
    if (currentMediaList.length <= 1) return;

    let newIndex = currentMediaIndex + dir;
    // Loop around
    if (newIndex < 0) newIndex = currentMediaList.length - 1;
    if (newIndex >= currentMediaList.length) newIndex = 0;

    currentMediaIndex = newIndex;
    const item = currentMediaList[currentMediaIndex];
    const type = getFileType(item.name);
    const url = getFullUrl(item.name);

    renderFullscreenContent(url, type);
}

function downloadCurrentMedia() {
    if (currentMediaIndex === -1 || !currentMediaList[currentMediaIndex]) return;
    const item = currentMediaList[currentMediaIndex];
    const url = getFullUrl(item.name);

    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showToast(`Downloading ${item.name}...`, 'info');
}

function handleFullscreenKeys(e) {
    if (document.getElementById('mediaFullscreenOverlay').style.display === 'none') return;

    if (e.key === 'Escape') closeMediaFullscreen();
    if (e.key === 'ArrowLeft') navigateMedia(-1);
    if (e.key === 'ArrowRight') navigateMedia(1);
}

function openRaw(item) {
    const path = item.relativePath || item.name;
    window.open('/' + path, '_blank');
}

function toggleFullscreen() {
    const container = document.getElementById('monaco-container');
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        container.requestFullscreen().catch(err => {
            // Fallback for browsers that don't support or block standard fullscreen
            container.classList.toggle('fullscreen-editor');
            if (monacoEditor) monacoEditor.layout();
        });
    }

    // Refresh layout on standard fullscreen events
    container.onfullscreenchange = () => {
        if (monacoEditor) {
            setTimeout(() => monacoEditor.layout(), 100);
        }
    };
}

function viewValue(val) {
    alert(val);
}

function shareItem(item) {
    const url = window.location.origin + '/' + getFullUrl(item.name);
    copyToClipboard(url);
    showToast("Share link copied to clipboard!");
}

function toggleRecycleBin() {
    inRecycleBin = !inRecycleBin;
    const btn = document.getElementById('recycleBinBtn');
    btn.classList.toggle('btn-primary', inRecycleBin);

    // Toggle visiblity of toolbar buttons
    document.getElementById('selectModeBtn').style.display = inRecycleBin ? 'none' : 'flex';
    document.querySelector('button[onclick="createNewFolder()"]').style.display = inRecycleBin ? 'none' : 'flex';
    document.querySelector('button[onclick="document.getElementById(\'fileInput\').click()"]').style.display = inRecycleBin ? 'none' : 'flex';

    fetchFiles("");
}

async function restoreItem(n) {
    const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n })
    });
    if (res.ok) {
        showToast("Restored");
        fetchFiles("");
    }
}

async function purgeItem(n) {
    if (confirm(`Permanently delete ${n}? This cannot be undone.`)) {
        const res = await fetch('/api/purge', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: n })
        });
        if (res.ok) {
            showToast("Permanently Deleted");
            fetchFiles("");
        }
    }
}

function editMode() {
    document.getElementById('editorCode').parentElement.style.display = 'none';
    document.getElementById('editorArea').style.display = 'block';
    document.getElementById('editBtn').style.display = 'none';
    document.getElementById('saveFileBtn').style.display = 'block';
}

// Toast System
function showToast(msg, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');

    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Icon mapping
    const icons = {
        success: 'check-circle-2',
        error: 'alert-circle',
        warning: 'alert-triangle',
        info: 'info'
    };

    const iconName = icons[type] || icons.info;
    const title = type.charAt(0).toUpperCase() + type.slice(1);

    toast.innerHTML = `
        <div class="toast-icon">
            <i data-lucide="${iconName}"></i>
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${msg}</div>
        </div>
        <div class="toast-close" onclick="this.closest('.toast').remove()">
            <i data-lucide="x" style="width:16px; height:16px;"></i>
        </div>
        <div class="toast-progress" style="animation-duration: ${duration}ms"></div>
    `;

    // Add to container
    container.appendChild(toast);
    lucide.createIcons();

    // Auto remove
    const timeout = setTimeout(() => {
        toast.classList.add('hiding');
        toast.addEventListener('animationend', () => toast.remove());
    }, duration);

    // Pause on hover
    toast.addEventListener('mouseenter', () => {
        toast.querySelector('.toast-progress').style.animationPlayState = 'paused';
        clearTimeout(timeout);
    });

    toast.addEventListener('mouseleave', () => {
        toast.querySelector('.toast-progress').style.animationPlayState = 'running';
        const remaining = duration; // Simplification: resets timer on hover out, or we could leave it
        // Ideally we would calculate remaining time, but for simplicity let's just re-set a short timeout or let it expire
        // A better UX might be just letting it stay until interaction ends + little delay.
        // Let's just set a new timeout for 1s so it doesn't disappear immediately
        setTimeout(() => {
            if (!toast.matches(':hover')) {
                toast.classList.add('hiding');
                toast.addEventListener('animationend', () => toast.remove());
            }
        }, 1000);
    });
}
function toggleView() {
    const explorer = document.getElementById('explorer');
    explorer.classList.toggle('grid');
    explorer.classList.toggle('list');
    const icon = document.getElementById('viewIcon');
    if (icon) {
        icon.setAttribute('data-lucide', explorer.classList.contains('grid') ? 'layers' : 'list');
        lucide.createIcons();
    }
    renderFiles();
}
function goBack() { if (!currentPath) return; const parts = currentPath.split("/"); parts.pop(); fetchFiles(parts.join("/")); }
function changeSort(v) { sortBy = v; applySortAndRender(); }
function formatSize(b) { if (!b) return '0 B'; let i = Math.floor(Math.log(b) / Math.log(1024)); return (b / Math.pow(1024, i)).toFixed(1) + ' ' + ['B', 'KB', 'MB', 'GB'][i]; }
function getFullUrl(name) { return (currentPath ? `${currentPath}/${name}` : name).split('/').map(encodeURIComponent).join('/'); }
function applySortAndRender() { filesList.sort((a, b) => { if (a.is_dir !== b.is_dir) return b.is_dir - a.is_dir; let c = sortBy.startsWith('name') ? a.name.localeCompare(b.name) : (a.size || 0) - (b.size || 0); return sortBy.endsWith('desc') ? -c : c; }); renderFiles(); }

window.onclick = () => document.getElementById('contextMenu').style.display = 'none';
window.onkeydown = (e) => {
    if (e.key === "Backspace" && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') { e.preventDefault(); goBack(); }
    if (e.key === "/" || (e.ctrlKey && e.key === "f")) { e.preventDefault(); document.getElementById('searchInput').focus(); }
    if (e.altKey && e.key === "n") { e.preventDefault(); createNewFolder(); }
    if (e.ctrlKey && e.shiftKey && e.key === "S") {
        e.preventDefault();
        const key = prompt("Enter Admin Key:");
        if (key) {
            adminKey = key;
            fetchFiles(currentPath);
        }
    }
};

const dragOverlay = document.getElementById('dragOverlay');
window.ondragover = e => { e.preventDefault(); dragOverlay.classList.add('active'); };
window.ondragleave = e => { if (!e.relatedTarget) dragOverlay.classList.remove('active'); };
window.ondrop = e => { e.preventDefault(); dragOverlay.classList.remove('active'); uploadFiles(e.dataTransfer.files); };

document.getElementById('searchInput').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('.file-card').forEach(c => c.classList.toggle('hidden', !c.dataset.name.includes(q)));
};

async function deleteItem(n) { if (confirm(`Delete ${n}?`)) { await fetch('/api/delete', { method: 'POST', body: JSON.stringify({ path: currentPath, name: n }) }); fetchFiles(currentPath); showToast('Deleted'); } }
async function renameItem(o) { const n = prompt("Rename to:", o); if (n) { await fetch('/api/rename', { method: 'POST', body: JSON.stringify({ path: currentPath, old_name: o, new_name: n }) }); fetchFiles(currentPath); } }
async function createNewFolder() { const n = prompt("Folder Name:"); if (n) { await fetch('/api/mkdir', { method: 'POST', body: JSON.stringify({ path: currentPath, folder: n }) }); fetchFiles(currentPath); } }
document.getElementById('fileInput').onchange = (e) => uploadFiles(e.target.files);

fetchFiles();

// Activity Log Functions
function openActivityLog() {
    const modal = document.getElementById('activityModal');
    const list = document.getElementById('activityList');
    modal.style.display = 'flex';
    list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary)">Loading...</div>';

    fetch('/api/activity')
        .then(res => res.json())
        .then(logs => {
            list.innerHTML = '';
            if (logs.length === 0) {
                list.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-secondary)">No recent activity</div>';
                return;
            }
            logs.forEach(log => {
                const item = document.createElement('div');
                item.style.cssText = 'background:var(--bg-secondary); padding:10px; border-radius:8px; border:1px solid var(--border); display:flex; flex-direction:column; gap:4px;';
                item.innerHTML = `
                    <div style="display:flex; justify-content:space-between; font-size:0.85rem;">
                        <span style="font-weight:600; color:var(--primary);">${log.action}</span>
                        <span style="opacity:0.6;">${log.timestamp}</span>
                    </div>
                    <div style="font-size:0.9rem;">${log.filename}</div>
                    <div style="font-size:0.75rem; opacity:0.5;">User: ${log.user} | IP: ${log.ip}</div>
                `;
                list.appendChild(item);
            });
        })
        .catch(err => {
            list.innerHTML = '<div style="text-align:center; padding:20px; color:#fb7185">Error loading logs</div>';
        });
}

function closeActivityLog() {
    document.getElementById('activityModal').style.display = 'none';
}

// Comments Functions
function loadComments(path) {
    const list = document.getElementById('commentsList');
    if (!list) return;
    list.innerHTML = '<div style="opacity:0.5; font-size:0.8rem;">Loading comments...</div>';

    fetch(`/api/comments?path=${encodeURIComponent(path)}`)
        .then(res => res.json())
        .then(comments => {
            list.innerHTML = '';
            if (comments.length === 0) {
                list.innerHTML = '<div style="opacity:0.5; font-size:0.8rem;">No comments yet.</div>';
                return;
            }
            comments.forEach(c => {
                const div = document.createElement('div');
                div.style.cssText = "margin-bottom:8px; background:var(--bg-primary); padding:8px; border-radius:6px;";
                div.innerHTML = `
                    <div style="font-size:0.75rem; display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="font-weight:600; color:var(--primary);">${c.author}</span>
                        <span style="opacity:0.5;">${c.timestamp}</span>
                    </div>
                    <div style="font-size:0.9rem;">${c.text}</div>
                `;
                list.appendChild(div);
            });
            list.scrollTop = list.scrollHeight;
        });
}

function postComment(path) {
    const input = document.getElementById('commentInput');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';

    fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path, text: text })
    }).then(res => {
        if (res.ok) loadComments(path);
    });
}
