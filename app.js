// app.js - Main Application Logic & UI Controller

// --- STATE MANAGEMENT ---
let currentUser = null;
let currentWeekStart = null; // Date object representing the Monday of the current week
let currentTimesheetRows = []; // Loaded rows: [{ projectId, activityId, hours: [7], description }]
let allProjects = [];
let allActivities = [];

// --- DATE UTILITIES ---
function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
}

function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

const TURKISH_MONTHS = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function displayWeekRange(monday) {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    
    const startDay = monday.getDate();
    const startMonth = TURKISH_MONTHS[monday.getMonth()];
    const startYear = monday.getFullYear();
    
    const endDay = sunday.getDate();
    const endMonth = TURKISH_MONTHS[sunday.getMonth()];
    const endYear = sunday.getFullYear();
    
    if (startYear !== endYear) {
        return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`;
    } else if (monday.getMonth() !== sunday.getMonth()) {
        return `${startDay} ${startMonth} - ${endDay} ${endMonth} ${startYear}`;
    } else {
        return `${startDay} - ${endDay} ${startMonth} ${startYear}`;
    }
}

// --- TOAST NOTIFICATIONS ---
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');
    
    // Set colors & icons
    toast.className = 'toast show ' + type;
    msg.innerText = message;
    
    if (type === 'success') {
        icon.className = 'fa-solid fa-circle-check';
    } else if (type === 'danger') {
        icon.className = 'fa-solid fa-circle-exclamation';
    } else if (type === 'warning') {
        icon.className = 'fa-solid fa-triangle-exclamation';
    } else {
        icon.className = 'fa-solid fa-circle-info';
    }
    
    // Hide toast after 4 seconds
    setTimeout(() => {
        toast.classList.remove('show');
    }, 4000);
}

// --- NAVIGATION & ROUTING ---
function switchSection(sectionId) {
    // Hide all sections
    document.querySelectorAll('.section').forEach(sec => sec.classList.remove('active'));
    document.querySelectorAll('.sidebar-link').forEach(link => link.classList.remove('active'));
    
    // Show active section
    const activeSection = document.getElementById(`section-${sectionId}`);
    if (activeSection) {
        activeSection.classList.add('active');
        const activeLink = document.getElementById(`nav-${sectionId}`);
        if (activeLink) activeLink.classList.add('active');
    }
    
    // Run section-specific initializations
    if (sectionId === 'timesheet') {
        loadWeeklyTimesheet();
    } else if (sectionId === 'reports') {
        loadReportFilters().then(() => runReport());
    } else if (sectionId === 'projects') {
        loadProjectsManagement();
    } else if (sectionId === 'activities') {
        loadActivitiesManagement();
    } else if (sectionId === 'users') {
        loadUsersManagement();
    } else if (sectionId === 'leaves') {
        loadLeavesPage();
    } else if (sectionId === 'announcements') {
        loadAnnouncementsPage();
    } else if (sectionId === 'settings') {
        loadSettingsPage();
    } else if (sectionId === 'org-chart') {
        if (currentUser.role !== 'admin') {
            switchSection('announcements');
            return;
        }
        loadOrgChart();
    }
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    currentUser = window.authAPI.getCurrentUser();
    
    if (currentUser) {
        showSystemDashboard();
    } else {
        showLoginScreen();
    }
});

function showLoginScreen() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-card').style.display = 'block';
    document.getElementById('register-card').style.display = 'none';
}

function showRegisterScreen() {
    document.getElementById('auth-container').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('login-card').style.display = 'none';
    document.getElementById('register-card').style.display = 'block';
}

function showSystemDashboard() {
    document.getElementById('auth-container').style.display = 'none';
    document.getElementById('app-container').style.display = 'flex';
    
    // Set user widget
    document.getElementById('user-name').innerText = currentUser.name;
    document.getElementById('user-role').innerText = currentUser.role === 'admin' ? 'Yönetici' : 'Personel';
    document.getElementById('user-avatar').innerText = currentUser.name.charAt(0).toUpperCase();
    
    // Handle admin layout modifications
    if (currentUser.role === 'admin') {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'block');
        // Reports has custom columns/filters for admin
        const reportUserFilter = document.getElementById('filter-user');
        if (reportUserFilter) {
            reportUserFilter.parentElement.style.display = 'block';
        }
        document.querySelectorAll('.report-col-user').forEach(el => el.style.display = 'table-cell');
    } else {
        document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
        const reportUserFilter = document.getElementById('filter-user');
        if (reportUserFilter) {
            reportUserFilter.parentElement.style.display = 'none';
        }
        document.querySelectorAll('.report-col-user').forEach(el => el.style.display = 'none');
    }
    
    // Load metadata
    loadMetadata().then(async () => {
        // Run migration if data is loaded
        if (window.migrationData) {
            await runMigration();
        }
        // Set date to current Monday
        currentWeekStart = getMonday(new Date());
        
        // Check if user is using default password
        await checkDefaultPassword();
        
        if (!mustChangePassword) {
            // Default to Announcements
            switchSection('announcements');
        }
    });
}

// Load metadata lists for cache
async function loadMetadata() {
    try {
        allProjects = await window.dbAPI.dbGetAllProjects();
        allActivities = await window.dbAPI.dbGetAllActivities();
    } catch (e) {
        console.error('Metadata loading failed:', e);
    }
}

// --- AUTH HANDLERS ---
async function handleLogin(event) {
    event.preventDefault();
    const userVal = document.getElementById('login-username').value;
    const passVal = document.getElementById('login-password').value;
    
    try {
        currentUser = await window.authAPI.login(userVal, passVal);
        showToast('Giriş başarılı!', 'success');
        showSystemDashboard();
        // Clear inputs
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

async function handleRegister(event) {
    event.preventDefault();
    const nameVal = document.getElementById('register-name').value;
    const userVal = document.getElementById('register-username').value;
    const passVal = document.getElementById('register-password').value;
    const roleVal = document.getElementById('register-role').value;
    
    try {
        await window.authAPI.register(userVal, passVal, nameVal, roleVal);
        showToast('Kayıt başarılı! Giriş yapabilirsiniz.', 'success');
        showLoginScreen();
        // Clear inputs
        document.getElementById('register-name').value = '';
        document.getElementById('register-username').value = '';
        document.getElementById('register-password').value = '';
    } catch (e) {
        showToast(e.message, 'danger');
    }
}

function handleLogout() {
    window.authAPI.logout();
    currentUser = null;
    showToast('Çıkış yapıldı.', 'info');
    showLoginScreen();
}

// --- WEEKLY TIMESHEET LOGIC ---
function changeWeek(offset) {
    const newDate = new Date(currentWeekStart);
    newDate.setDate(newDate.getDate() + (offset * 7));
    currentWeekStart = newDate;
    
    const activeSection = document.querySelector('.section.active');
    if (activeSection && activeSection.id === 'section-announcements') {
        loadAnnouncementsPage();
    } else {
        loadWeeklyTimesheet();
    }
}

async function loadWeeklyTimesheet() {
    // 1. Set dates headers and displaying range
    document.getElementById('week-display-range').innerText = displayWeekRange(currentWeekStart);
    
    // Clear status
    document.getElementById('timesheet-saved-status').style.display = 'none';
    
    const startStr = formatDate(currentWeekStart);
    const end = new Date(currentWeekStart);
    end.setDate(end.getDate() + 6);
    const endStr = formatDate(end);
    
    try {
        // Refresh project and activity caches
        await loadMetadata();
        
        // Fetch raw entries
        const rawEntries = await window.dbAPI.dbGetTimesheetsByDateRange(currentUser.id, startStr, endStr);
        
        // Group entries by project and activity
        const rowsMap = new Map();
        
        rawEntries.forEach(entry => {
            const key = `${entry.projectId}_${entry.activityId}_${entry.task || ''}`;
            if (!rowsMap.has(key)) {
                rowsMap.set(key, {
                    projectId: entry.projectId,
                    activityId: entry.activityId,
                    task: entry.task || '',
                    hours: [0, 0, 0, 0, 0, 0, 0],
                    description: entry.description || ''
                });
            }
            
            // Calculate day offset
            const entryDate = new Date(entry.date);
            const offset = Math.round((entryDate - currentWeekStart) / 86400000);
            if (offset >= 0 && offset < 7) {
                const row = rowsMap.get(key);
                row.hours[offset] = entry.hours;
                
                // Set description if present (prioritize non-empty descriptions)
                if (entry.description && !row.description) {
                    row.description = entry.description;
                }
            }
        });
        
        currentTimesheetRows = Array.from(rowsMap.values());
        
        // If no rows exist, initialize with 1 blank row
        if (currentTimesheetRows.length === 0) {
            currentTimesheetRows.push({
                projectId: '',
                activityId: '',
                task: '',
                hours: [0, 0, 0, 0, 0, 0, 0],
                description: ''
            });
        }
        
        renderTimesheetGrid();
    } catch (e) {
        showToast('Veriler yüklenirken bir hata oluştu: ' + e.message, 'danger');
    }
}

function renderTimesheetGrid() {
    const container = document.getElementById('timesheet-rows-container');
    container.innerHTML = '';
    
    const activeProjects = allProjects.filter(p => p.isActive);
    const activeActivities = allActivities.filter(a => a.isActive);
    
    // Check if the week is locked (more than 1 week back) for regular users
    const todayMonday = getMonday(new Date());
    const limitMonday = new Date(todayMonday);
    limitMonday.setDate(limitMonday.getDate() - 7); // Monday of last week
    const isLocked = (currentUser.role !== 'admin') && (currentWeekStart < limitMonday);
    
    // Update banner
    const banner = document.getElementById('timesheet-locked-banner');
    if (banner) {
        banner.style.display = isLocked ? 'flex' : 'none';
    }
    
    // Update action buttons visibility
    const addBtn = document.querySelector('button[onclick="addNewTimesheetRow()"]');
    const saveBtn = document.querySelector('button[onclick="saveCurrentTimesheet()"]');
    if (addBtn) addBtn.style.display = isLocked ? 'none' : 'inline-flex';
    if (saveBtn) saveBtn.style.display = isLocked ? 'none' : 'inline-flex';
    
    currentTimesheetRows.forEach((row, rowIndex) => {
        const tr = document.createElement('tr');
        
        // Project Select
        const tdProj = document.createElement('td');
        tdProj.className = 'col-left';
        const selectProj = document.createElement('select');
        selectProj.disabled = isLocked;
        selectProj.onchange = (e) => { row.projectId = e.target.value; updateTimesheetTotals(); };
        
        const optDefaultProj = document.createElement('option');
        optDefaultProj.value = '';
        optDefaultProj.text = '-- Proje Seçin --';
        selectProj.appendChild(optDefaultProj);
        
        // Add row's project even if inactive (for historical records)
        let rowProjAdded = false;
        allProjects.forEach(proj => {
            if (proj.isActive || proj.id === Number(row.projectId)) {
                const opt = document.createElement('option');
                opt.value = proj.id;
                opt.text = `[${proj.code}] ${proj.name}`;
                if (proj.id === Number(row.projectId)) {
                    opt.selected = true;
                    rowProjAdded = true;
                }
                selectProj.appendChild(opt);
            }
        });
        tdProj.appendChild(selectProj);
        tr.appendChild(tdProj);
        
        // Activity Select
        const tdAct = document.createElement('td');
        tdAct.className = 'col-left';
        const selectAct = document.createElement('select');
        selectAct.disabled = isLocked;
        selectAct.onchange = (e) => { row.activityId = e.target.value; updateTimesheetTotals(); };
        
        const optDefaultAct = document.createElement('option');
        optDefaultAct.value = '';
        optDefaultAct.text = '-- Aktivite Seçin --';
        selectAct.appendChild(optDefaultAct);
        
        allActivities.forEach(act => {
            if (act.isActive || act.id === Number(row.activityId)) {
                const opt = document.createElement('option');
                opt.value = act.id;
                opt.text = act.name;
                if (act.id === Number(row.activityId)) opt.selected = true;
                selectAct.appendChild(opt);
            }
        });
        tdAct.appendChild(selectAct);
        tr.appendChild(tdAct);

        // Task Select
        const tdTask = document.createElement('td');
        tdTask.className = 'col-left';
        const selectTask = document.createElement('select');
        selectTask.disabled = isLocked;
        selectTask.onchange = (e) => { row.task = e.target.value; updateTimesheetTotals(); };
        
        const optDefaultTask = document.createElement('option');
        optDefaultTask.value = '';
        optDefaultTask.text = '-- Görev Seçin --';
        selectTask.appendChild(optDefaultTask);
        
        const tasksList = [
            '100 - Saha Montaj Personeli / Saha Kurulum Teknisyeni',
            '200 - Saha Süpervizörü / Saha Şefi',
            '300 - Proje Müdürü / Proje Yöneticisi',
            '400 - Mühendislik',
            '500 - Teknik Çizim',
            '800 - Kalite Kontrol',
            '850 - Test ve Devreye Alma'
        ];
        
        tasksList.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.text = t;
            if (t === row.task) opt.selected = true;
            selectTask.appendChild(opt);
        });
        tdTask.appendChild(selectTask);
        tr.appendChild(tdTask);
        
        // 7 Days inputs (Mon-Sun)
        row.hours.forEach((h, dayIndex) => {
            const tdDay = document.createElement('td');
            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.max = '24';
            input.step = '0.5';
            input.value = h > 0 ? h : '';
            input.placeholder = '-';
            input.disabled = isLocked;
            
            input.oninput = (e) => {
                let val = parseFloat(e.target.value);
                if (isNaN(val) || val < 0) val = 0;
                if (val > 24) {
                    val = 24;
                    e.target.value = 24;
                }
                row.hours[dayIndex] = val;
                updateTimesheetTotals();
            };
            
            tdDay.appendChild(input);
            tr.appendChild(tdDay);
        });
        
        // Description input
        const tdDesc = document.createElement('td');
        const inputDesc = document.createElement('input');
        inputDesc.type = 'text';
        inputDesc.className = 'input-control';
        inputDesc.style.padding = '8px';
        inputDesc.style.fontSize = '0.85rem';
        inputDesc.value = row.description || '';
        inputDesc.placeholder = 'Açıklama girin...';
        inputDesc.disabled = isLocked;
        inputDesc.oninput = (e) => {
            row.description = e.target.value;
        };
        tdDesc.appendChild(inputDesc);
        tr.appendChild(tdDesc);
        
        // Row Total Cell
        const tdTotal = document.createElement('td');
        tdTotal.className = 'total-cell';
        tdTotal.id = `row-total-${rowIndex}`;
        tdTotal.innerText = '0';
        tr.appendChild(tdTotal);
        
        // Action Delete Cell
        const tdDel = document.createElement('td');
        const btnDel = document.createElement('button');
        btnDel.className = 'delete-row-btn';
        btnDel.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        btnDel.title = 'Satırı Sil';
        btnDel.onclick = () => deleteTimesheetRow(rowIndex);
        if (isLocked) {
            btnDel.style.display = 'none';
        }
        tdDel.appendChild(btnDel);
        tr.appendChild(tdDel);
        
        container.appendChild(tr);
    });
    
    updateTimesheetTotals();
}

function addNewTimesheetRow() {
    currentTimesheetRows.push({
        projectId: '',
        activityId: '',
        task: '',
        hours: [0, 0, 0, 0, 0, 0, 0],
        description: ''
    });
    renderTimesheetGrid();
}

function deleteTimesheetRow(index) {
    currentTimesheetRows.splice(index, 1);
    if (currentTimesheetRows.length === 0) {
        currentTimesheetRows.push({
            projectId: '',
            activityId: '',
            task: '',
            hours: [0, 0, 0, 0, 0, 0, 0],
            description: ''
        });
    }
    renderTimesheetGrid();
}

function updateTimesheetTotals() {
    let dayTotals = [0, 0, 0, 0, 0, 0, 0];
    let grandTotal = 0;
    
    currentTimesheetRows.forEach((row, rowIndex) => {
        let rowSum = 0;
        row.hours.forEach((h, dayIndex) => {
            rowSum += h;
            dayTotals[dayIndex] += h;
        });
        
        // Update Row Total in UI
        const rowTotalCell = document.getElementById(`row-total-${rowIndex}`);
        if (rowTotalCell) {
            rowTotalCell.innerText = rowSum > 0 ? rowSum.toFixed(1) : '0';
        }
        grandTotal += rowSum;
    });
    
    // Update Col Totals in UI
    const dayIds = ['total-mon', 'total-tue', 'total-wed', 'total-thu', 'total-fri', 'total-sat', 'total-sun'];
    dayTotals.forEach((sum, dayIndex) => {
        const cell = document.getElementById(dayIds[dayIndex]);
        if (cell) cell.innerText = sum > 0 ? sum.toFixed(1) : '0';
    });
    
    // Update Grand Total
    const grandCell = document.getElementById('total-weekly');
    if (grandCell) grandCell.innerText = grandTotal > 0 ? grandTotal.toFixed(1) : '0';
}

async function saveCurrentTimesheet() {
    // Check lock permission first (1 week back limit for regular users)
    if (currentUser.role !== 'admin') {
        const todayMonday = getMonday(new Date());
        const limitMonday = new Date(todayMonday);
        limitMonday.setDate(limitMonday.getDate() - 7);
        if (currentWeekStart < limitMonday) {
            showToast('Hata: Geçmişe dönük 1 haftadan daha eski kayıtları düzenleme yetkiniz yoktur.', 'danger');
            return;
        }
    }

    // 1. Validation
    let hasEmptyProjectActivity = false;
    let hasDuplicateRows = new Set();
    const entriesToSave = [];
    
    for (let i = 0; i < currentTimesheetRows.length; i++) {
        const row = currentTimesheetRows[i];
        const rowSum = row.hours.reduce((a, b) => a + b, 0);
        
        if (rowSum > 0) {
            if (!row.projectId || !row.activityId || !row.task) {
                hasEmptyProjectActivity = true;
                break;
            }
            
            const dupKey = `${row.projectId}_${row.activityId}_${row.task}`;
            if (hasDuplicateRows.has(dupKey)) {
                showToast('Hata: Aynı Proje, Aktivite ve Görev kombinasyonuna sahip birden fazla satır var. Lütfen birleştirin.', 'danger');
                return;
            }
            hasDuplicateRows.add(dupKey);
            
            // Build individual daily entries
            row.hours.forEach((h, dayIndex) => {
                if (h > 0) {
                    const dateObj = new Date(currentWeekStart);
                    dateObj.setDate(dateObj.getDate() + dayIndex);
                    
                    entriesToSave.push({
                        date: formatDate(dateObj),
                        projectId: row.projectId,
                        activityId: row.activityId,
                        task: row.task,
                        hours: h,
                        description: row.description
                    });
                }
            });
        }
    }
    
    if (hasEmptyProjectActivity) {
        showToast('Lütfen saat girilmiş satırlarda Proje, Aktivite ve Görev seçimlerini yapın.', 'danger');
        return;
    }
    
    // Calculate boundaries
    const startDateStr = formatDate(currentWeekStart);
    const endDate = new Date(currentWeekStart);
    endDate.setDate(endDate.getDate() + 6);
    const endDateStr = formatDate(endDate);
    
    try {
        await window.dbAPI.dbSaveTimesheetEntries(currentUser.id, startDateStr, endDateStr, entriesToSave);
        showToast('Mesai kayıtları başarıyla kaydedildi.', 'success');
        document.getElementById('timesheet-saved-status').style.display = 'inline-block';
        
        // Reload in case zero-hour rows need to clean up
        loadWeeklyTimesheet();
    } catch (e) {
        showToast('Kaydetme hatası: ' + e.message, 'danger');
    }
}

// --- REPORTS & FILTERING ---
let currentFilteredTimesheets = []; // In-memory container for current filtered report list

async function loadReportFilters() {
    try {
        const userFilter = document.getElementById('filter-user');
        const projFilter = document.getElementById('filter-project');
        const actFilter = document.getElementById('filter-activity');
        
        // 1. Populate Users Filter (Admins only)
        if (currentUser.role === 'admin' && userFilter) {
            userFilter.innerHTML = '<option value="all">Tüm Personeller</option>';
            const users = await window.dbAPI.dbGetAllUsers();
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.text = u.name;
                userFilter.appendChild(opt);
            });
        }
        
        // 2. Populate Projects Filter
        if (projFilter) {
            projFilter.innerHTML = '<option value="all">Tüm Projeler</option>';
            const projects = await window.dbAPI.dbGetAllProjects();
            projects.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.text = `[${p.code}] ${p.name}`;
                projFilter.appendChild(opt);
            });
        }
        
        // 3. Populate Activities Filter
        if (actFilter) {
            actFilter.innerHTML = '<option value="all">Tüm Aktiviteler</option>';
            const activities = await window.dbAPI.dbGetAllActivities();
            activities.forEach(a => {
                const opt = document.createElement('option');
                opt.value = a.id;
                opt.text = a.name;
                actFilter.appendChild(opt);
            });
        }
    } catch (e) {
        console.error('Error loading report filters:', e);
    }
}

async function runReport() {
    try {
        const userFilterVal = document.getElementById('filter-user')?.value || 'all';
        const projFilterVal = document.getElementById('filter-project').value;
        const actFilterVal = document.getElementById('filter-activity').value;
        const taskFilterVal = document.getElementById('filter-task').value;
        const yearFilterVal = document.getElementById('filter-year').value;
        const monthFilterVal = document.getElementById('filter-month').value;
        
        // 1. Get raw source list based on permissions
        let list = [];
        if (currentUser.role === 'admin') {
            if (userFilterVal === 'all') {
                list = await window.dbAPI.dbGetAllTimesheets();
            } else {
                list = await window.dbAPI.dbGetTimesheetsForUser(Number(userFilterVal));
            }
        } else {
            list = await window.dbAPI.dbGetTimesheetsForUser(currentUser.id);
        }
        
        // 2. Apply Javascript filters
        list = list.filter(entry => {
            const entryDate = new Date(entry.date);
            const entryYear = entryDate.getFullYear();
            const entryMonth = entryDate.getMonth() + 1; // 1-indexed
            
            // Year filter
            if (String(entryYear) !== yearFilterVal) return false;
            
            // Month filter
            if (monthFilterVal !== 'all' && String(entryMonth) !== monthFilterVal) return false;
            
            // Project filter
            if (projFilterVal !== 'all' && String(entry.projectId) !== projFilterVal) return false;
            
            // Activity filter
            if (actFilterVal !== 'all' && String(entry.activityId) !== actFilterVal) return false;

            // Task filter
            if (taskFilterVal !== 'all' && entry.task !== taskFilterVal) return false;
            
            return true;
        });
        
        currentFilteredTimesheets = list;
        
        // 3. Gather reference objects for easy joining
        const usersList = await window.dbAPI.dbGetAllUsers();
        const usersMap = new Map(usersList.map(u => [u.id, u]));
        const projsMap = new Map(allProjects.map(p => [p.id, p]));
        const actsMap = new Map(allActivities.map(a => [a.id, a]));
        
        // 4. Compute statistics
        let totalHours = 0;
        const distinctProjects = new Set();
        const distinctWeeks = new Set();
        
        const projectHours = {};
        const activityHours = {};
        const taskHours = {};
        
        list.forEach(entry => {
            totalHours += entry.hours;
            distinctProjects.add(entry.projectId);
            
            // Group by calendar week for average
            const d = new Date(entry.date);
            const monday = getMonday(d);
            distinctWeeks.add(formatDate(monday));
            
            // Project breakdown aggregation
            projectHours[entry.projectId] = (projectHours[entry.projectId] || 0) + entry.hours;
            
            // Activity breakdown aggregation
            activityHours[entry.activityId] = (activityHours[entry.activityId] || 0) + entry.hours;

            // Task breakdown aggregation
            if (entry.task) {
                taskHours[entry.task] = (taskHours[entry.task] || 0) + entry.hours;
            }
        });
        
        // Set stats UI elements
        document.getElementById('stat-total-hours').innerText = totalHours.toFixed(1);
        document.getElementById('stat-active-projects').innerText = distinctProjects.size;
        
        const weekCount = distinctWeeks.size || 1;
        const avgWeekly = totalHours / weekCount;
        document.getElementById('stat-avg-weekly').innerText = avgWeekly.toFixed(1);
        
        // 5. Render charts
        renderChartBreakdown('project-chart', projectHours, projsMap, totalHours);
        renderChartBreakdown('activity-chart', activityHours, actsMap, totalHours);
        renderChartBreakdown('task-chart', taskHours, null, totalHours);
        
        // 6. Render Details Logs Table
        const tbody = document.getElementById('report-table-body');
        tbody.innerHTML = '';
        
        // Sort by date descending
        list.sort((a, b) => b.date.localeCompare(a.date));
        
        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${currentUser.role === 'admin' ? 7 : 6}" style="text-align:center;" class="text-muted">Filtrelere uygun kayıt bulunamadı.</td></tr>`;
            return;
        }
        
        list.forEach(entry => {
            const tr = document.createElement('tr');
            
            // Format Turkish date
            const dateObj = new Date(entry.date);
            const dateStr = `${dateObj.getDate()} ${TURKISH_MONTHS[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
            
            const tdDate = document.createElement('td');
            tdDate.innerText = dateStr;
            tr.appendChild(tdDate);
            
            // Admin only user cell
            if (currentUser.role === 'admin') {
                const tdUser = document.createElement('td');
                tdUser.className = 'report-col-user';
                const userObj = usersMap.get(entry.userId);
                tdUser.innerText = userObj ? userObj.name : 'Bilinmeyen Kullanıcı';
                tr.appendChild(tdUser);
            }
            
            const tdProj = document.createElement('td');
            const projObj = projsMap.get(entry.projectId);
            tdProj.innerText = projObj ? `[${projObj.code}] ${projObj.name}` : 'Bilinmeyen Proje';
            tr.appendChild(tdProj);
            
            const tdAct = document.createElement('td');
            const actObj = actsMap.get(entry.activityId);
            tdAct.innerText = actObj ? actObj.name : 'Bilinmeyen Aktivite';
            tr.appendChild(tdAct);

            const tdTask = document.createElement('td');
            tdTask.innerText = entry.task || '-';
            tr.appendChild(tdTask);
            
            const tdHrs = document.createElement('td');
            tdHrs.style.fontWeight = '600';
            tdHrs.innerText = entry.hours.toFixed(1);
            tr.appendChild(tdHrs);
            
            const tdDesc = document.createElement('td');
            tdDesc.innerText = entry.description || '-';
            tr.appendChild(tdDesc);
            
            tbody.appendChild(tr);
        });
        
    } catch (e) {
        showToast('Rapor hesaplanırken hata oluştu: ' + e.message, 'danger');
    }
}

function renderChartBreakdown(elementId, dataset, objectMap, grandTotal) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';
    
    const sortedKeys = Object.keys(dataset).sort((a, b) => dataset[b] - dataset[a]);
    
    if (sortedKeys.length === 0) {
        container.innerHTML = '<p class="text-muted" style="text-align: center; padding: 20px;">Veri bulunamadı</p>';
        return;
    }
    
    sortedKeys.forEach(key => {
        const value = dataset[key];
        const percent = grandTotal > 0 ? (value / grandTotal) * 100 : 0;
        
        const itemObj = objectMap.get(Number(key));
        let labelText = 'Bilinmeyen';
        if (itemObj) {
            // Check if project or activity
            labelText = itemObj.code ? `[${itemObj.code}] ${itemObj.name}` : itemObj.name;
        }
        
        const row = document.createElement('div');
        row.className = 'chart-row';
        
        const label = document.createElement('div');
        label.className = 'chart-label';
        label.innerText = labelText;
        label.title = labelText;
        row.appendChild(label);
        
        const barWrapper = document.createElement('div');
        barWrapper.className = 'chart-bar-wrapper';
        
        const barFill = document.createElement('div');
        barFill.className = 'chart-bar-fill';
        // Set width with timeout to animate smoothly
        setTimeout(() => {
            barFill.style.width = `${percent}%`;
        }, 100);
        
        barWrapper.appendChild(barFill);
        row.appendChild(barWrapper);
        
        const val = document.createElement('div');
        val.className = 'chart-value';
        val.innerText = `${value.toFixed(1)} sa (${percent.toFixed(0)}%)`;
        row.appendChild(val);
        
        container.appendChild(row);
    });
}

// Export to Excel Function using SheetJS
async function exportToExcel() {
    if (currentFilteredTimesheets.length === 0) {
        showToast('Dışa aktarılacak veri yok.', 'warning');
        return;
    }
    
    // Check if XLSX library is loaded, if not load it dynamically from CDN
    if (typeof XLSX === 'undefined') {
        showToast('Excel motoru yükleniyor, lütfen bekleyin...', 'info');
        try {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error('Excel kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edin.'));
                document.head.appendChild(script);
            });
        } catch (err) {
            showToast(err.message, 'danger');
            return;
        }
    }
    
    try {
        const usersList = await window.dbAPI.dbGetAllUsers();
        const usersMap = new Map(usersList.map(u => [u.id, u]));
        const projsMap = new Map(allProjects.map(p => [p.id, p]));
        const actsMap = new Map(allActivities.map(a => [a.id, a]));
        
        const excelRows = [];
        
        currentFilteredTimesheets.forEach(entry => {
            const userObj = usersMap.get(entry.userId);
            const projObj = projsMap.get(entry.projectId);
            const actObj = actsMap.get(entry.activityId);
            
            const userName = userObj ? userObj.name : 'Bilinmeyen';
            const projCode = projObj ? projObj.code : '-';
            const projName = projObj ? projObj.name : 'Bilinmeyen';
            const actName = actObj ? actObj.name : 'Bilinmeyen';
            const taskName = entry.task || '-';
            
            if (currentUser.role === 'admin') {
                excelRows.push({
                    'Tarih': entry.date,
                    'Personel': userName,
                    'Proje Kodu': projCode,
                    'Proje Adı': projName,
                    'Aktivite': actName,
                    'Görev': taskName,
                    'Mesai (Saat)': entry.hours,
                    'Açıklama': entry.description || ''
                });
            } else {
                excelRows.push({
                    'Tarih': entry.date,
                    'Proje Kodu': projCode,
                    'Proje Adı': projName,
                    'Aktivite': actName,
                    'Görev': taskName,
                    'Mesai (Saat)': entry.hours,
                    'Açıklama': entry.description || ''
                });
            }
        });
        
        // Create workbook & worksheet
        const worksheet = XLSX.utils.json_to_sheet(excelRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Mesai Raporu');
        
        // Set column widths nicely
        const maxLen = (val) => (val ? String(val).length : 10);
        const cols = [];
        if (excelRows.length > 0) {
            const keys = Object.keys(excelRows[0]);
            keys.forEach(k => {
                let maxW = k.length;
                excelRows.forEach(row => {
                    const w = maxLen(row[k]);
                    if (w > maxW) maxW = w;
                });
                cols.push({ wch: maxW + 3 }); // add margin
            });
            worksheet['!cols'] = cols;
        }
        
        // Save file
        XLSX.writeFile(workbook, `mesai_raporu_${formatDate(new Date())}.xlsx`);
        showToast('Excel Raporu indirildi.', 'success');
    } catch (e) {
        showToast('Excel hatası: ' + e.message, 'danger');
    }
}

// --- ADMIN PANELS CODE ---

// 1. Projects Management
async function loadProjectsManagement() {
    try {
        const tbody = document.getElementById('projects-table-body');
        tbody.innerHTML = '';
        
        await loadMetadata(); // refresh list
        
        if (allProjects.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;" class="text-muted">Proje bulunmamaktadır.</td></tr>';
            return;
        }
        
        allProjects.forEach(proj => {
            const tr = document.createElement('tr');
            
            const tdCode = document.createElement('td');
            tdCode.style.fontWeight = '700';
            tdCode.innerText = proj.code;
            tr.appendChild(tdCode);
            
            const tdName = document.createElement('td');
            tdName.innerText = proj.name;
            tr.appendChild(tdName);
            
            const tdDesc = document.createElement('td');
            tdDesc.innerText = proj.description || '-';
            tr.appendChild(tdDesc);
            
            // Status Toggle Switch
            const tdStatus = document.createElement('td');
            const labelToggle = document.createElement('label');
            labelToggle.className = 'toggle-wrapper';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.display = 'none';
            checkbox.checked = proj.isActive;
            checkbox.onchange = () => toggleProjectStatus(proj, checkbox.checked);
            
            const divSwitch = document.createElement('div');
            divSwitch.className = 'toggle-switch';
            
            labelToggle.appendChild(checkbox);
            labelToggle.appendChild(divSwitch);
            
            const spanText = document.createElement('span');
            spanText.className = proj.isActive ? 'badge badge-success' : 'badge badge-danger';
            spanText.innerText = proj.isActive ? 'Aktif' : 'Pasif';
            labelToggle.appendChild(spanText);
            
            tdStatus.appendChild(labelToggle);
            tr.appendChild(tdStatus);
            
            // Action Buttons
            const tdActions = document.createElement('td');
            tdActions.style.display = 'flex';
            tdActions.style.gap = '8px';
            
            const btnEdit = document.createElement('button');
            btnEdit.className = 'btn btn-secondary';
            btnEdit.style.padding = '6px 12px';
            btnEdit.style.fontSize = '0.8rem';
            btnEdit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Düzenle';
            btnEdit.onclick = () => openEditModal('project', proj);
            tdActions.appendChild(btnEdit);

            const btnDel = document.createElement('button');
            btnDel.className = 'btn btn-danger';
            btnDel.style.padding = '6px 12px';
            btnDel.style.fontSize = '0.8rem';
            btnDel.innerHTML = '<i class="fa-solid fa-trash-can"></i> Sil';
            btnDel.onclick = () => handleDeleteProject(proj.id);
            tdActions.appendChild(btnDel);
            
            tr.appendChild(tdActions);
            
            tbody.appendChild(tr);
        });
    } catch (e) {
        showToast('Projeler yüklenirken hata oluştu: ' + e.message, 'danger');
    }
}

async function handleAddProject(event) {
    event.preventDefault();
    const code = document.getElementById('project-code').value.trim();
    const name = document.getElementById('project-name').value.trim();
    const description = document.getElementById('project-desc').value.trim();
    
    try {
        await window.dbAPI.dbAddProject({ code, name, description, isActive: true });
        showToast('Proje başarıyla eklendi.', 'success');
        
        // Reset Inputs
        document.getElementById('project-code').value = '';
        document.getElementById('project-name').value = '';
        document.getElementById('project-desc').value = '';
        
        loadProjectsManagement();
    } catch (e) {
        showToast('Proje eklenemedi: ' + e.message, 'danger');
    }
}

async function toggleProjectStatus(proj, isActive) {
    try {
        proj.isActive = isActive;
        await window.dbAPI.dbUpdateProject(proj);
        showToast(`Proje ${isActive ? 'aktif' : 'pasif'} duruma getirildi.`, 'success');
        loadProjectsManagement();
    } catch (e) {
        showToast('Durum güncellenemedi: ' + e.message, 'danger');
    }
}

async function handleDeleteProject(id) {
    if (!confirm('Bu projeyi silmek istediğinize emin misiniz?')) return;
    try {
        await window.dbAPI.dbDeleteProject(id);
        showToast('Proje silindi.', 'success');
        loadProjectsManagement();
    } catch (e) {
        showToast('Silme hatası: ' + e.message, 'danger');
    }
}

// 2. Activities Management
async function loadActivitiesManagement() {
    try {
        const tbody = document.getElementById('activities-table-body');
        tbody.innerHTML = '';
        
        await loadMetadata(); // refresh list
        
        if (allActivities.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;" class="text-muted">Aktivite bulunmamaktadır.</td></tr>';
            return;
        }
        
        allActivities.forEach(act => {
            const tr = document.createElement('tr');
            
            const tdName = document.createElement('td');
            tdName.style.fontWeight = '600';
            tdName.innerText = act.name;
            tr.appendChild(tdName);
            
            const tdDesc = document.createElement('td');
            tdDesc.innerText = act.description || '-';
            tr.appendChild(tdDesc);
            
            // Status Toggle Switch
            const tdStatus = document.createElement('td');
            const labelToggle = document.createElement('label');
            labelToggle.className = 'toggle-wrapper';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.display = 'none';
            checkbox.checked = act.isActive;
            checkbox.onchange = () => toggleActivityStatus(act, checkbox.checked);
            
            const divSwitch = document.createElement('div');
            divSwitch.className = 'toggle-switch';
            
            labelToggle.appendChild(checkbox);
            labelToggle.appendChild(divSwitch);
            
            const spanText = document.createElement('span');
            spanText.className = act.isActive ? 'badge badge-success' : 'badge badge-danger';
            spanText.innerText = act.isActive ? 'Aktif' : 'Pasif';
            labelToggle.appendChild(spanText);
            
            tdStatus.appendChild(labelToggle);
            tr.appendChild(tdStatus);
            
            // Action Buttons
            const tdActions = document.createElement('td');
            tdActions.style.display = 'flex';
            tdActions.style.gap = '8px';
            
            const btnEdit = document.createElement('button');
            btnEdit.className = 'btn btn-secondary';
            btnEdit.style.padding = '6px 12px';
            btnEdit.style.fontSize = '0.8rem';
            btnEdit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Düzenle';
            btnEdit.onclick = () => openEditModal('activity', act);
            tdActions.appendChild(btnEdit);

            const btnDel = document.createElement('button');
            btnDel.className = 'btn btn-danger';
            btnDel.style.padding = '6px 12px';
            btnDel.style.fontSize = '0.8rem';
            btnDel.innerHTML = '<i class="fa-solid fa-trash-can"></i> Sil';
            btnDel.onclick = () => handleDeleteActivity(act.id);
            tdActions.appendChild(btnDel);
            
            tr.appendChild(tdActions);
            
            tbody.appendChild(tr);
        });
    } catch (e) {
        showToast('Aktiviteler yüklenirken hata oluştu: ' + e.message, 'danger');
    }
}

async function handleAddActivity(event) {
    event.preventDefault();
    const name = document.getElementById('activity-name').value.trim();
    const description = document.getElementById('activity-desc').value.trim();
    
    try {
        await window.dbAPI.dbAddActivity({ name, description, isActive: true });
        showToast('Aktivite başarıyla eklendi.', 'success');
        
        document.getElementById('activity-name').value = '';
        document.getElementById('activity-desc').value = '';
        
        loadActivitiesManagement();
    } catch (e) {
        showToast('Aktivite eklenemedi: ' + e.message, 'danger');
    }
}

async function toggleActivityStatus(act, isActive) {
    try {
        act.isActive = isActive;
        await window.dbAPI.dbUpdateActivity(act);
        showToast(`Aktivite ${isActive ? 'aktif' : 'pasif'} duruma getirildi.`, 'success');
        loadActivitiesManagement();
    } catch (e) {
        showToast('Durum güncellenemedi: ' + e.message, 'danger');
    }
}

async function handleDeleteActivity(id) {
    if (!confirm('Bu aktiviteyi silmek istediğinize emin misiniz?')) return;
    try {
        await window.dbAPI.dbDeleteActivity(id);
        showToast('Aktivite silindi.', 'success');
        loadActivitiesManagement();
    } catch (e) {
        showToast('Silme hatası: ' + e.message, 'danger');
    }
}

// 3. Users Management
async function loadUsersManagement() {
    try {
        const tbody = document.getElementById('users-table-body');
        tbody.innerHTML = '';
        
        const users = await window.dbAPI.dbGetAllUsers();
        
        users.forEach(u => {
            const tr = document.createElement('tr');
            
            const tdId = document.createElement('td');
            tdId.innerText = u.id;
            tr.appendChild(tdId);
            
            const tdName = document.createElement('td');
            tdName.style.fontWeight = '600';
            tdName.innerText = u.name;
            tr.appendChild(tdName);
            
            const tdUser = document.createElement('td');
            tdUser.innerText = u.username;
            tr.appendChild(tdUser);
            
            const tdTitle = document.createElement('td');
            tdTitle.innerText = u.title || '-';
            tr.appendChild(tdTitle);
            
            const tdRole = document.createElement('td');
            const spanRole = document.createElement('span');
            spanRole.className = u.role === 'admin' ? 'badge badge-success' : 'badge badge-secondary';
            spanRole.style.background = u.role === 'admin' ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.05)';
            spanRole.style.color = u.role === 'admin' ? 'var(--primary)' : 'var(--text-secondary)';
            spanRole.innerText = u.role === 'admin' ? 'Yönetici' : 'Personel';
            tdRole.appendChild(spanRole);
            tr.appendChild(tdRole);
            
            // Status Toggle Switch
            const tdStatus = document.createElement('td');
            const labelToggle = document.createElement('label');
            labelToggle.className = 'toggle-wrapper';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.style.display = 'none';
            checkbox.checked = u.isActive !== false;
            if (u.id === currentUser.id) {
                checkbox.disabled = true;
            }
            checkbox.onchange = () => toggleUserStatus(u, checkbox.checked);
            
            const divSwitch = document.createElement('div');
            divSwitch.className = 'toggle-switch';
            
            labelToggle.appendChild(checkbox);
            labelToggle.appendChild(divSwitch);
            
            const spanText = document.createElement('span');
            spanText.className = (u.isActive !== false) ? 'badge badge-success' : 'badge badge-danger';
            spanText.innerText = (u.isActive !== false) ? 'Aktif' : 'Pasif';
            labelToggle.appendChild(spanText);
            
            tdStatus.appendChild(labelToggle);
            tr.appendChild(tdStatus);
            
            // Action Buttons
            const tdActions = document.createElement('td');
            tdActions.style.display = 'flex';
            tdActions.style.gap = '8px';
            
            const btnEdit = document.createElement('button');
            btnEdit.className = 'btn btn-secondary';
            btnEdit.style.padding = '6px 12px';
            btnEdit.style.fontSize = '0.8rem';
            btnEdit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Düzenle';
            btnEdit.onclick = () => openEditModal('user', u);
            tdActions.appendChild(btnEdit);
            
            if (u.id !== currentUser.id) {
                const btnDel = document.createElement('button');
                btnDel.className = 'btn btn-danger';
                btnDel.style.padding = '6px 12px';
                btnDel.style.fontSize = '0.8rem';
                btnDel.innerHTML = '<i class="fa-solid fa-trash-can"></i> Sil';
                btnDel.onclick = () => handleDeleteUser(u.id);
                tdActions.appendChild(btnDel);
            }
            tr.appendChild(tdActions);
            
            tbody.appendChild(tr);
        });
    } catch (e) {
        showToast('Kullanıcılar yüklenirken hata oluştu: ' + e.message, 'danger');
    }
}

// --- INTERACTIVE ORG CHART LOGIC ---
async function loadOrgChart() {
    const rootContainer = document.getElementById('org-tree-root');
    if (!rootContainer) return;
    rootContainer.innerHTML = '';
    
    // Setup container as drop-to-root zone
    const container = document.querySelector('.org-chart-container');
    if (container) {
        container.removeEventListener('dragover', handleContainerDragOver);
        container.removeEventListener('drop', handleContainerDrop);
        container.addEventListener('dragover', handleContainerDragOver);
        container.addEventListener('drop', handleContainerDrop);
    }
    
    try {
        const users = await window.dbAPI.dbGetAllUsers();
        // Filter out admin and inactive (passive) users
        const orgUsers = users.filter(u => u.username !== 'admin' && u.isActive !== false);
        const usersMap = new Map(orgUsers.map(u => [u.username, u]));
        
        // Build child map
        const childMap = new Map();
        orgUsers.forEach(u => {
            const reportsTo = u.reportsTo || '';
            if (reportsTo) {
                if (!childMap.has(reportsTo)) {
                    childMap.set(reportsTo, []);
                }
                childMap.get(reportsTo).push(u);
            }
        });
        
        // Sort children alphabetically by name
        childMap.forEach((list) => {
            list.sort((a, b) => a.name.localeCompare(b.name));
        });
        
        // Find roots (users whose reportsTo is empty or whose manager doesn't exist in usersMap)
        const roots = orgUsers.filter(u => {
            const reportsTo = u.reportsTo || '';
            return !reportsTo || !usersMap.has(reportsTo);
        });
        roots.sort((a, b) => a.name.localeCompare(b.name));
        
        if (roots.length === 0 && orgUsers.length > 0) {
            // Backup root in case of cycle
            roots.push(orgUsers[0]);
        }
        
        roots.forEach(root => {
            rootContainer.appendChild(buildOrgNodeElement(root, orgUsers, usersMap, childMap));
        });
    } catch (e) {
        rootContainer.innerHTML = `<div style="color: var(--danger); padding: 15px;">Hiyerarşi şablonu yüklenirken hata: ${e.message}</div>`;
    }
}

function handleContainerDragOver(e) {
    e.preventDefault();
}

async function handleContainerDrop(e) {
    const container = document.querySelector('.org-chart-container');
    if (e.target !== container && !e.target.classList.contains('org-tree') && e.target.id !== 'org-tree-root') return;
    e.preventDefault();
    
    const draggedUsername = e.dataTransfer.getData('text/plain');
    if (!draggedUsername) return;
    
    try {
        const allUsers = await window.dbAPI.dbGetAllUsers();
        const draggedUser = allUsers.find(u => u.username === draggedUsername);
        if (draggedUser && draggedUser.reportsTo !== '') {
            draggedUser.reportsTo = '';
            await window.dbAPI.dbUpdateUser(draggedUser);
            showToast(`${draggedUser.name} artık bağımsız (en üst düzey) raporlama yapıyor.`, 'success');
            loadOrgChart();
        }
    } catch (err) {
        showToast('Hata: ' + err.message, 'danger');
    }
}

function buildOrgNodeElement(user, orgUsers, usersMap, childMap) {
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'org-node';
    
    const card = document.createElement('div');
    card.className = 'org-node-card';
    card.draggable = true;
    card.dataset.username = user.username;
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'org-node-name';
    
    // Add icon based on role/title
    let iconHtml = '<i class="fa-solid fa-user text-secondary"></i>';
    const title = user.title || '';
    if (title.includes('Genel Müdür')) iconHtml = '<i class="fa-solid fa-crown text-warning"></i>';
    else if (title.includes('Müdür')) iconHtml = '<i class="fa-solid fa-user-tie text-primary"></i>';
    else if (title.includes('Sorumlusu')) iconHtml = '<i class="fa-solid fa-user-shield text-info"></i>';
    else if (title.includes('Mühendis')) iconHtml = '<i class="fa-solid fa-user-gear text-success"></i>';
    
    nameDiv.innerHTML = `${iconHtml} ${user.name}`;
    
    const titleDiv = document.createElement('div');
    titleDiv.className = 'org-node-title';
    titleDiv.innerText = user.title || 'Görev Tanımlanmamış';
    
    card.appendChild(nameDiv);
    card.appendChild(titleDiv);
    
    // Setup Drag and Drop events
    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', user.username);
        card.style.opacity = '0.5';
    });
    
    card.addEventListener('dragend', (e) => {
        card.style.opacity = '1';
    });
    
    card.addEventListener('dragover', (e) => {
        e.preventDefault();
        card.classList.add('drag-over');
    });
    
    card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
    });
    
    card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        
        const draggedUsername = e.dataTransfer.getData('text/plain');
        if (!draggedUsername) return;
        if (draggedUsername === user.username) return; // cannot drop on self
        
        // Cycle check: target cannot be a descendant of the dragged node
        if (isDescendant(draggedUsername, user.username, childMap)) {
            showToast('Hata: Bir yönetici kendi astının altına bağlanamaz!', 'danger');
            return;
        }
        
        try {
            const allUsers = await window.dbAPI.dbGetAllUsers();
            const draggedUser = allUsers.find(u => u.username === draggedUsername);
            if (draggedUser) {
                draggedUser.reportsTo = user.username;
                await window.dbAPI.dbUpdateUser(draggedUser);
                showToast(`${draggedUser.name} artık ${user.name}'a rapor veriyor.`, 'success');
                loadOrgChart();
            }
        } catch (err) {
            showToast('Hata: ' + err.message, 'danger');
        }
    });
    
    nodeDiv.appendChild(card);
    
    const children = childMap.get(user.username) || [];
    if (children.length > 0) {
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'org-node-children';
        children.forEach(child => {
            childrenContainer.appendChild(buildOrgNodeElement(child, orgUsers, usersMap, childMap));
        });
        nodeDiv.appendChild(childrenContainer);
    }
    
    return nodeDiv;
}

function isDescendant(parentUsername, targetUsername, childMap) {
    const children = childMap.get(parentUsername) || [];
    for (let child of children) {
        if (child.username === targetUsername) return true;
        if (isDescendant(child.username, targetUsername, childMap)) return true;
    }
    return false;
}


async function handleDeleteUser(id) {
    if (!confirm('Bu kullanıcıyı sistemden silmek istediğinize emin misiniz?')) return;
    try {
        await window.dbAPI.dbDeleteUser(id);
        showToast('Kullanıcı başarıyla silindi.', 'success');
        loadUsersManagement();
    } catch (e) {
        showToast('Kullanıcı silinemedi: ' + e.message, 'danger');
    }
}

async function toggleUserStatus(u, isActive) {
    try {
        u.isActive = isActive;
        await window.dbAPI.dbUpdateUser(u);
        showToast(`Kullanıcı ${isActive ? 'aktif' : 'pasif'} duruma getirildi.`, 'success');
        loadUsersManagement();
    } catch (e) {
        showToast('Kullanıcı durumu güncellenemedi: ' + e.message, 'danger');
    }
}

// --- EDIT MODAL LOGIC ---
function openEditModal(type, item) {
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('modal-title');
    const idInput = document.getElementById('edit-item-id');
    const typeInput = document.getElementById('edit-item-type');
    const nameLabel = document.getElementById('edit-label-name');
    const nameInput = document.getElementById('edit-item-name');
    const descInput = document.getElementById('edit-item-desc');
    const projFields = document.getElementById('modal-project-fields');
    const userFields = document.getElementById('modal-user-fields');
    
    idInput.value = item.id;
    typeInput.value = type;
    nameInput.value = item.name || '';
    descInput.value = item.description || '';
    
    const pwdInput = document.getElementById('edit-user-password');
    if (pwdInput) pwdInput.value = '';
    
    if (type === 'project') {
        title.innerText = 'Projeyi Düzenle';
        nameLabel.innerText = 'Proje Adı';
        projFields.style.display = 'block';
        if (userFields) userFields.style.display = 'none';
        descInput.parentElement.style.display = 'block';
        document.getElementById('edit-project-code').value = item.code || '';
        document.getElementById('edit-project-code').required = true;
    } else if (type === 'activity') {
        title.innerText = 'Aktiviteyi Düzenle';
        nameLabel.innerText = 'Aktivite Adı';
        projFields.style.display = 'none';
        if (userFields) userFields.style.display = 'none';
        descInput.parentElement.style.display = 'block';
        document.getElementById('edit-project-code').required = false;
    } else if (type === 'user') {
        title.innerText = 'Kullanıcıyı Düzenle';
        nameLabel.innerText = 'Ad Soyad';
        projFields.style.display = 'none';
        if (userFields) {
            userFields.style.display = 'block';
            document.getElementById('edit-user-username').value = item.username;
            document.getElementById('edit-user-role').value = item.role;
            document.getElementById('edit-user-hire-date').value = item.hireDate || '';
            document.getElementById('edit-user-title').value = item.title || '';
            document.getElementById('edit-user-used-leaves').value = item.usedLeaveDays !== undefined ? item.usedLeaveDays : 0;
        }
        descInput.parentElement.style.display = 'none';
        document.getElementById('edit-project-code').required = false;
    }
    
    modal.style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function handleModalSave(event) {
    event.preventDefault();
    const id = Number(document.getElementById('edit-item-id').value);
    const type = document.getElementById('edit-item-type').value;
    const name = document.getElementById('edit-item-name').value.trim();
    const description = document.getElementById('edit-item-desc').value.trim();
    
    try {
        if (type === 'project') {
            const code = document.getElementById('edit-project-code').value.trim();
            // Get original project to preserve status
            const projects = await window.dbAPI.dbGetAllProjects();
            const originalProj = projects.find(p => p.id === id);
            
            await window.dbAPI.dbUpdateProject({
                id,
                code,
                name,
                description,
                isActive: originalProj ? originalProj.isActive : true
            });
            showToast('Proje başarıyla güncellendi.', 'success');
            loadProjectsManagement();
        } else if (type === 'activity') {
            const activities = await window.dbAPI.dbGetAllActivities();
            const originalAct = activities.find(a => a.id === id);
            
            await window.dbAPI.dbUpdateActivity({
                id,
                name,
                description,
                isActive: originalAct ? originalAct.isActive : true
            });
            showToast('Aktivite başarıyla güncellendi.', 'success');
            loadActivitiesManagement();
        } else if (type === 'user') {
            const users = await window.dbAPI.dbGetAllUsers();
            const originalUser = users.find(u => u.id === id);
            
            if (originalUser) {
                const role = document.getElementById('edit-user-role').value;
                const newPassword = document.getElementById('edit-user-password').value;
                const hireDate = document.getElementById('edit-user-hire-date').value;
                const userTitle = document.getElementById('edit-user-title').value.trim();
                const usedLeaves = Number(document.getElementById('edit-user-used-leaves').value) || 0;
                
                const updatedUser = {
                    ...originalUser,
                    name,
                    role,
                    hireDate,
                    title: userTitle,
                    usedLeaveDays: usedLeaves
                };
                
                if (newPassword) {
                    updatedUser.passwordHash = await window.authAPI.hashPassword(newPassword);
                }
                
                await window.dbAPI.dbUpdateUser(updatedUser);
                showToast('Kullanıcı başarıyla güncellendi.', 'success');
                
                // If editing self, refresh active session
                if (id === currentUser.id) {
                    currentUser.name = name;
                    currentUser.role = role;
                    sessionStorage.setItem('timesheet_session', JSON.stringify(currentUser));
                    showSystemDashboard();
                }
                
                loadUsersManagement();
            }
        }
        closeEditModal();
    } catch (e) {
        showToast('Güncelleme hatası: ' + e.message, 'danger');
    }
}

async function handleAdminAddUser(event) {
    event.preventDefault();
    const nameVal = document.getElementById('admin-user-name').value;
    const userVal = document.getElementById('admin-user-username').value;
    const passVal = document.getElementById('admin-user-password').value;
    const roleVal = document.getElementById('admin-user-role').value;
    const hireDateVal = document.getElementById('admin-user-hire-date').value;
    const titleVal = document.getElementById('admin-user-title').value.trim();
    
    try {
        await window.authAPI.register(userVal, passVal, nameVal, roleVal, hireDateVal, true, titleVal);
        showToast('Kullanıcı başarıyla oluşturuldu.', 'success');
        
        // Reset inputs
        document.getElementById('admin-user-name').value = '';
        document.getElementById('admin-user-username').value = '';
        document.getElementById('admin-user-password').value = '';
        document.getElementById('admin-user-hire-date').value = '';
        document.getElementById('admin-user-title').value = '';
        document.getElementById('admin-user-role').value = 'user';
        
        // Reload users list
        loadUsersManagement();
    } catch (e) {
        showToast('Kullanıcı oluşturulamadı: ' + e.message, 'danger');
    }
}

// Bind navigation global methods
window.switchSection = switchSection;
window.changeWeek = changeWeek;
window.addNewTimesheetRow = addNewTimesheetRow;
window.saveCurrentTimesheet = saveCurrentTimesheet;
window.runReport = runReport;
window.exportToExcel = exportToExcel;
window.handleAddProject = handleAddProject;
window.handleAddActivity = handleAddActivity;
window.handleLogin = handleLogin;
window.handleRegister = handleRegister;
window.handleLogout = handleLogout;
window.showRegisterScreen = showRegisterScreen;
window.showLoginScreen = showLoginScreen;
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.handleModalSave = handleModalSave;
window.handleAdminAddUser = handleAdminAddUser;
window.toggleUserStatus = toggleUserStatus;

async function runMigration() {
    if (!window.migrationData) return;
    if (localStorage.getItem('migration_done_2025_2026') === 'true') return;
    
    console.log('Starting migration of ' + window.migrationData.length + ' rows...');
    showToast('Geçmiş mesai verileri içe aktarılıyor. Lütfen bekleyin...', 'warning');
    
    try {
        const users = await window.dbAPI.dbGetAllUsers();
        const projects = await window.dbAPI.dbGetAllProjects();
        const activities = await window.dbAPI.dbGetAllActivities();
        
        const userMap = new Map(users.map(u => [u.username, u]));
        const projectMap = new Map(projects.map(p => [p.code, p]));
        const activityMap = new Map(activities.map(a => {
            const parts = a.name.split(' - ');
            const code = parts[0];
            return [code, a];
        }));
        
        const initialsToUsername = {
            'BS': 'busrasubasi',
            'UU': 'uguruzun',
            'CÇ': 'cemalcelik',
            'KP': 'kurtuluspolat',
            'BP': 'bekirpolat',
            'MA': 'mervealcan',
            'RP': 'rabiapala',
            'SA': 'siracarapoglu',
            'OS': 'olgusen',
            'OŞ': 'olgusen',
            'MY': 'muratyarici',
            'UK': 'ulaskose',
            'YK': 'yaprakkoc',
            'EA': 'emrealbayrak',
            'AG': 'ahmetgunes',
            'HEÖ': 'halilerenozudogru',
            'VYÇ': 'volkanyavuzcancetin',
            'BŞ': 'batuhanseker',
            'HT': 'hasantonak',
            'SH': 'sezinhekimoglu'
        };
        
        const functionCodeToTask = {
            '100': '100 - Saha Montaj Personeli / Saha Kurulum Teknisyeni',
            '200': '200 - Saha Süpervizörü / Saha Şefi',
            '300': '300 - Proje Müdürü / Proje Yöneticisi',
            '400': '400 - Mühendislik',
            '500': '500 - Teknik Çizim',
            '800': '800 - Kalite Kontrol',
            '850': '850 - Test ve Devreye Alma'
        };
        
        const getMondayOfWeek = (year, week) => {
            const d = new Date(year, 0, 4);
            const day = d.getDay();
            const monday = new Date(d.getTime() - ((day === 0 ? 7 : day) - 1) * 24 * 60 * 60 * 1000);
            return new Date(monday.getTime() + (week - 1) * 7 * 24 * 60 * 60 * 1000);
        };
        
        const formatDateStr = (date) => {
            const y = date.getFullYear();
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        };
        
        const entriesToAdd = [];
        
        for (const row of window.migrationData) {
            let username = initialsToUsername[row.name.toUpperCase()];
            let userObj = null;
            
            if (username) {
                userObj = userMap.get(username);
            }
            
            if (!userObj) {
                const placeholderUsername = row.name.toLowerCase();
                userObj = userMap.get(placeholderUsername);
                
                if (!userObj) {
                    const newUser = {
                        username: placeholderUsername,
                        passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
                        name: `${row.name} (Geçmiş Kayıt)`,
                        role: 'user'
                    };
                    const newId = await window.dbAPI.dbAddUser(newUser);
                    newUser.id = newId;
                    userMap.set(placeholderUsername, newUser);
                    userObj = newUser;
                }
            }
            
            let projObj = projectMap.get(row.project);
            if (!projObj) {
                const newProj = {
                    code: row.project,
                    name: `${row.project} (Geçmiş Proje)`,
                    description: 'Geçmiş veritabanından aktarılan proje.',
                    isActive: true
                };
                const newId = await window.dbAPI.dbAddProject(newProj);
                newProj.id = newId;
                projectMap.set(row.project, newProj);
                projObj = newProj;
            }
            
            let actObj = activityMap.get(row.activity);
            if (!actObj) {
                const newAct = {
                    name: `${row.activity} - İthal Aktivite`,
                    description: 'Geçmiş veritabanından aktarılan aktivite.',
                    isActive: true
                };
                const newId = await window.dbAPI.dbAddActivity(newAct);
                newAct.id = newId;
                activityMap.set(row.activity, newAct);
                actObj = newAct;
            }
            
            const taskStr = functionCodeToTask[row.task] || row.task || '-';
            const mondayOfWeek = getMondayOfWeek(row.year, row.week);
            
            const dailyHours = [
                { offset: 0, hrs: row.mon },
                { offset: 1, hrs: row.tue },
                { offset: 2, hrs: row.wed },
                { offset: 3, hrs: row.thr },
                { offset: 4, hrs: row.fri },
                { offset: 6, hrs: row.sun }
            ];
            
            dailyHours.forEach(dh => {
                if (dh.hrs > 0) {
                    const entryDate = new Date(mondayOfWeek);
                    entryDate.setDate(mondayOfWeek.getDate() + dh.offset);
                    
                    entriesToAdd.push({
                        userId: userObj.id,
                        date: formatDateStr(entryDate),
                        projectId: projObj.id,
                        activityId: actObj.id,
                        task: taskStr,
                        hours: dh.hrs,
                        description: 'Toplu yükleme'
                    });
                }
            });
        }
        
        const db = await window.dbAPI.getDB();
        const tx = db.transaction('timesheets', 'readwrite');
        const store = tx.objectStore('timesheets');
        
        for (const entry of entriesToAdd) {
            store.add(entry);
        }
        
        await new Promise((resolve, reject) => {
            tx.oncomplete = () => resolve();
            tx.onerror = (e) => reject(tx.error);
        });
        
        localStorage.setItem('migration_done_2025_2026', 'true');
        showToast('Geçmiş veriler (' + entriesToAdd.length + ' kayıt) başarıyla aktarıldı!', 'success');
        
        if (currentUser.role === 'admin') {
            loadProjectsManagement();
            loadUsersManagement();
        }
        loadWeeklyTimesheet();
    } catch (e) {
        console.error('Migration failed:', e);
        showToast('Veri aktarımı sırasında hata oluştu: ' + e.message, 'danger');
    }
}

// Load migration data dynamically if available
(function() {
    const script = document.createElement('script');
    script.src = 'migration_data.js';
    script.onerror = () => {
        console.log('No migration data script found, skipping migration check.');
    };
    document.head.appendChild(script);
})();

// --- LEAVE TRACKING LOGIC (BETA) ---
let currentLeavesTab = 'user'; // Default active tab

async function loadLeavesPage() {
    const userView = document.getElementById('leaves-user-view');
    const adminView = document.getElementById('leaves-admin-view');
    const tabsContainer = document.getElementById('leaves-tabs');
    
    const canManageLeaves = (currentUser.role === 'admin') || 
                            (currentUser.username === 'onurakyurt') || 
                            (currentUser.username === 'oguzcantunc') || 
                            (currentUser.username === 'hasantonak');
    
    if (canManageLeaves) {
        if (tabsContainer) tabsContainer.style.display = 'flex';
        await loadUserLeavesView();
        await loadAdminLeavesView();
        
        // Toggle reports visibility based on exact role
        const reportsContainer = document.getElementById('leaves-admin-reports');
        if (reportsContainer) {
            if (currentUser.role === 'admin' || currentUser.username === 'onurakyurt') {
                reportsContainer.style.display = 'flex';
            } else {
                reportsContainer.style.display = 'none';
            }
        }
        
        switchLeavesTab(currentLeavesTab);
    } else {
        if (tabsContainer) tabsContainer.style.display = 'none';
        userView.style.display = 'block';
        adminView.style.display = 'none';
        await loadUserLeavesView();
    }
}

function switchLeavesTab(tabType) {
    currentLeavesTab = tabType;
    const userView = document.getElementById('leaves-user-view');
    const adminView = document.getElementById('leaves-admin-view');
    const btnMyLeaves = document.getElementById('tab-btn-my-leaves');
    const btnManageLeaves = document.getElementById('tab-btn-manage-leaves');
    
    if (tabType === 'admin') {
        userView.style.display = 'none';
        adminView.style.display = 'block';
        if (btnMyLeaves) {
            btnMyLeaves.className = 'btn btn-secondary';
        }
        if (btnManageLeaves) {
            btnManageLeaves.className = 'btn btn-primary';
        }
    } else {
        userView.style.display = 'block';
        adminView.style.display = 'none';
        if (btnMyLeaves) {
            btnMyLeaves.className = 'btn btn-primary';
        }
        if (btnManageLeaves) {
            btnManageLeaves.className = 'btn btn-secondary';
        }
    }
}

async function loadUserLeavesView() {
    const tableBody = document.getElementById('user-leaves-table-body');
    tableBody.innerHTML = '';
    
    try {
        const leaves = await window.dbAPI.dbGetAllLeaves();
        const myLeaves = leaves.filter(l => l.userId === currentUser.id);
        
        myLeaves.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        
        if (myLeaves.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Henüz bir izin talebiniz bulunmuyor.</td></tr>';
            return;
        }
        
        myLeaves.forEach(leave => {
            const tr = document.createElement('tr');
            
            let badgeClass = 'badge-warning';
            let statusText = 'Beklemede';
            if (leave.status === 'Approved') {
                badgeClass = 'badge-success';
                statusText = 'Onaylandı';
            } else if (leave.status === 'Rejected') {
                badgeClass = 'badge-danger';
                statusText = 'Reddedildi';
            }
            
            tr.innerHTML = `
                <td><strong>${leave.leaveType}</strong></td>
                <td>${leave.startDate}</td>
                <td>${leave.endDate}</td>
                <td>${leave.description || '-'}</td>
                <td><span class="badge ${badgeClass}">${statusText}</span></td>
                <td>
                    ${leave.status === 'Pending' ? `<button class="btn btn-secondary btn-sm" onclick="handleCancelLeaveRequest(${leave.id})" style="padding: 4px 8px; font-size: 0.75rem;">İptal Et</button>` : '-'}
                </td>
            `;
            
            tableBody.appendChild(tr);
        });
    } catch (e) {
        showToast('İzin kayıtları yüklenirken hata oluştu: ' + e.message, 'danger');
    }
}

function calculateEarnedLeaveDays(startDateStr) {
    if (!startDateStr) return 0;
    const startDate = new Date(startDateStr);
    const today = new Date();
    
    let earned = 0;
    let anniversary = new Date(startDate);
    
    let yearsOfService = 1;
    while (true) {
        anniversary.setFullYear(startDate.getFullYear() + yearsOfService);
        if (anniversary > today) {
            break;
        }
        
        if (yearsOfService >= 6) {
            earned += 20;
        } else {
            earned += 14;
        }
        yearsOfService++;
    }
    return earned;
}

async function loadAdminLeavesView() {
    const pendingBody = document.getElementById('admin-pending-leaves-table-body');
    const allBody = document.getElementById('admin-all-leaves-table-body');
    
    pendingBody.innerHTML = '';
    allBody.innerHTML = '';
    
    try {
        const leaves = await window.dbAPI.dbGetAllLeaves();
        const users = await window.dbAPI.dbGetAllUsers();
        const usersMap = new Map(users.map(u => [u.id, u]));
        
        // Filter pending approvals: regular managers only see their turn, admin sees all
        const pendingLeaves = leaves.filter(l => {
            if (l.status !== 'Pending') return false;
            if (currentUser.role === 'admin') return true;
            return l.pendingApprover === currentUser.username;
        });
        pendingLeaves.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        
        if (pendingLeaves.length === 0) {
            pendingBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Bekleyen onay talebi bulunmuyor.</td></tr>';
        } else {
            pendingLeaves.forEach(leave => {
                const userObj = usersMap.get(leave.userId);
                const userName = userObj ? userObj.name : 'Bilinmeyen Personel';
                const userTitleText = userObj && userObj.title ? ` <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">(${userObj.title})</span>` : '';
                
                let stageText = '';
                if (leave.pendingApprover === 'onurakyurt') {
                    stageText = ' <span class="badge badge-warning" style="font-size: 0.7rem; padding: 2px 6px;">2. Aşama (Son Onay)</span>';
                } else {
                    stageText = ' <span class="badge badge-secondary" style="font-size: 0.7rem; padding: 2px 6px; background: rgba(255,255,255,0.05); color: var(--text-secondary);">1. Aşama Onayı</span>';
                }
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${userName}</strong>${userTitleText}</td>
                    <td><strong>${leave.leaveType}</strong>${stageText}</td>
                    <td>${leave.startDate}</td>
                    <td>${leave.endDate}</td>
                    <td>${leave.description || '-'}</td>
                    <td>
                        <div style="display: flex; gap: 8px;">
                            <button class="btn btn-success btn-sm" onclick="handleApproveLeave(${leave.id})" style="padding: 4px 8px; font-size: 0.75rem; background: var(--success); border-color: var(--success); color: white;">Onayla</button>
                            <button class="btn btn-danger btn-sm" onclick="handleRejectLeave(${leave.id})" style="padding: 4px 8px; font-size: 0.75rem; background: var(--danger); border-color: var(--danger); color: white;">Reddet</button>
                        </div>
                    </td>
                `;
                pendingBody.appendChild(tr);
            });
        }
        
        const allLeaves = [...leaves];
        allLeaves.sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
        
        if (allLeaves.length === 0) {
            allBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">İzin kaydı bulunmuyor.</td></tr>';
        } else {
            allLeaves.forEach(leave => {
                const userObj = usersMap.get(leave.userId);
                const userName = userObj ? userObj.name : 'Bilinmeyen Personel';
                
                let badgeClass = 'badge-warning';
                let statusText = 'Beklemede';
                if (leave.status === 'Approved') {
                    badgeClass = 'badge-success';
                    statusText = 'Onaylandı';
                } else if (leave.status === 'Rejected') {
                    badgeClass = 'badge-danger';
                    statusText = 'Reddedildi';
                }
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><strong>${userName}</strong></td>
                    <td>${leave.leaveType}</td>
                    <td>${leave.startDate}</td>
                    <td>${leave.endDate}</td>
                    <td><span class="badge ${badgeClass}">${statusText}</span></td>
                    <td>${leave.description || '-'}</td>
                    <td>
                        <button class="delete-row-btn" onclick="handleDeleteLeave(${leave.id})" title="Kayıt Sil"><i class="fa-solid fa-trash-can"></i></button>
                    </td>
                `;
                allBody.appendChild(tr);
            });
        }
        
        // Render Personel İzin Bakiyeleri Table
        const balanceBody = document.getElementById('admin-user-balances-table-body');
        if (balanceBody) {
            balanceBody.innerHTML = '';
            const allUsers = await window.dbAPI.dbGetAllUsers();
            
            allUsers.forEach(u => {
                const tr = document.createElement('tr');
                
                const tdName = document.createElement('td');
                tdName.style.fontWeight = '600';
                tdName.innerText = u.name;
                tr.appendChild(tdName);
                
                const tdUser = document.createElement('td');
                tdUser.innerText = u.username;
                tr.appendChild(tdUser);
                
                const tdHireDate = document.createElement('td');
                tdHireDate.innerText = u.hireDate ? formatSingleDate(u.hireDate) : 'Tanımlanmadı';
                tr.appendChild(tdHireDate);
                
                const earned = u.hireDate ? calculateEarnedLeaveDays(u.hireDate) : 0;
                const used = u.usedLeaveDays || 0;
                const remaining = earned - used;
                
                const tdEarned = document.createElement('td');
                tdEarned.innerText = earned + ' Gün';
                tr.appendChild(tdEarned);
                
                const tdUsed = document.createElement('td');
                tdUsed.innerText = used + ' Gün';
                tr.appendChild(tdUsed);
                
                const tdRemaining = document.createElement('td');
                tdRemaining.style.fontWeight = '600';
                tdRemaining.style.color = remaining > 0 ? '#2ecc71' : 'var(--text-secondary)';
                tdRemaining.innerText = (remaining < 0 ? 0 : remaining) + ' Gün';
                tr.appendChild(tdRemaining);
                
                balanceBody.appendChild(tr);
            });
        }
    } catch (e) {
        showToast('Yönetici izin verileri yüklenirken hata: ' + e.message, 'danger');
    }
}

async function handleLeaveRequestSubmit(event) {
    event.preventDefault();
    
    const type = document.getElementById('leave-type').value;
    const startDate = document.getElementById('leave-start-date').value;
    const endDate = document.getElementById('leave-end-date').value;
    const desc = document.getElementById('leave-desc').value.trim();
    
    if (new Date(startDate) > new Date(endDate)) {
        showToast('Hata: Başlangıç tarihi bitiş tarihinden sonra olamaz.', 'danger');
        return;
    }
    
    try {
        const user = await window.dbAPI.dbGetUser(currentUser.username);
        const userTitle = user ? (user.title || '') : '';
        
        let stage = 1;
        let pendingApprover = 'hasantonak';
        
        if (userTitle.includes('Müdür') || userTitle.includes('Genel') || currentUser.username === 'onurakyurt') {
            stage = 2;
            pendingApprover = 'onurakyurt';
        } else if (userTitle.includes('Satınalma Mühendisi')) {
            stage = 1;
            pendingApprover = 'oguzcantunc';
        } else {
            stage = 1;
            pendingApprover = 'hasantonak';
        }

        const newLeave = {
            userId: currentUser.id,
            leaveType: type,
            startDate,
            endDate,
            description: desc,
            status: 'Pending',
            stage,
            pendingApprover
        };
        
        await window.dbAPI.dbAddLeave(newLeave);
        showToast('İzin talebiniz başarıyla gönderildi, onay bekliyor.', 'success');
        
        document.getElementById('leave-request-form').reset();
        await loadUserLeavesView();
    } catch (e) {
        showToast('İzin talebi oluşturulamadı: ' + e.message, 'danger');
    }
}

async function handleApproveLeave(id) {
    const canManageLeaves = (currentUser.role === 'admin') || 
                            (currentUser.username === 'onurakyurt') || 
                            (currentUser.username === 'oguzcantunc') || 
                            (currentUser.username === 'hasantonak');
    if (!canManageLeaves) {
        showToast('Hata: İzin yönetimi yetkiniz bulunmamaktadır.', 'danger');
        return;
    }
    try {
        const leaves = await window.dbAPI.dbGetAllLeaves();
        const leave = leaves.find(l => l.id === id);
        if (leave) {
            // Permission check: must be pending approver or admin
            if (currentUser.username !== leave.pendingApprover && currentUser.role !== 'admin') {
                showToast('Hata: Bu talep için onay yetkiniz bulunmamaktadır.', 'danger');
                return;
            }
            
            // Advance approval stage
            if (leave.pendingApprover === 'onurakyurt' || currentUser.role === 'admin') {
                // Final approval
                leave.status = 'Approved';
                leave.pendingApprover = '';
            } else if (leave.pendingApprover === 'oguzcantunc' || leave.pendingApprover === 'hasantonak') {
                // Route to Onur Akyurt for final stage
                leave.pendingApprover = 'onurakyurt';
                leave.stage = 2;
            }
            
            await window.dbAPI.dbUpdateLeave(leave);
            showToast('İzin talebi onaylandı.', 'success');
            await loadAdminLeavesView();
            loadWeeklyLeavesAnnouncement();
        }
    } catch (e) {
        showToast('İşlem başarısız: ' + e.message, 'danger');
    }
}

async function handleRejectLeave(id) {
    const canManageLeaves = (currentUser.role === 'admin') || 
                            (currentUser.username === 'onurakyurt') || 
                            (currentUser.username === 'oguzcantunc') || 
                            (currentUser.username === 'hasantonak');
    if (!canManageLeaves) {
        showToast('Hata: İzin yönetimi yetkiniz bulunmamaktadır.', 'danger');
        return;
    }
    try {
        const leaves = await window.dbAPI.dbGetAllLeaves();
        const leave = leaves.find(l => l.id === id);
        if (leave) {
            // Permission check: must be pending approver or admin
            if (currentUser.username !== leave.pendingApprover && currentUser.role !== 'admin') {
                showToast('Hata: Bu talep için işlem yetkiniz bulunmamaktadır.', 'danger');
                return;
            }
            
            leave.status = 'Rejected';
            leave.pendingApprover = '';
            
            await window.dbAPI.dbUpdateLeave(leave);
            showToast('İzin talebi reddedildi.', 'success');
            await loadAdminLeavesView();
            loadWeeklyLeavesAnnouncement();
        }
    } catch (e) {
        showToast('İşlem başarısız: ' + e.message, 'danger');
    }
}

async function handleCancelLeaveRequest(id) {
    try {
        await window.dbAPI.dbDeleteLeave(id);
        showToast('İzin talebi iptal edildi.', 'info');
        await loadUserLeavesView();
    } catch (e) {
        showToast('İptal işlemi başarısız: ' + e.message, 'danger');
    }
}

async function handleDeleteLeave(id) {
    const canManageLeaves = (currentUser.role === 'admin') || (currentUser.username === 'onurakyurt');
    if (!canManageLeaves) {
        showToast('Hata: İzin yönetimi yetkiniz bulunmamaktadır.', 'danger');
        return;
    }
    if (!confirm('Bu izin kaydını silmek istediğinize emin misiniz?')) return;
    try {
        await window.dbAPI.dbDeleteLeave(id);
        showToast('İzin kaydı veritabanından silindi.', 'success');
        await loadAdminLeavesView();
        loadWeeklyLeavesAnnouncement();
    } catch (e) {
        showToast('Silme işlemi başarısız: ' + e.message, 'danger');
    }
}

function formatLeavePeriod(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    
    const startDay = start.getDate();
    const startMonth = TURKISH_MONTHS[start.getMonth()];
    const startYear = start.getFullYear();
    
    const endDay = end.getDate();
    const endMonth = TURKISH_MONTHS[end.getMonth()];
    const endYear = end.getFullYear();
    
    if (startStr === endStr) {
        return `${startDay} ${startMonth}`;
    }
    if (startMonth === endMonth && startYear === endYear) {
        return `${startDay} - ${endDay} ${startMonth}`;
    }
    if (startYear === endYear) {
        return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
    }
    return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`;
}

function formatSingleDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = TURKISH_MONTHS[d.getMonth()];
    const year = d.getFullYear();
    return `${day} ${month} ${year}`;
}

async function loadAnnouncementsPage() {
    const today = new Date();
    const todayWeekStart = getMonday(today);
    
    const rangeEl = document.getElementById('announcements-week-display-range');
    if (rangeEl) {
        rangeEl.innerText = displayWeekRange(todayWeekStart);
    }
    
    // Fetch and display personal leave details
    try {
        const user = await window.dbAPI.dbGetUser(currentUser.username);
        const balanceEl = document.getElementById('personal-leave-balance');
        const hireDateEl = document.getElementById('personal-hire-date');
        const earnedEl = document.getElementById('personal-earned-leaves');
        const usedEl = document.getElementById('personal-used-leaves');
        
        if (user) {
            const earned = user.hireDate ? calculateEarnedLeaveDays(user.hireDate) : 0;
            const used = user.usedLeaveDays || 0;
            const remaining = earned - used;
            
            if (balanceEl) balanceEl.innerText = remaining < 0 ? 0 : remaining;
            if (hireDateEl) hireDateEl.innerText = user.hireDate ? formatSingleDate(user.hireDate) : 'Tanımlanmadı';
            if (earnedEl) earnedEl.innerText = earned + ' Gün';
            if (usedEl) usedEl.innerText = used + ' Gün';
        }
    } catch (e) {
        console.error('Failed to load personal leave details:', e);
    }
    
    // Check if weekly timesheet is empty for current user (for today's week start)
    try {
        const startStr = formatDate(todayWeekStart);
        const end = new Date(todayWeekStart);
        end.setDate(end.getDate() + 6);
        const endStr = formatDate(end);
        
        const timesheets = await window.dbAPI.dbGetTimesheetsByDateRange(currentUser.id, startStr, endStr);
        
        let totalHours = 0;
        timesheets.forEach(ts => {
            totalHours += ts.hours || 0;
        });
        
        const timesheetWarning = document.getElementById('announcements-timesheet-warning');
        if (timesheetWarning) {
            if (totalHours === 0) {
                const warningWeekRange = document.getElementById('announcements-warning-week-range');
                if (warningWeekRange) {
                    warningWeekRange.innerText = displayWeekRange(todayWeekStart);
                }
                timesheetWarning.style.display = 'flex';
            } else {
                timesheetWarning.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Failed to check weekly timesheet hours:', e);
    }
    
    await loadWeeklyLeavesAnnouncement(todayWeekStart);
}

async function loadWeeklyLeavesAnnouncement(targetWeekStart = currentWeekStart) {
    const listContainer = document.getElementById('announcements-list-container');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    
    try {
        const leaves = await window.dbAPI.dbGetAllLeaves();
        const users = await window.dbAPI.dbGetAllUsers();
        const usersMap = new Map(users.map(u => [u.id, u]));
        
        const startStr = formatDate(targetWeekStart);
        const end = new Date(targetWeekStart);
        end.setDate(end.getDate() + 6);
        const endStr = formatDate(end);
        
        const activeThisWeek = leaves.filter(l => {
            return l.status === 'Approved' && l.startDate <= endStr && l.endDate >= startStr;
        });
        
        if (activeThisWeek.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align: center; padding: 30px; color: var(--text-secondary); background: rgba(255,255,255,0.01); border-radius: var(--border-radius-md);">
                    <i class="fa-solid fa-circle-info text-primary" style="font-size: 2rem; margin-bottom: 12px; display: block;"></i>
                    <span>Bu haftada izinli olan personel bulunmamaktadır.</span>
                </div>
            `;
            return;
        }
        
        activeThisWeek.forEach(l => {
            const userObj = usersMap.get(l.userId);
            const name = userObj ? userObj.name : 'Bilinmeyen Personel';
            const period = formatLeavePeriod(l.startDate, l.endDate);
            
            const card = document.createElement('div');
            card.className = 'fade-in';
            card.style.background = 'rgba(255, 255, 255, 0.02)';
            card.style.border = '1px solid var(--border-color)';
            card.style.borderRadius = 'var(--border-radius-md)';
            card.style.padding = '15px 20px';
            card.style.display = 'flex';
            card.style.alignItems = 'center';
            card.style.justifyContent = 'space-between';
            card.style.gap = '15px';
            card.style.marginTop = '10px';
            
            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 15px;">
                    <div style="background: rgba(243, 156, 18, 0.1); width: 44px; height: 44px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #f39c12; font-size: 1.2rem;">
                        <i class="fa-solid fa-plane-departure"></i>
                    </div>
                    <div style="text-align: left;">
                        <h4 style="margin: 0; font-size: 1.05rem; color: var(--text-primary);">${name}</h4>
                        <p style="margin: 3px 0 0 0; font-size: 0.85rem; color: var(--text-secondary);">${l.leaveType} — ${period}</p>
                    </div>
                </div>
            `;
            listContainer.appendChild(card);
        });
    } catch (e) {
        console.error('Failed to load weekly leaves announcement:', e);
        listContainer.innerHTML = `<div class="alert-warning" style="padding: 15px;">Hata: Duyurular yüklenemedi: ${e.message}</div>`;
    }
}

// --- ACCOUNT SETTINGS LOGIC ---
async function loadSettingsPage() {
    document.getElementById('settings-name').value = currentUser.name || '';
    document.getElementById('settings-username').value = currentUser.username || '';
    document.getElementById('settings-role').value = currentUser.role === 'admin' ? 'Yönetici' : 'Personel';
    document.getElementById('settings-password-form').reset();
    
    try {
        const user = await window.dbAPI.dbGetUser(currentUser.username);
        const hireDateEl = document.getElementById('settings-hire-date');
        if (hireDateEl) {
            hireDateEl.value = (user && user.hireDate) ? formatSingleDate(user.hireDate) : 'Tanımlanmadı';
        }
    } catch (e) {
        console.error('Failed to load user hire date in settings:', e);
    }
}

async function handleSaveProfileSettings() {
    const nameVal = document.getElementById('settings-name').value.trim();
    if (!nameVal) {
        showToast('Lütfen Ad Soyad alanını doldurun.', 'danger');
        return;
    }
    try {
        const user = await window.dbAPI.dbGetUser(currentUser.username);
        if (user) {
            user.name = nameVal;
            await window.dbAPI.dbUpdateUser(user);
            
            currentUser.name = nameVal;
            sessionStorage.setItem('timesheet_session', JSON.stringify(currentUser));
            
            const displayNameEl = document.getElementById('user-display-name');
            if (displayNameEl) displayNameEl.innerText = nameVal;
            
            showToast('Profil bilgileri başarıyla güncellendi.', 'success');
        }
    } catch (e) {
        showToast('Hata: ' + e.message, 'danger');
    }
}

let mustChangePassword = false;

async function checkDefaultPassword() {
    if (!currentUser) return;
    try {
        const defaultHash = await window.authAPI.hashPassword('123456');
        const user = await window.dbAPI.dbGetUser(currentUser.username);
        if (user && user.passwordHash === defaultHash) {
            mustChangePassword = true;
        } else {
            mustChangePassword = false;
        }
    } catch (e) {
        console.error('Failed to check default password:', e);
    }
    updateSidebarAccess();
}

function updateSidebarAccess() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const warningBanner = document.getElementById('password-force-warning');
    
    if (mustChangePassword) {
        // Disable other links
        sidebarLinks.forEach(link => {
            if (link.id !== 'nav-settings') {
                link.style.pointerEvents = 'none';
                link.style.opacity = '0.3';
            }
        });
        
        // Show warning banner in settings page
        if (warningBanner) warningBanner.style.display = 'flex';
        
        // If not already on settings page, switch to it
        const activeSection = document.querySelector('.section.active');
        if (!activeSection || activeSection.id !== 'section-settings') {
            switchSection('settings');
        }
    } else {
        // Enable links
        sidebarLinks.forEach(link => {
            link.style.pointerEvents = 'auto';
            link.style.opacity = '1';
        });
        
        if (warningBanner) warningBanner.style.display = 'none';
    }
}

async function handleSavePasswordSettings(event) {
    event.preventDefault();
    const currentPwd = document.getElementById('settings-current-password').value;
    const newPwd = document.getElementById('settings-new-password').value;
    const confirmPwd = document.getElementById('settings-confirm-password').value;
    
    if (newPwd.length < 6) {
        showToast('Yeni şifre en az 6 karakter olmalıdır.', 'danger');
        return;
    }
    if (newPwd === '123456') {
        showToast('Hata: Güvenliğiniz için şifreniz varsayılan şifre (123456) olamaz.', 'danger');
        return;
    }
    if (newPwd !== confirmPwd) {
        showToast('Yeni şifreler eşleşmiyor.', 'danger');
        return;
    }
    
    try {
        const user = await window.dbAPI.dbGetUser(currentUser.username);
        if (user) {
            const currentHash = await window.authAPI.hashPassword(currentPwd);
            if (user.passwordHash !== currentHash) {
                showToast('Hata: Mevcut şifreniz yanlış.', 'danger');
                return;
            }
            
            user.passwordHash = await window.authAPI.hashPassword(newPwd);
            await window.dbAPI.dbUpdateUser(user);
            
            showToast('Şifreniz başarıyla değiştirildi.', 'success');
            document.getElementById('settings-password-form').reset();
            
            // Check password status again to unlock sidebar
            await checkDefaultPassword();
        }
    } catch (e) {
        showToast('Hata: ' + e.message, 'danger');
    }
}

// Bind to window for global access
window.handleLeaveRequestSubmit = handleLeaveRequestSubmit;
window.handleApproveLeave = handleApproveLeave;
window.handleRejectLeave = handleRejectLeave;
window.handleCancelLeaveRequest = handleCancelLeaveRequest;
window.handleDeleteLeave = handleDeleteLeave;
window.loadWeeklyLeavesAnnouncement = loadWeeklyLeavesAnnouncement;
window.switchLeavesTab = switchLeavesTab;
window.loadAnnouncementsPage = loadAnnouncementsPage;
window.loadSettingsPage = loadSettingsPage;
window.handleSaveProfileSettings = handleSaveProfileSettings;
window.handleSavePasswordSettings = handleSavePasswordSettings;
window.checkDefaultPassword = checkDefaultPassword;
