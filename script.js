let data = {};
let users = JSON.parse(localStorage.getItem('carnetUsers') || '[]');
let currentUser = JSON.parse(sessionStorage.getItem('currentUser') || 'null');
let currentDept = null;
let currentQuestion = null;
let score = 0;
let totalAsked = 0;

// Initialize
async function init() {
    console.log('--- Initializing Application ---');

    try {
        // Fetch latest reference data (contains new photos/names)
        const response = await fetch('./data.json');
        const remoteData = await response.json();
        console.log('Reference data loaded from data.json');

        // Load local edits (contains postiers/postal_data edits)
        const localData = JSON.parse(localStorage.getItem('carnetData') || '{}');

        if (localData.departments) {
            console.log('Merging local edits (postiers/postal data) into remote reference...');
            Object.keys(remoteData.departments).forEach(code => {
                const remoteDept = remoteData.departments[code];
                const localDept = localData.departments[code];

                if (localDept) {
                    // Update only specific editable fields
                    remoteDept.postiers = localDept.postiers;
                    remoteDept.postal_data = localDept.postal_data;
                }
            });
        }

        data = remoteData;

        // Merge regional data edits
        if (localData.region) {
            console.log('Merging local regional edits...');
            Object.keys(localData.region).forEach(key => {
                if (typeof localData.region[key] !== 'object') {
                    data.region[key] = localData.region[key];
                }
            });
            if (localData.region.dgs) data.region.dgs.name = localData.region.dgs.name;
        }

        saveData(); // Save the merged state
    } catch (err) {
        console.error('Failed to load/merge data:', err);
        // Fallback to local data if sync fails
        data = JSON.parse(localStorage.getItem('carnetData') || '{"departments":{}, "region":{}}');
    }

    setupAuthEvents();
    checkAuth(); // Call this AFTER data is loaded

    // Initial render if already auth'd
    if (currentUser && data.departments) {
        renderDeptGrid();
        generateQuiz();
        updateStats();
    }
}

function checkAuth() {
    console.log('--- Auth Check ---');
    const app = document.getElementById('app');
    const authContainer = document.getElementById('auth-container');

    if (currentUser) {
        console.log('User authenticated, showing app.');
        app.style.display = 'block';
        authContainer.style.display = 'none';

        // Render if data is available
        if (data && data.departments && Object.keys(data.departments).length > 0) {
            renderDeptGrid();
            generateQuiz();
            updateStats();
        }
    } else {
        console.log('User NOT authenticated, showing auth box.');
        app.style.display = 'none';
        authContainer.style.display = 'flex';
        showAuthView('login-view');
    }
}

function showAuthView(viewId) {
    console.log('Switching to view:', viewId);
    ['login-view', 'register-view', 'forgot-view'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = id === viewId ? 'block' : 'none';
    });
}

function saveData() {
    localStorage.setItem('carnetData', JSON.stringify(data));
}

// Rendering
function renderDeptGrid() {
    const grid = document.getElementById('dept-grid');
    grid.innerHTML = '';

    Object.keys(data.departments).forEach(code => {
        const dept = data.departments[code];
        const card = document.createElement('div');
        card.className = 'dept-card glass';
        card.innerHTML = `
            <h3>${code} - ${dept.name}</h3>
            <p>${dept.population.toLocaleString()} habitants</p>
            <p>Préfet: ${dept.prefect.name}</p>
        `;
        card.onclick = () => showFiche(code);
        grid.appendChild(card);
    });
}

function showFiche(code) {
    currentDept = code;
    const dept = data.departments[code];
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('region-view').style.display = 'none';
    document.getElementById('fiche-view').style.display = 'block';

    document.getElementById('fiche-dept-name').textContent = `${code} - ${dept.name}`;
    document.getElementById('fiche-dept-pop').textContent = `${dept.population.toLocaleString()} habitants`;

    // Executif
    renderPerson('fiche-prefect', dept.prefect, 'Préfet');
    renderPerson('fiche-pres-conseil', dept.president_conseil, 'Président Conseil Dép.');
    renderPerson('fiche-pres-cdpp', dept.president_cdpp, 'Président CDPP');

    // Parlementaires
    const senatorsContainer = document.getElementById('fiche-senators');
    senatorsContainer.innerHTML = '';
    dept.senators.forEach(s => renderPerson(senatorsContainer, s, s.party, true));

    const deputiesContainer = document.getElementById('fiche-deputies');
    deputiesContainer.innerHTML = '';
    dept.deputies.forEach(d => renderPerson(deputiesContainer, d, `${d.party} - Circo ${d.circo}`, true));

    // Villes
    const villesContainer = document.getElementById('fiche-villes');
    villesContainer.innerHTML = '';
    dept.villes_20k.forEach(v => {
        const div = document.createElement('div');
        div.className = 'glass';
        div.style.padding = '0.75rem';
        div.innerHTML = `
            <strong>${v.name}</strong><br>
            <span style="font-size: 0.8rem; color: var(--text-dim);">${v.pop.toLocaleString()} hab.</span><br>
            Maire: ${v.mayor} (${v.party})
        `;
        villesContainer.appendChild(div);
    });

    // Postal Data
    document.getElementById('fiche-postiers').textContent = dept.postiers || 'À renseigner';
    document.getElementById('fiche-postal-points').textContent = dept.postal_data.points_contact;
    document.getElementById('fiche-postal-bureaux').textContent = dept.postal_data.bureaux;
    document.getElementById('fiche-postal-courrier').textContent = dept.postal_data.etablissements_courrier;
}

function showRegionFiche() {
    currentDept = null; // Important for toggleEdit logic
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('fiche-view').style.display = 'none';
    document.getElementById('region-view').style.display = 'block';

    const r = data.region;
    document.getElementById('region-dgs').textContent = r.dgs.name;
    document.getElementById('region-pib').textContent = r.pib;
    document.getElementById('region-pop').textContent = r.population;
    document.getElementById('region-communes').textContent = r.communes;
    document.getElementById('region-cci').textContent = r.cci_count;

    renderPerson('region-president-container', r.president, r.president.party);
}

function renderPerson(containerId, person, title, append = false) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    const html = `
        <div class="person-card">
            <img src="${person.photo || 'broken'}" 
                 class="person-photo ${!person.photo ? 'broken' : ''}" 
                 alt="${person.name}"
                 onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
            <div class="person-info">
                <a href="${person.wiki}" target="_blank">${person.name}</a>
                <span>${title}</span>
            </div>
        </div>
    `;
    if (append) {
        const div = document.createElement('div');
        div.innerHTML = html;
        container.appendChild(div.firstElementChild);
    } else {
        container.innerHTML = html;
    }
}

function backToDashboard() {
    document.getElementById('dashboard').style.display = 'grid';
    document.getElementById('fiche-view').style.display = 'none';
    document.getElementById('region-view').style.display = 'none';
}

// Quiz Logic
function generateQuiz() {
    if (!data.departments || Object.keys(data.departments).length === 0) {
        console.warn('Cannot generate quiz: no department data');
        return;
    }

    const codes = Object.keys(data.departments);
    const code = codes[Math.floor(Math.random() * codes.length)];
    const dept = data.departments[code];

    if (!dept || !dept.villes_20k || dept.villes_20k.length === 0) {
        // Fallback for depts without cities (shouldn't happen with our data but safe)
        generateQuiz();
        return;
    }

    const questions = [
        { q: `Qui est le maire de ${dept.villes_20k[0].name} ?`, a: dept.villes_20k[0].mayor },
        { q: `Qui est le préfet de ${dept.name} ?`, a: dept.prefect.name },
        { q: `Qui préside le conseil départemental de ${dept.name} ?`, a: dept.president_conseil.name },
        { q: `Dans quel département se trouve la ville de ${dept.villes_20k[0].name} ?`, a: dept.name }
    ];

    // Add more variety if more cities exist
    if (dept.villes_20k.length > 1) {
        const v = dept.villes_20k[Math.floor(Math.random() * dept.villes_20k.length)];
        questions.push({ q: `Qui est le maire de ${v.name} ?`, a: v.mayor });
    }

    currentQuestion = questions[Math.floor(Math.random() * questions.length)];
    document.getElementById('quiz-question').textContent = currentQuestion.q;
    document.getElementById('quiz-input').value = '';
    document.getElementById('quiz-feedback').style.display = 'none';
}

function checkAnswer() {
    const input = document.getElementById('quiz-input').value.trim();
    const feedback = document.getElementById('quiz-feedback');

    totalAsked++;

    // Normalize comparison (simplified)
    const normalizedInput = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalizedAnswer = currentQuestion.a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    if (normalizedInput === normalizedAnswer || normalizedAnswer.includes(normalizedInput) && normalizedInput.length > 3) {
        score++;
        feedback.textContent = "Correct ! Bravo.";
        feedback.className = "feedback correct";
    } else {
        feedback.textContent = `Incorrect. La réponse était : ${currentQuestion.a}`;
        feedback.className = "feedback wrong";
    }

    feedback.style.display = 'block';
    updateStats();

    setTimeout(generateQuiz, 3000);
}

function updateStats() {
    // Stats panel removed from UI, but we keep core stats tracking in case needed for hidden logic
    console.log(`Stats: ${score}/${totalAsked}`);
}

// Edit Mode
let isEditing = false;
function toggleEdit(btnId) {
    isEditing = !isEditing;
    const btn = document.getElementById(btnId);
    const fields = document.querySelectorAll('.editable-field');

    btn.textContent = isEditing ? 'Enregistrer' : 'Mode Édition';
    btn.style.background = isEditing ? 'var(--secondary)' : 'rgba(255, 255, 255, 0.1)';

    fields.forEach(f => {
        f.contentEditable = isEditing;
    });

    if (!isEditing) {
        if (currentDept) {
            // Save Dept
            const dept = data.departments[currentDept];
            dept.postiers = document.getElementById('fiche-postiers').textContent;
            dept.postal_data.points_contact = parseInt(document.getElementById('fiche-postal-points').textContent) || 0;
            dept.postal_data.bureaux = parseInt(document.getElementById('fiche-postal-bureaux').textContent) || 0;
            dept.postal_data.etablissements_courrier = parseInt(document.getElementById('fiche-postal-courrier').textContent) || 0;
        } else {
            // Save Region (data.region)
            console.log('Saving regional data:', data.region);
            data.region.dgs.name = document.getElementById('region-dgs').textContent;
            data.region.pib = document.getElementById('region-pib').textContent;
            data.region.population = document.getElementById('region-pop').textContent;
            data.region.communes = parseInt(document.getElementById('region-communes').textContent) || 0;
            data.region.cci_count = parseInt(document.getElementById('region-cci').textContent) || 0;
        }
        saveData();
        renderDeptGrid();
        alert('Modifications enregistrées localement.');
    }
}

// Events
document.getElementById('back-btn').onclick = backToDashboard;
document.getElementById('back-region-btn').onclick = backToDashboard;
document.getElementById('region-btn').onclick = showRegionFiche;
document.getElementById('quiz-submit').onclick = checkAnswer;
document.getElementById('edit-btn').onclick = () => toggleEdit('edit-btn');
document.getElementById('edit-btn-region').onclick = () => toggleEdit('edit-btn-region');
document.getElementById('quiz-input').onkeypress = (e) => {
    if (e.key === 'Enter') checkAnswer();
};

function setupAuthEvents() {
    console.log('Initializing Auth Events...');

    const safeClick = (id, callback) => {
        const el = document.getElementById(id);
        if (el) el.onclick = (e) => {
            console.log(`Click event on #${id}`);
            e.preventDefault();
            callback(e);
        };
        else console.warn(`Element #${id} not found for click assignment`);
    };

    safeClick('to-register', () => showAuthView('register-view'));
    safeClick('to-login-from-reg', () => showAuthView('login-view'));
    safeClick('to-forgot', () => showAuthView('forgot-view'));
    safeClick('to-login-from-forgot', () => showAuthView('login-view'));

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => {
        console.log('Logging out...');
        sessionStorage.removeItem('currentUser');
        currentUser = null;
        checkAuth();
    };

    const registerForm = document.getElementById('register-form');
    if (registerForm) registerForm.onsubmit = (e) => {
        e.preventDefault();
        console.log('Registration attempt...');
        const name = document.getElementById('register-name').value;
        const email = document.getElementById('register-email').value;
        const password = document.getElementById('register-password').value;

        console.log('Details:', { name, email, passLength: password.length });

        if (users.find(u => u.email === email)) {
            console.warn('Registration: Email already exists');
            alert('Cet identifiant est déjà utilisé.');
            return;
        }

        users.push({ name, email, password });
        localStorage.setItem('carnetUsers', JSON.stringify(users));
        console.log('Registration: Success. New user count:', users.length);
        alert('Inscription réussie ! Vous pouvez vous connecter.');
        showAuthView('login-view');
    };

    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.onsubmit = (e) => {
        e.preventDefault();
        console.log('Login attempt...');
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        // Shortcut for local dev
        if (email === 'admin' && password === 'admin') {
            console.log('Login: ADMIN shortcut used');
            currentUser = { name: 'Administrateur', email: 'admin' };
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            checkAuth();
            return;
        }

        console.log('Check against users:', users);
        const user = users.find(u => u.email === email && u.password === password);
        if (user) {
            console.log('Login: Match found');
            currentUser = user;
            sessionStorage.setItem('currentUser', JSON.stringify(currentUser));
            checkAuth();
        } else {
            console.error('Login: Invalid credentials');
            alert('Identifiant ou mot de passe incorrect. Assurez-vous d\'avoir créé un compte ou utilisez admin/admin.');
        }
    };

    const forgotForm = document.getElementById('forgot-form');
    if (forgotForm) forgotForm.onsubmit = (e) => {
        e.preventDefault();
        const email = document.getElementById('forgot-email').value;
        console.log('Forgot Password: Submission for', email);
        alert(`Si un compte existe pour ${email}, un lien de réinitialisation a été envoyé (simulation).`);
        showAuthView('login-view');
    };
}

init();
