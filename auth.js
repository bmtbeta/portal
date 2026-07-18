// auth.js - Authentication Wrapper using Web Crypto API for secure hashing

// SHA-256 Hash function
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// User Registration
async function register(username, password, name, role = 'user', hireDate = '', isActive = true, title = '') {
    if (!username || !password || !name) {
        throw new Error('Lütfen tüm alanları doldurun.');
    }

    const cleanUsername = username.trim().toLowerCase();
    
    // Check if user already exists
    const existingUser = await window.dbAPI.dbGetUser(cleanUsername);
    if (existingUser) {
        throw new Error('Bu kullanıcı adı zaten alınmış.');
    }

    const passwordHash = await hashPassword(password);
    const newUser = {
        username: cleanUsername,
        passwordHash,
        name: name.trim(),
        role,
        hireDate,
        isActive,
        title
    };

    const userId = await window.dbAPI.dbAddUser(newUser);
    return { id: userId, username: cleanUsername, name: newUser.name, role, hireDate, isActive, title };
}

// User Login
async function login(username, password) {
    if (!username || !password) {
        throw new Error('Kullanıcı adı ve şifre gereklidir.');
    }

    const cleanUsername = username.trim().toLowerCase();
    const user = await window.dbAPI.dbGetUser(cleanUsername);
    if (!user) {
        throw new Error('Kullanıcı adı veya şifre hatalı.');
    }

    if (user.isActive === false) {
        throw new Error('Hesabınız askıya alınmıştır. Lütfen yönetici ile iletişime geçin.');
    }

    const passwordHash = await hashPassword(password);
    if (user.passwordHash !== passwordHash) {
        throw new Error('Kullanıcı adı veya şifre hatalı.');
    }

    // Set Session
    const sessionUser = {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role
    };
    sessionStorage.setItem('timesheet_session', JSON.stringify(sessionUser));
    return sessionUser;
}

// Get Logged In User
function getCurrentUser() {
    const session = sessionStorage.getItem('timesheet_session');
    return session ? JSON.parse(session) : null;
}

// Logout User
function logout() {
    sessionStorage.removeItem('timesheet_session');
}

// Export Auth API to window
window.authAPI = {
    hashPassword,
    register,
    login,
    getCurrentUser,
    logout
};
