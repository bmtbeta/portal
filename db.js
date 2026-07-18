// db.js - IndexedDB Database Service Layer

const DB_NAME = 'TimesheetDB';
const DB_VERSION = 2;

let dbInstance = null;

// Initialize Database
async function getDB() {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Users Store
            if (!db.objectStoreNames.contains('users')) {
                const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
                userStore.createIndex('username', 'username', { unique: true });
            }

            // Projects Store
            if (!db.objectStoreNames.contains('projects')) {
                const projectStore = db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
                projectStore.createIndex('code', 'code', { unique: true });
            }

            // Activities Store
            if (!db.objectStoreNames.contains('activities')) {
                const activityStore = db.createObjectStore('activities', { keyPath: 'id', autoIncrement: true });
                activityStore.createIndex('name', 'name', { unique: true });
            }

            // Timesheets Store
            if (!db.objectStoreNames.contains('timesheets')) {
                const timesheetStore = db.createObjectStore('timesheets', { keyPath: 'id', autoIncrement: true });
                timesheetStore.createIndex('userId', 'userId', { unique: false });
                timesheetStore.createIndex('date', 'date', { unique: false });
                timesheetStore.createIndex('userId_date', ['userId', 'date'], { unique: false });
            }

            // Leaves Store
            if (!db.objectStoreNames.contains('leaves')) {
                const leaveStore = db.createObjectStore('leaves', { keyPath: 'id', autoIncrement: true });
                leaveStore.createIndex('userId', 'userId', { unique: false });
                leaveStore.createIndex('status', 'status', { unique: false });
            }
        };

        request.onsuccess = async (event) => {
            dbInstance = event.target.result;
            await seedDatabase();
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            console.error('Database failed to open:', event.target.error);
            reject(event.target.error);
        };
    });
}

// Seed Initial Data (Admin, default projects/activities)
async function seedDatabase() {
    const db = dbInstance;

    // Helper to check if a store is empty
    const isStoreEmpty = (storeName) => {
        return new Promise((resolve) => {
            const tx = db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const countRequest = store.count();
            countRequest.onsuccess = () => resolve(countRequest.result === 0);
            countRequest.onerror = () => resolve(true);
        });
    };

    // Seed Users (Admin and default list)
    const existingUsers = await new Promise((resolve) => {
        const tx = db.transaction('users', 'readonly');
        const store = tx.objectStore('users');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });

    const existingUsernames = new Set(existingUsers.map(u => u.username));
    const txUsers = db.transaction('users', 'readwrite');
    const storeUsers = txUsers.objectStore('users');

    const defaultUsers = [
        // Admin
        { username: 'admin', passwordHash: '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918', name: 'Sistem Yöneticisi', role: 'admin', title: 'Sistem Yöneticisi', reportsTo: '' },
        // List from image (default password '123456')
        { username: 'onurakyurt', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Onur Akyurt', role: 'user', title: 'Personel Sorumlusu', reportsTo: 'utkuyildirim' },
        { username: 'oguzcantunc', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Oğuz Can Tunç', role: 'user', title: 'Satınalma Müdürü', reportsTo: 'utkuyildirim' },
        { username: 'barismenkuc', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Barış Menküç', role: 'user', title: 'Satınalma Mühendisi', reportsTo: 'oguzcantunc' },
        { username: 'olgusen', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Olgu Şen', role: 'user', title: 'Kıdemli Elektrik Mühendisi', reportsTo: 'hasantonak' },
        { username: 'muratyarici', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Murat Yarıcı', role: 'user', title: 'Elektrik Mühendisi', reportsTo: 'hasantonak' },
        { username: 'mervealcan', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Merve Alcan', role: 'user', title: 'Elektrik Mühendisi', reportsTo: 'hasantonak' },
        { username: 'emrealbayrak', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Emre Albayrak', role: 'user', title: 'Elektrik Mühendisi', reportsTo: 'hasantonak' },
        { username: 'sezinhekimoglu', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Sezin Hekimoğlu', role: 'user', title: 'Kıdemli Tasarım Sorumlusu', reportsTo: 'hasantonak' },
        { username: 'ahmetgunes', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Ahmet Güneş', role: 'user', title: 'Tasarım Sorumlusu', reportsTo: 'hasantonak' },
        { username: 'uguruzun', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Uğur Uzun', role: 'user', title: 'Kıdemli Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'rabiapala', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Rabia Pala', role: 'user', title: 'Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'batuhanseker', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Batuhan Şeker', role: 'user', title: 'Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'cemalcelik', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Cemal Çelik', role: 'user', title: 'Kıdemli Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'bekirpolat', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Bekir Polat', role: 'user', title: 'Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'yaprakkoc', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Yaprak Koç', role: 'user', title: 'Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'berkanevran', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Berkan Evran', role: 'user', title: 'Satınalma Mühendisi', reportsTo: 'oguzcantunc' },
        { username: 'volkanyavuzcancetin', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Volkan Yavuzcan Çetin', role: 'user', title: 'ELD Sorumlusu', reportsTo: 'hasantonak' },
        { username: 'siracarapoglu', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Siraç Arapoğlu', role: 'user', title: 'Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'ulaskose', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Ulaş Köse', role: 'user', title: 'Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'halilerenozudogru', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Halil Eren Özüdoğru', role: 'user', title: 'Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'kurtuluspolat', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Kurtuluş Polat', role: 'user', title: 'Proje Mühendisi', reportsTo: 'hasantonak' },
        { username: 'busrasubasi', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Büşra Subaşı', role: 'user', title: 'Elektrik Mühendisi', reportsTo: 'hasantonak' },
        { username: 'hasantonak', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Hasan Tonak', role: 'user', title: 'Proje Müdürü', reportsTo: 'utkuyildirim' },
        { username: 'mehmetguzeldal', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Mehmet Güzeldal', role: 'user', title: 'Finans Müdürü', reportsTo: 'utkuyildirim' },
        { username: 'utkuyildirim', passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', name: 'Utku Yıldırım', role: 'user', title: 'Genel Müdür', reportsTo: '' }
    ];

    const userTitles = {
        'admin': 'Sistem Yöneticisi',
        'onurakyurt': 'Personel Sorumlusu',
        'oguzcantunc': 'Satınalma Müdürü',
        'barismenkuc': 'Satınalma Mühendisi',
        'olgusen': 'Kıdemli Elektrik Mühendisi',
        'muratyarici': 'Elektrik Mühendisi',
        'mervealcan': 'Elektrik Mühendisi',
        'emrealbayrak': 'Elektrik Mühendisi',
        'sezinhekimoglu': 'Kıdemli Tasarım Sorumlusu',
        'ahmetgunes': 'Tasarım Sorumlusu',
        'uguruzun': 'Kıdemli Proje Mühendisi',
        'rabiapala': 'Proje Mühendisi',
        'batuhanseker': 'Proje Mühendisi',
        'cemalcelik': 'Kıdemli Proje Mühendisi',
        'bekirpolat': 'Proje Mühendisi',
        'yaprakkoc': 'Proje Mühendisi',
        'berkanevran': 'Satınalma Mühendisi',
        'volkanyavuzcancetin': 'ELD Sorumlusu',
        'siracarapoglu': 'Proje Mühendisi',
        'ulaskose': 'Proje Mühendisi',
        'halilerenozudogru': 'Proje Mühendisi',
        'kurtuluspolat': 'Proje Mühendisi',
        'busrasubasi': 'Elektrik Mühendisi',
        'hasantonak': 'Proje Müdürü',
        'mehmetguzeldal': 'Finans Müdürü',
        'utkuyildirim': 'Genel Müdür'
    };

    const userReports = {
        'admin': '',
        'utkuyildirim': '',
        'mehmetguzeldal': 'utkuyildirim',
        'onurakyurt': 'utkuyildirim',
        'hasantonak': 'utkuyildirim',
        'oguzcantunc': 'utkuyildirim',
        'barismenkuc': 'oguzcantunc',
        'berkanevran': 'oguzcantunc',
        'olgusen': 'hasantonak',
        'muratyarici': 'hasantonak',
        'mervealcan': 'hasantonak',
        'emrealbayrak': 'hasantonak',
        'sezinhekimoglu': 'hasantonak',
        'ahmetgunes': 'hasantonak',
        'uguruzun': 'hasantonak',
        'rabiapala': 'hasantonak',
        'batuhanseker': 'hasantonak',
        'cemalcelik': 'hasantonak',
        'bekirpolat': 'hasantonak',
        'yaprakkoc': 'hasantonak',
        'volkanyavuzcancetin': 'hasantonak',
        'siracarapoglu': 'hasantonak',
        'ulaskose': 'hasantonak',
        'halilerenozudogru': 'hasantonak',
        'kurtuluspolat': 'hasantonak',
        'busrasubasi': 'hasantonak'
    };

    defaultUsers.forEach(u => {
        if (!existingUsernames.has(u.username)) {
            storeUsers.add(u);
        }
    });

    // Run migration for existing users
    const existingUsersList = await new Promise((resolve) => {
        const req = storeUsers.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });

    existingUsersList.forEach(u => {
        const targetTitle = userTitles[u.username];
        if (targetTitle && !u.title) {
            u.title = targetTitle;
        }
        const targetReports = userReports[u.username];
        if (targetReports !== undefined && (u.reportsTo === undefined || u.reportsTo === null)) {
            u.reportsTo = targetReports;
        }
        storeUsers.put(u);
    });
    console.log('Seeded default users & migrated titles and reportsTo relations');

    // Seed Projects (Check and add individually by code)
    const existingProjects = await new Promise((resolve) => {
        const tx = db.transaction('projects', 'readonly');
        const store = tx.objectStore('projects');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });

    const existingCodes = new Set(existingProjects.map(p => p.code));
    const txProjects = db.transaction('projects', 'readwrite');
    const storeProjects = txProjects.objectStore('projects');
    const defaultProjects = [
        { code: '4226', name: 'Pakistan Yedek', description: '', isActive: true },
        { code: '4325', name: 'TVEG', description: '', isActive: true },
        { code: '4341', name: 'PADYOM', description: '', isActive: true },
        { code: '4356', name: 'DIMDEG', description: '', isActive: true },
        { code: '4368', name: 'PREVEZE', description: '', isActive: true },
        { code: '4372', name: 'CTS', description: '', isActive: true },
        { code: '4375', name: 'TUSK', description: '', isActive: true },
        { code: '4384', name: 'PN MILGEM', description: '', isActive: true },
        { code: '4390', name: 'MILGEM5', description: '', isActive: true },
        { code: '4411', name: 'UKNC', description: '', isActive: true },
        { code: '4419', name: 'BARYOM', description: '', isActive: true },
        { code: '4420', name: 'LCM', description: '', isActive: true },
        { code: '4425', name: 'ADKG', description: '', isActive: true },
        { code: '6000', name: 'YTKB', description: '', isActive: true },
        { code: '6001', name: 'UKNC2', description: '', isActive: true },
        { code: '6002', name: 'CANADA', description: '', isActive: true },
        { code: '6002-02', name: 'CCGS Limnos', description: '', isActive: true },
        { code: '6002-03', name: 'Medical AHU', description: '', isActive: true },
        { code: '6002-11', name: 'Polar', description: '', isActive: true },
        { code: '6003', name: 'Milgem 6-7-8', description: '', isActive: true },
        { code: '6004', name: 'GURYOM', description: '', isActive: true },
        { code: '6005', name: 'Slovenia', description: '', isActive: true },
        { code: '6006', name: 'Milgem 9-12', description: '', isActive: true },
        { code: '6007', name: 'YLCT', description: '', isActive: true },
        { code: '6008', name: 'Malezya', description: '', isActive: true },
        { code: '6009', name: 'Gunboat', description: '', isActive: true },
        { code: '6010', name: 'MLHB', description: '', isActive: true },
        { code: '6011', name: 'FACM', description: '', isActive: true },
        { code: '6012', name: 'ADKG3-6', description: '', isActive: true },
        { code: '6013', name: 'OPV', description: '', isActive: true },
        { code: '6013-02', name: 'OPV', description: '', isActive: true },
        { code: '6014', name: 'TF2000', description: '', isActive: true },
        { code: 'INT-001', name: 'Şirket İçi İşler', description: 'Eğitimler, İdari İşler, Genel Toplantılar', isActive: true }
    ];

    defaultProjects.forEach(proj => {
        if (!existingCodes.has(proj.code)) {
            storeProjects.add(proj);
        }
    });
    console.log('Seeded projects');

    // Seed Activities (Check and add individually by name)
    const existingActivities = await new Promise((resolve) => {
        const tx = db.transaction('activities', 'readonly');
        const store = tx.objectStore('activities');
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
    });

    const existingNames = new Set(existingActivities.map(a => a.name));
    const txActivities = db.transaction('activities', 'readwrite');
    const storeActivities = txActivities.objectStore('activities');
    const defaultActivities = [
        { name: '100 - Proje Başlangıcı ve Planlama', description: '', isActive: true },
        { name: '200 - Veri Yönetimi', description: '', isActive: true },
        { name: '300 - Tasarım Yönetimi', description: '', isActive: true },
        { name: '400 - Planlama Yönetimi', description: '', isActive: true },
        { name: '500 - Devreye Alma ve İlerleme Yönetimi', description: '', isActive: true },
        { name: '600 - Satınalma Yönetimi', description: '', isActive: true },
        { name: '700 - Sevkiyat Yönetimi', description: '', isActive: true },
        { name: '1000 - Isı Yükü Hesabı', description: '', isActive: true },
        { name: '2000 - Tek Hat Şemaları', description: '', isActive: true },
        { name: '3000 - Çift Hat Şemaları', description: '', isActive: true },
        { name: '4000 - Basınç Kaybı', description: '', isActive: true },
        { name: '5000 - Ekipman Tasarımı', description: '', isActive: true },
        { name: '6000 - Soğuk Su / Sıcak Su Sistemleri', description: '', isActive: true },
        { name: '7000 - Dokümantasyon / Belgelendirme', description: '', isActive: true },
        { name: '8000 - Teknik Koordinasyon', description: '', isActive: true },
        { name: '9000 - Revizyon', description: '', isActive: true },
        // Original activities
        { name: 'Yazılım Geliştirme', description: 'Kod yazma ve kod gözden geçirme', isActive: true },
        { name: 'Analiz & Tasarım', description: 'Gereksinim analizi ve sistem tasarımı', isActive: true },
        { name: 'Test & QA', description: 'Birim, entegrasyon ve kabul testleri', isActive: true },
        { name: 'Toplantı', description: 'Proje veya şirket içi toplantılar', isActive: true },
        { name: 'Destek & Bakım', description: 'Müşteri sorunlarını çözme ve hata giderme', isActive: true }
    ];

    defaultActivities.forEach(act => {
        if (!existingNames.has(act.name)) {
            storeActivities.add(act);
        }
    });
    console.log('Seeded activities');
}

// --- DATABASE OPERATIONS ---

// User Operations
async function dbGetUser(username) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('users', 'readonly');
        const store = tx.objectStore('users');
        const index = store.index('username');
        const request = index.get(username);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function dbGetUserById(id) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('users', 'readonly');
        const store = tx.objectStore('users');
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });
}

async function dbGetAllUsers() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('users', 'readonly');
        const store = tx.objectStore('users');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function dbAddUser(user) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('users', 'readwrite');
        const store = tx.objectStore('users');
        const request = store.add(user);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function dbUpdateUser(user) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('users', 'readwrite');
        const store = tx.objectStore('users');
        const request = store.put(user);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function dbDeleteUser(id) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('users', 'readwrite');
        const store = tx.objectStore('users');
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// Project Operations
async function dbGetAllProjects() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('projects', 'readonly');
        const store = tx.objectStore('projects');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function dbAddProject(project) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        const store = tx.objectStore('projects');
        const request = store.add(project);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function dbUpdateProject(project) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        const store = tx.objectStore('projects');
        const request = store.put(project);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function dbDeleteProject(id) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('projects', 'readwrite');
        const store = tx.objectStore('projects');
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// Activity Operations
async function dbGetAllActivities() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('activities', 'readonly');
        const store = tx.objectStore('activities');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function dbAddActivity(activity) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('activities', 'readwrite');
        const store = tx.objectStore('activities');
        const request = store.add(activity);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function dbUpdateActivity(activity) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('activities', 'readwrite');
        const store = tx.objectStore('activities');
        const request = store.put(activity);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function dbDeleteActivity(id) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('activities', 'readwrite');
        const store = tx.objectStore('activities');
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// Timesheet Operations
async function dbGetTimesheetsForUser(userId) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('timesheets', 'readonly');
        const store = tx.objectStore('timesheets');
        const index = store.index('userId');
        const request = index.getAll(userId);
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function dbGetAllTimesheets() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('timesheets', 'readonly');
        const store = tx.objectStore('timesheets');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

// Get user timesheet entries within a date range (inclusive)
async function dbGetTimesheetsByDateRange(userId, startDate, endDate) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('timesheets', 'readonly');
        const store = tx.objectStore('timesheets');
        const index = store.index('userId');
        
        // Fetch all user entries
        const request = index.getAll(userId);
        request.onsuccess = () => {
            const allEntries = request.result || [];
            // Filter by date range manually (standard way when dynamic compound range queries are complex in plain IDB)
            const filtered = allEntries.filter(entry => entry.date >= startDate && entry.date <= endDate);
            resolve(filtered);
        };
        request.onerror = () => reject(request.error);
    });
}

// Save timesheet entries for a user in a specific week date range (delete old, save new)
async function dbSaveTimesheetEntries(userId, startDate, endDate, entries) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('timesheets', 'readwrite');
        const store = tx.objectStore('timesheets');
        
        // 1. Delete all existing records for this user in this date range
        const index = store.index('userId');
        const request = index.openCursor(userId);
        
        request.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const entry = cursor.value;
                if (entry.date >= startDate && entry.date <= endDate) {
                    cursor.delete();
                }
                cursor.continue();
            } else {
                // 2. Insert new entries (only those with hours > 0)
                const validEntries = entries.filter(e => e.hours > 0);
                let count = 0;
                
                if (validEntries.length === 0) {
                    resolve(true);
                    return;
                }
                
                validEntries.forEach(entry => {
                    const cleanEntry = {
                        userId: Number(userId),
                        date: entry.date,
                        projectId: Number(entry.projectId),
                        activityId: Number(entry.activityId),
                        task: entry.task || '',
                        hours: Number(entry.hours),
                        description: entry.description || ''
                    };
                    const addRequest = store.add(cleanEntry);
                    addRequest.onsuccess = () => {
                        count++;
                        if (count === validEntries.length) {
                            resolve(true);
                        }
                    };
                    addRequest.onerror = (e) => reject(e.target.error);
                });
            }
        };
        
        request.onerror = (event) => reject(event.target.error);
    });
}

// Leave Operations
async function dbGetAllLeaves() {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('leaves', 'readonly');
        const store = tx.objectStore('leaves');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
    });
}

async function dbAddLeave(leave) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('leaves', 'readwrite');
        const store = tx.objectStore('leaves');
        const request = store.add(leave);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function dbUpdateLeave(leave) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('leaves', 'readwrite');
        const store = tx.objectStore('leaves');
        const request = store.put(leave);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function dbDeleteLeave(id) {
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction('leaves', 'readwrite');
        const store = tx.objectStore('leaves');
        const request = store.delete(id);
        request.onsuccess = () => resolve(true);
        request.onerror = () => reject(request.error);
    });
}

// Export database operations to window object for global access
window.dbAPI = {
    getDB,
    dbGetUser,
    dbGetUserById,
    dbGetAllUsers,
    dbAddUser,
    dbUpdateUser,
    dbDeleteUser,
    dbGetAllProjects,
    dbAddProject,
    dbUpdateProject,
    dbDeleteProject,
    dbGetAllActivities,
    dbAddActivity,
    dbUpdateActivity,
    dbDeleteActivity,
    dbGetTimesheetsForUser,
    dbGetAllTimesheets,
    dbGetTimesheetsByDateRange,
    dbSaveTimesheetEntries,
    dbGetAllLeaves,
    dbAddLeave,
    dbUpdateLeave,
    dbDeleteLeave
};
