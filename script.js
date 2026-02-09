let data = {};
let marseilleData = null;

let personalData = JSON.parse(localStorage.getItem('personalData') || '[]');
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
        // Update admin password in localStorage if exists
        const adminIdx = users.findIndex(u => u.email === 'admin');
        if (adminIdx !== -1 && users[adminIdx].password !== 'drgpaca2026') {
            users[adminIdx].password = 'drgpaca2026';
            localStorage.setItem('carnetUsers', JSON.stringify(users));
            console.log('Security: Admin password updated.');
        }

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

        // Load Marseille data
        try {
            // Try to load local Marseille data first
            const localMarseille = JSON.parse(localStorage.getItem('marseilleData'));

            if (localMarseille) {
                marseilleData = localMarseille;
                console.log('Marseille data loaded from localStorage');
            } else {
                const marseilleResponse = await fetch('./marseille.json');
                marseilleData = await marseilleResponse.json();
                console.log('Marseille data loaded from JSON');
                localStorage.setItem('marseilleData', JSON.stringify(marseilleData));
            }
        } catch (err) {
            console.error('Failed to load Marseille data:', err);
        }
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
    if (marseilleData) {
        localStorage.setItem('marseilleData', JSON.stringify(marseilleData));
    }
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


}

function showRegionFiche() {
    currentDept = null; // Important for toggleEdit logic
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('fiche-view').style.display = 'none';
    document.getElementById('region-view').style.display = 'block';

    const r = data.region;
    const dgsName = r.dgs.name;
    const dgsElem = document.getElementById('region-dgs');
    dgsElem.innerHTML = `
        <div style="display:flex; align-items:center; gap:0.5rem;">
            <div class="person-photo-container" style="width:40px; height:40px; min-width:40px;">
                <img src="${r.dgs.photo || 'broken'}" 
                     class="person-photo ${!r.dgs.photo ? 'broken' : ''}" 
                     alt="${dgsName}"
                     style="width:40px; height:40px;"
                     onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
            </div>
            <div style="display:flex; align-items:center;">
                <span onclick="editPersonComplete('${dgsName.replace(/'/g, "\\'")}', 'Directeur Général des Services', this)"
                      style="cursor: pointer; border-bottom: 1px dotted var(--text-dim);"
                      title="Voir le profil">
                    ${dgsName}
                </span>
                <button onclick="event.stopPropagation(); window.speak('${dgsName.replace(/'/g, "\\'")}. Directeur Général des Services')"
                        style="background:none; border:none; cursor:pointer; font-size:1rem; padding-left:0.5rem;"
                        title="Écouter">
                    🔊
                </button>
            </div>
        </div>
    `;
    document.getElementById('region-pib').textContent = r.pib;
    document.getElementById('region-pop').textContent = r.population;
    document.getElementById('region-communes').textContent = r.communes;
    document.getElementById('region-cci').textContent = r.cci_count;

    // EPCI count
    if (r.epci_count) {
        document.getElementById('region-epci').textContent = r.epci_count;
    }

    // Directeur de cabinet
    if (r.directeur_cabinet) {
        const dcName = `${r.directeur_cabinet.prenom} ${r.directeur_cabinet.name}`;
        const dcElem = document.getElementById('region-directeur-cabinet');
        dcElem.innerHTML = `<div style="display:flex; align-items:center; gap:0.5rem;">
            <div class="person-photo-container" style="width:40px; height:40px; min-width:40px;">
                <img src="${r.directeur_cabinet.photo || 'broken'}" 
                     class="person-photo ${!r.directeur_cabinet.photo ? 'broken' : ''}" 
                     alt="${dcName}"
                     style="width:40px; height:40px;"
                     onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
            </div>
            <div style="display:flex; align-items:center;">
                <span onclick="editPersonComplete('${dcName.replace(/'/g, "\\'")}', 'Directeur de Cabinet', this)"
                      style="cursor: pointer; border-bottom: 1px dotted var(--text);"
                      title="Voir le profil">
                    ${dcName}
                </span>
                <button onclick="event.stopPropagation(); window.speak('${dcName.replace(/'/g, "\\'")}. Directeur de Cabinet')"
                        style="background:none; border:none; cursor:pointer; font-size:1rem; padding-left:0.5rem;"
                        title="Écouter">
                    🔊
                </button>
            </div>
        </div>`;
    }

    // Vice-présidents
    if (r.vice_presidents && r.vice_presidents.length > 0) {
        const vpContainer = document.getElementById('region-vice-presidents');
        vpContainer.innerHTML = '';
        r.vice_presidents.forEach(vp => {
            const vpName = `${vp.prenom} ${vp.name}`;
            const vpDiv = document.createElement('div');
            vpDiv.className = 'vice-president-item';
            vpDiv.style.cursor = 'pointer';
            vpDiv.setAttribute('onclick', `editPersonComplete('${vpName.replace(/'/g, "\\'")}', 'Vice-Président', this)`);
            vpDiv.title = "Voir le profil";

            vpDiv.innerHTML = `
                <div style="display:flex; align-items:center; gap:0.5rem;">
                    <div class="person-photo-container" style="width:40px; height:40px; min-width:40px;">
                        <img src="${vp.photo || 'broken'}" 
                             class="person-photo ${!vp.photo ? 'broken' : ''}" 
                             alt="${vpName}"
                             style="width:40px; height:40px;"
                             onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
                    </div>
                    <div>
                        <div style="display:flex; align-items:center;">
                            <strong>${vpName}</strong>
                            <button onclick="event.stopPropagation(); window.speak('${vpName.replace(/'/g, "\\'")}. Vice-Président. ${vp.competences.replace(/'/g, "\\'")}')"
                                    style="background:none; border:none; cursor:pointer; font-size:1rem; padding-left:0.5rem;"
                                    title="Écouter">
                                🔊
                            </button>
                        </div>
                        <span style="font-size:0.9rem;">${vp.competences}</span>
                    </div>
                </div>
            `;
            vpContainer.appendChild(vpDiv);
        });
    }

    renderPerson('region-president-container', r.president, r.president.party);
}

function showMarseilleFiche() {
    if (!marseilleData || !marseilleData.marseille) {
        alert('Données de Marseille non disponibles');
        return;
    }

    currentDept = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('fiche-view').style.display = 'none';
    document.getElementById('region-view').style.display = 'none';
    document.getElementById('marseille-view').style.display = 'block';

    const m = marseilleData.marseille;

    // Population totale
    document.getElementById('marseille-population').textContent = m.population_totale.toLocaleString();

    // Maire général
    const maireContainer = document.getElementById('marseille-maire-container');
    maireContainer.innerHTML = '';
    if (m.maire_general) {
        const maireCard = document.createElement('div');
        maireCard.style.display = 'flex';
        maireCard.style.alignItems = 'center';
        maireCard.style.gap = '0.5rem';

        maireCard.innerHTML = `
            <div class="person-photo-container">
                 <img src="${m.maire_general.photo || 'broken'}" 
                      class="person-photo ${!m.maire_general.photo ? 'broken' : ''}" 
                      style="width: 40px; height: 40px;"
                      alt="${m.maire_general.nom}"
                      onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
            </div>
            <div style="cursor: pointer;" onclick="editPersonComplete('${m.maire_general.nom.replace(/'/g, "\\'")}', 'Maire de Marseille', this)" title="Voir le profil complet">
                <div style="display: flex; align-items: center; gap: 0.5rem;">
                    <strong>${m.maire_general.nom}</strong>
                </div>
                <span style="font-size: 0.8rem; color: var(--text-dim);">${m.maire_general.parti}</span>
            </div>
        `;
        maireContainer.appendChild(maireCard);
    }

    // Secteurs
    const secteursContainer = document.getElementById('marseille-secteurs-container');
    secteursContainer.innerHTML = '';

    m.secteurs.forEach(secteur => {
        const secteurCard = document.createElement('div');
        secteurCard.className = 'glass';
        secteurCard.style.marginBottom = '1.5rem';
        secteurCard.style.padding = '1.5rem';

        secteurCard.innerHTML = `
            <h3 style="margin-bottom: 1rem;">Secteur ${secteur.numero} - ${secteur.arrondissements.join(' et ')}</h3>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">
                <!-- Maire de secteur -->
                <div class="glass" style="padding: 1rem; cursor: pointer;" onclick="editPersonComplete('${secteur.maire.nom.replace(/'/g, "\\'")}', 'Maire de Secteur', this)">
                    <p style="color: var(--text-dim); font-size: 0.8rem; margin-bottom: 0.5rem;">Maire de secteur</p>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <strong>${secteur.maire.nom}</strong>
                            </div>
                        </div>
                    </div>
                </div>
                
                <!-- Député -->
                <div class="glass" style="padding: 1rem; cursor: pointer;" onclick="editPersonComplete('${secteur.depute.nom.replace(/'/g, "\\'")}', 'Député (Circo ${secteur.depute.circo})', this)">
                    <p style="color: var(--text-dim); font-size: 0.8rem; margin-bottom: 0.5rem;">Député (Circo ${secteur.depute.circo})</p>
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 0.5rem;">
                                <strong>${secteur.depute.nom}</strong>
                            </div>
                            <span style="font-size: 0.8rem; color: var(--text-dim);">${secteur.depute.parti}</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px,1fr)); gay: 1rem; margin-top: 1rem;">
                <div class="glass" style="padding: 0.75rem;">
                    <p style="color: var(--text-dim); font-size: 0.75rem;">Population</p>
                    <p style="font-weight: 700;">${secteur.population.toLocaleString()}</p>
                </div>
                <div class="glass" style="padding: 0.75rem;">
                    <p style="color: var(--text-dim); font-size: 0.75rem;">Taux de chômage</p>
                    <p style="font-weight: 700; color: ${parseFloat(secteur.taux_chomage) > 20 ? '#F87171' : '#4ADE80'};">${secteur.taux_chomage}</p>
                </div>
                <div class="glass" style="padding: 0.75rem;">
                    <p style="color: var(--text-dim); font-size: 0.75rem;">Taux de pauvreté</p>
                    <p style="font-weight: 700; color: ${parseFloat(secteur.taux_pauvrete) > 30 ? '#F87171' : '#4ADE80'};">${secteur.taux_pauvrete}</p>
                </div>
            </div>
            
            <div class="glass" style="padding: 1rem; margin-top: 1rem;">
                <p style="color: var(--text-dim); font-size: 0.8rem; margin-bottom: 0.5rem;">Quartiers principaux</p>
                <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
                    ${secteur.quartiers_principaux.map(q => `
                        <span style="background: rgba(255, 255, 255, 0.1); padding: 0.25rem 0.75rem; border-radius: 12px; font-size: 0.85rem;">${q}</span>
                    `).join('')}
                </div>
            </div>
        `;

        secteursContainer.appendChild(secteurCard);
    });
}

// Text-to-Speech Helper
window.speak = function (text) {
    if (!text) return;
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'fr-FR';

        // Essayer de forcer une voix française de qualité si disponible
        const voices = window.speechSynthesis.getVoices();
        const frVoice = voices.find(v => v.lang.startsWith('fr') || v.lang.includes('fr-FR'));
        if (frVoice) {
            u.voice = frVoice;
        }

        window.speechSynthesis.speak(u);
    } else {
        alert("Synthèse vocale non supportée par votre navigateur.");
    }
};


function renderPerson(containerId, person, title, append = false) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;

    // On garde la photo, même si elle est cassée ou absente
    const photoUrl = person.photo || 'broken';

    const html = `
        <div class="person-card" data-person-name="${person.name}">
            <div class="person-photo-container">
                <img src="${photoUrl}" 
                     class="person-photo ${!person.photo ? 'broken' : ''}" 
                     alt="${person.name}"
                     onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
            </div>
            <div class="person-info">
                <div class="person-name-row" style="display:flex; align-items:center; justify-content:space-between;">
                     <div onclick="editPersonComplete('${person.name.replace(/'/g, "\\'")}', '${title.replace(/'/g, "\\'")}', this)"
                          style="cursor: pointer; flex-grow:1;"
                          title="Voir le profil complet">
                        <strong>${person.name}</strong>
                     </div>
                     <button onclick="event.stopPropagation(); window.speak('${person.name.replace(/'/g, "\\'")}. ${title ? title.replace(/'/g, "\\'") : ''}')"
                             style="background:none; border:none; cursor:pointer; font-size:1.1rem; padding:0 0.2rem;"
                             title="Écouter">
                         🔊
                     </button>
                </div>
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
    document.getElementById('marseille-view').style.display = 'none';
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

    // Créer un tableau de questions beaucoup plus varié
    const questions = [];

    // Questions sur les villes (maires)
    dept.villes_20k.forEach(ville => {
        questions.push({
            q: `Qui est le maire de ${ville.name} ?`,
            a: ville.mayor,
            type: 'person',
            fullName: ville.mayor
        });
    });

    // Questions sur le préfet
    questions.push({
        q: `Qui est le préfet de ${dept.name} ?`,
        a: dept.prefect.name,
        type: 'person',
        fullName: dept.prefect.name
    });

    // Questions sur le président du conseil départemental
    questions.push({
        q: `Qui préside le conseil départemental de ${dept.name} ?`,
        a: dept.president_conseil.name,
        type: 'person',
        fullName: dept.president_conseil.name
    });

    // Questions sur le président de la CDPP
    questions.push({
        q: `Qui préside la CDPP de ${dept.name} ?`,
        a: dept.president_cdpp.name,
        type: 'person',
        fullName: dept.president_cdpp.name
    });

    // Questions sur les sénateurs
    if (dept.senators && dept.senators.length > 0) {
        dept.senators.forEach((senator, idx) => {
            questions.push({
                q: `Nommez un sénateur de ${dept.name}`,
                a: senator.name,
                type: 'person',
                fullName: senator.name
            });
        });
    }

    // Questions sur les députés
    if (dept.deputies && dept.deputies.length > 0) {
        dept.deputies.forEach(deputy => {
            questions.push({
                q: `Qui est le député de la ${deputy.circo}ème circonscription de ${dept.name} ?`,
                a: deputy.name,
                type: 'person',
                fullName: deputy.name
            });
        });
    }

    // Questions de géographie
    dept.villes_20k.forEach(ville => {
        questions.push({
            q: `Dans quel département se trouve la ville de ${ville.name} ?`,
            a: dept.name,
            deptCode: code, // Ajout du code du département
            type: 'place'
        });
    });

    // Questions régionales (parfois)
    if (data.region && Math.random() > 0.7) {
        questions.push({
            q: `Qui préside la région PACA ?`,
            a: data.region.president.name,
            type: 'person',
            fullName: data.region.president.name
        });
        questions.push({
            q: `Qui est le DGS de la région PACA ?`,
            a: data.region.dgs.name,
            type: 'person',
            fullName: data.region.dgs.name
        });
    }

    // Sélectionner une question au hasard
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

    // Pour les questions de département, accepter aussi le code (numéro)
    let isCorrect = false;
    if (currentQuestion.type === 'place' && currentQuestion.deptCode) {
        // Accepter le nom du département OU le code
        isCorrect = (normalizedInput === normalizedAnswer || normalizedAnswer.includes(normalizedInput) && normalizedInput.length > 3) ||
            (input === currentQuestion.deptCode);
    } else {
        // Pour les autres types de questions
        isCorrect = normalizedInput === normalizedAnswer || normalizedAnswer.includes(normalizedInput) && normalizedInput.length > 3;
    }

    if (isCorrect) {
        score++;
        // Afficher le nom complet si c'est une personne
        if (currentQuestion.type === 'person' && currentQuestion.fullName) {
            feedback.textContent = `Correct ! Bravo. La réponse complète est : ${currentQuestion.fullName}`;
        } else if (currentQuestion.type === 'place' && currentQuestion.deptCode) {
            feedback.textContent = `Correct ! Bravo. La réponse complète est : ${currentQuestion.deptCode} - ${currentQuestion.a}`;
        } else {
            feedback.textContent = "Correct ! Bravo.";
        }
        feedback.className = "feedback correct";
    } else {
        if (currentQuestion.type === 'place' && currentQuestion.deptCode) {
            feedback.textContent = `Incorrect. La réponse était : ${currentQuestion.deptCode} - ${currentQuestion.a}`;
        } else {
            feedback.textContent = `Incorrect. La réponse était : ${currentQuestion.a}`;
        }
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

    // Afficher/cacher les boutons d'édition des personnes
    const editPersonButtons = document.querySelectorAll('.edit-person-general-btn');
    editPersonButtons.forEach(btn => {
        btn.style.display = isEditing ? 'inline-flex' : 'none';
    });

    if (!isEditing) {
        if (currentDept) {
            // Save Dept
            const dept = data.departments[currentDept];

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

// Refresh Data Function
async function refreshData() {
    const btn = document.getElementById('refresh-data-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = '⏳ Actualisation...';
    }

    try {
        console.log('Refreshing data from data.json...');

        // Fetch latest data from data.json
        const response = await fetch('./data.json');
        const remoteData = await response.json();

        // Load local edits (preserve user's custom postiers/postal data and region edits)
        const localData = JSON.parse(localStorage.getItem('carnetData') || '{}');

        if (localData.departments) {
            console.log('Merging local edits (postiers/postal data) into fresh remote reference...');
            Object.keys(remoteData.departments).forEach(code => {
                const remoteDept = remoteData.departments[code];
                const localDept = localData.departments[code];

                if (localDept) {
                    // Preserve only editable fields
                    remoteDept.postiers = localDept.postiers;
                    remoteDept.postal_data = localDept.postal_data;
                }
            });
        }

        // Merge regional data edits
        if (localData.region) {
            console.log('Merging local regional edits...');
            Object.keys(localData.region).forEach(key => {
                if (typeof localData.region[key] !== 'object') {
                    remoteData.region[key] = localData.region[key];
                }
            });
            if (localData.region.dgs) remoteData.region.dgs.name = localData.region.dgs.name;
        }

        data = remoteData;
        saveData();

        // Re-render everything
        renderDeptGrid();
        generateQuiz();
        updateStats();

        console.log('Data refresh complete!');
        alert('✅ Données mises à jour avec succès !');

    } catch (err) {
        console.error('Failed to refresh data:', err);
        alert('❌ Échec de la mise à jour. Vérifiez votre connexion.');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = '🔄 Actualiser';
        }
    }
}



// Events
document.getElementById('back-btn').onclick = backToDashboard;
document.getElementById('back-region-btn').onclick = backToDashboard;
document.getElementById('back-marseille-btn').onclick = backToDashboard;
document.getElementById('region-btn').onclick = showRegionFiche;
document.getElementById('marseille-btn').onclick = showMarseilleFiche;
document.getElementById('refresh-data-btn').onclick = refreshData;
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
        if (email === 'admin' && password === 'drgpaca2026') {
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

// Photo and Profile Editing
function editPersonPhoto(personName, wikiUrl) {
    showPersonEditModal(personName, wikiUrl);
}

function editPersonComplete(personName, personTitle, buttonElement) {
    // Trouver la personne dans les données pour obtenir toutes ses informations
    let person = null;
    let personType = null; // 'senator', 'deputy', 'prefect', 'president_conseil', 'president_cdpp', 'mayor', 'region_president'
    let deptCode = null;

    // Chercher dans les départements
    for (const code in data.departments) {
        const dept = data.departments[code];

        // Vérifier les sénateurs
        const senator = dept.senators.find(s => s.name === personName);
        if (senator) {
            person = senator;
            personType = 'senator';
            deptCode = code;
            break;
        }

        // Vérifier les députés
        const deputy = dept.deputies.find(d => d.name === personName);
        if (deputy) {
            person = deputy;
            personType = 'deputy';
            deptCode = code;
            break;
        }

        // Vérifier le préfet
        if (dept.prefect && dept.prefect.name === personName) {
            person = dept.prefect;
            personType = 'prefect';
            deptCode = code;
            break;
        }

        // Vérifier les présidents
        if (dept.president_conseil && dept.president_conseil.name === personName) {
            person = dept.president_conseil;
            personType = 'president_conseil';
            deptCode = code;
            break;
        }

        if (dept.president_cdpp && dept.president_cdpp.name === personName) {
            person = dept.president_cdpp;
            personType = 'president_cdpp';
            deptCode = code;
            break;
        }

        // Vérifier les maires
        const mayor = dept.villes_20k ? dept.villes_20k.find(v => v.mayor === personName) : null;
        if (mayor) {
            person = { name: mayor.mayor, party: mayor.party, photo: mayor.photo || '', wiki: '', linkedin: '' };
            personType = 'mayor';
            deptCode = code;
            break;
        }
    }

    // Vérifier le président de région
    if (!person && data.region && data.region.president && data.region.president.name === personName) {
        person = data.region.president;
        personType = 'region_president';
    }

    // Vérifier Directeur de Cabinet Région
    if (!person && data.region && data.region.directeur_cabinet) {
        const dc = data.region.directeur_cabinet;
        // On compare avec prenom + name car c'est ce qui est passé par le onclick
        if (`${dc.prenom} ${dc.name}` === personName) {
            person = { ...dc, name: `${dc.prenom} ${dc.name}` }; // On adapte l'objet pour l'affichage
            // Mais attention, pour la sauvegarde on a besoin de savoir que c'est le DirCab.
            // personType nous aidera peut-être mais savePersonEdit refait la recherche.
            // On passe l'objet pour l'affichage dans le modal.
            personType = 'region_dircab';
        }
    }

    // Vérifier DGS Région
    if (!person && data.region && data.region.dgs) {
        const dgs = data.region.dgs;
        if (dgs.name === personName) {
            person = dgs;
            personType = 'region_dgs';
        }
    }

    // Vérifier Vice-Présidents Région
    if (!person && data.region && data.region.vice_presidents) {
        const vp = data.region.vice_presidents.find(v => `${v.prenom} ${v.name}` === personName);
        if (vp) {
            person = { ...vp, name: `${vp.prenom} ${vp.name}` };
            personType = 'region_vp';
        }
    }

    // Vérifier les données de Marseille
    if (!person && marseilleData && marseilleData.marseille) {
        const m = marseilleData.marseille;

        // Maire général (au cas où il n'est pas trouvé dans les villes du département)
        if (m.maire_general && m.maire_general.nom === personName) {
            person = m.maire_general;
            personType = 'marseille_maire';
        }

        if (!person && m.secteurs) {
            for (const secteur of m.secteurs) {
                // Maire de secteur
                if (secteur.maire && secteur.maire.nom === personName) {
                    person = secteur.maire;
                    personType = 'marseille_maire_secteur';
                    break;
                }
                // Député de secteur
                if (secteur.depute && secteur.depute.nom === personName) {
                    person = secteur.depute;
                    personType = 'marseille_depute';
                    break;
                }
            }
        }
    }

    // Vérifier dans Ma Fiche Personnelle
    let isPersonal = false;
    if (!person) {
        const p = personalData.find(x => `${x.prenom ? x.prenom + ' ' : ''}${x.name}` === personName);
        if (p) {
            person = p;
            personType = 'personal';
            isPersonal = true;
        }
    }

    if (!person) {
        alert('❌ Personne non trouvée dans les données');
        return;
    }

    // Ouvrir le modal avec toutes les informations
    showPersonEditModalComplete(person, personType, deptCode, personTitle);

    // Ajouter bouton supprimer pour fiche perso
    setTimeout(() => {
        const modalEl = document.getElementById('edit-person-modal');
        if (!modalEl) return;
        const footer = modalEl.querySelector('.modal-footer');
        if (!footer) return;

        const oldBtn = document.getElementById('modal-delete-personal-btn');
        if (oldBtn) oldBtn.remove();

        if (isPersonal) {
            const btn = document.createElement('button');
            btn.id = 'modal-delete-personal-btn';
            btn.innerHTML = '🗑️ Supprimer';
            btn.className = 'btn-secondary';
            btn.style.backgroundColor = '#ff4444';
            btn.style.color = 'white';
            btn.style.marginRight = 'auto';
            btn.type = 'button';
            btn.onclick = (e) => {
                e.preventDefault();
                // Suppression directe via la fonction robuste
                removePersonalContact(person.id);
                closePersonEditModal();
            };
            footer.insertBefore(btn, footer.firstChild);
        }
    }, 50);
}

function showPersonEditModalComplete(person, personType, deptCode, personTitle) {
    const modal = document.getElementById('edit-person-modal');
    if (!modal) {
        createEditPersonModal();
        setTimeout(() => showPersonEditModalComplete(person, personType, deptCode, personTitle), 100);
        return;
    }

    // Pré-remplir le modal avec toutes les informations
    // On s'assure d'afficher le nom complet (Prénom + Nom) pour l'édition
    let displayName = person.name || '';
    if (person.prenom && !displayName.startsWith(person.prenom)) {
        displayName = `${person.prenom} ${displayName}`;
    }
    document.getElementById('edit-person-name').value = displayName;
    document.getElementById('edit-person-function').value = personTitle || person.function || '';
    document.getElementById('edit-person-wiki').value = person.wiki || '';
    document.getElementById('edit-person-linkedin').value = person.linkedin || '';
    document.getElementById('edit-person-photo').value = person.photo || '';

    // Ajouter des champs supplémentaires si nécessaire (parti, circonscription, etc.)
    const extraFieldsContainer = document.getElementById('edit-person-extra-fields');
    if (extraFieldsContainer) {
        let extraFieldsHTML = '';

        if (person.party) {
            extraFieldsHTML += `
                <div class="form-group">
                    <label>Parti politique</label>
                    <input type="text" id="edit-person-party" value="${person.party || ''}" placeholder="Ex: LR, RE, RN, PS...">
                </div>
            `;
        }

        if (person.circo) {
            extraFieldsHTML += `
                <div class="form-group">
                    <label>Circonscription</label>
                    <input type="number" id="edit-person-circo" value="${person.circo || ''}" placeholder="Ex: 1, 2, 3...">
                </div>
            `;
        }

        extraFieldsContainer.innerHTML = extraFieldsHTML;
    }

    // Stocker le type et département pour la sauvegarde
    modal.dataset.personType = personType;
    modal.dataset.deptCode = deptCode || '';
    modal.dataset.originalName = person.name;

    modal.style.display = 'flex';

    // Si il y a une URL Wikipedia, essayer de chercher la photo automatiquement si elle est manquante
    if (person.wiki && !person.photo) {
        searchWikipediaPhoto(person.wiki);
    }
}


function showPersonEditModal(personName, wikiUrl) {
    const modal = document.getElementById('edit-person-modal');
    if (!modal) {
        createEditPersonModal();
        setTimeout(() => showPersonEditModal(personName, wikiUrl), 100);
        return;
    }

    // Pré-remplir le modal
    document.getElementById('edit-person-name').value = personName;
    document.getElementById('edit-person-wiki').value = wikiUrl || '';
    document.getElementById('edit-person-linkedin').value = '';
    document.getElementById('edit-person-photo').value = '';

    modal.style.display = 'flex';

    // Si il y a une URL Wikipedia, essayer de chercher la photo automatiquement
    if (wikiUrl) {
        searchWikipediaPhoto(wikiUrl);
    }
}

async function searchWikipediaPhoto(wikiUrl) {
    if (!wikiUrl || !wikiUrl.includes('wikipedia.org')) return;

    const statusDiv = document.getElementById('photo-search-status');
    statusDiv.textContent = '🔍 Recherche de la photo sur Wikipedia...';
    statusDiv.className = 'photo-search-status searching';

    try {
        // Extraire le titre de la page depuis l'URL
        const pageTitle = decodeURIComponent(wikiUrl.split('/wiki/').pop());

        // Utiliser l'API Wikipedia pour chercher la photo
        const apiUrl = `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&format=json&pithumbsize=300&origin=*`;

        const response = await fetch(apiUrl);
        const result = await response.json();

        const pages = result.query.pages;
        const page = Object.values(pages)[0];

        if (page && page.thumbnail && page.thumbnail.source) {
            // Convertir l'URL en format FilePath pour éviter les problèmes CORS
            const filename = page.thumbnail.source.split('/').pop().replace(/^\d+px-/, '');
            const filePathUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${filename}`;

            document.getElementById('edit-person-photo').value = filePathUrl;
            statusDiv.textContent = '✅ Photo trouvée !';
            statusDiv.className = 'photo-search-status success';
        } else {
            statusDiv.textContent = '⚠️ Aucune photo trouvée sur Wikipedia';
            statusDiv.className = 'photo-search-status warning';
        }
    } catch (error) {
        console.error('Error searching Wikipedia photo:', error);
        statusDiv.textContent = '❌ Erreur lors de la recherche';
        statusDiv.className = 'photo-search-status error';
    }
}

function closePersonEditModal() {
    document.getElementById('edit-person-modal').style.display = 'none';
}

function savePersonEdit() {
    const modal = document.getElementById('edit-person-modal');
    const name = document.getElementById('edit-person-name').value;
    const personFunction = document.getElementById('edit-person-function').value;
    const wiki = document.getElementById('edit-person-wiki').value;
    const linkedin = document.getElementById('edit-person-linkedin').value;
    const photo = document.getElementById('edit-person-photo').value;

    // Récupérer les champs supplémentaires s'ils existent
    const partyInput = document.getElementById('edit-person-party');
    const circoInput = document.getElementById('edit-person-circo');
    const party = partyInput ? partyInput.value : null;
    const circo = circoInput ? parseInt(circoInput.value) : null;

    if (!name) {
        alert('Le nom est obligatoire');
        return;
    }

    // Utiliser l'originalName pour retrouver la personne
    const originalName = modal.dataset.originalName;
    const personType = modal.dataset.personType;

    // Chercher la personne dans toutes les données
    let personFound = false;

    // Chercher dans les départements
    for (const deptCode in data.departments) {
        const dept = data.departments[deptCode];

        // Vérifier les sénateurs
        const senator = dept.senators.find(s => s.name === originalName);
        if (senator) {
            senator.name = name;
            senator.wiki = wiki;
            senator.linkedin = linkedin;
            senator.photo = photo;
            if (party !== null) senator.party = party;
            personFound = true;
            break;
        }

        // Vérifier les députés
        const deputy = dept.deputies.find(d => d.name === originalName);
        if (deputy) {
            deputy.name = name;
            deputy.wiki = wiki;
            deputy.linkedin = linkedin;
            deputy.photo = photo;
            if (party !== null) deputy.party = party;
            if (circo !== null && !isNaN(circo)) deputy.circo = circo;
            personFound = true;
            break;
        }

        // Vérifier le préfet
        if (dept.prefect && dept.prefect.name === originalName) {
            dept.prefect.name = name;
            dept.prefect.wiki = wiki;
            dept.prefect.linkedin = linkedin;
            dept.prefect.photo = photo;
            personFound = true;
            break;
        }

        // Vérifier les présidents
        if (dept.president_conseil && dept.president_conseil.name === originalName) {
            dept.president_conseil.name = name;
            dept.president_conseil.wiki = wiki;
            dept.president_conseil.linkedin = linkedin;
            dept.president_conseil.photo = photo;
            personFound = true;
            break;
        }

        if (dept.president_cdpp && dept.president_cdpp.name === originalName) {
            dept.president_cdpp.name = name;
            dept.president_cdpp.wiki = wiki;
            dept.president_cdpp.linkedin = linkedin;
            dept.president_cdpp.photo = photo;
            personFound = true;
            break;
        }
    }

    // Vérifier le président de région
    if (!personFound && data.region && data.region.president && data.region.president.name === originalName) {
        data.region.president.name = name;
        data.region.president.wiki = wiki;
        data.region.president.linkedin = linkedin;
        data.region.president.photo = photo;
        if (party !== null) data.region.president.party = party;
        personFound = true;
    }

    // Vérifier Directeur de Cabinet Région
    if (!personFound && data.region && data.region.directeur_cabinet) {
        const dc = data.region.directeur_cabinet;
        const currentFullName = `${dc.prenom ? dc.prenom + ' ' : ''}${dc.name}`;

        if (originalName === currentFullName) {
            // On met à jour - On met tout dans name et on vide prenom pour éviter les doublons
            dc.prenom = '';
            dc.name = name;
            dc.wiki = wiki;
            dc.linkedin = linkedin;
            dc.photo = photo;
            personFound = true;
        }
    }

    // Vérifier DGS Région
    if (!personFound && data.region && data.region.dgs && data.region.dgs.name === originalName) {
        data.region.dgs.name = name;
        data.region.dgs.wiki = wiki;
        data.region.dgs.linkedin = linkedin;
        data.region.dgs.photo = photo;
        personFound = true;
    }

    // Vérifier Vice-Présidents Région
    if (!personFound && data.region && data.region.vice_presidents) {
        const vp = data.region.vice_presidents.find(v => {
            const vName = `${v.prenom ? v.prenom + ' ' : ''}${v.name}`;
            return vName === originalName;
        });

        if (vp) {
            vp.prenom = '';
            vp.name = name;
            vp.wiki = wiki;
            vp.linkedin = linkedin;
            vp.photo = photo;
            // On garde les compétences existantes
            personFound = true;
        }
    }

    // Vérifier les données de Marseille
    if (!personFound && marseilleData && marseilleData.marseille) {
        const m = marseilleData.marseille;

        // Maire général
        if (m.maire_general && m.maire_general.nom === originalName) {
            m.maire_general.nom = name;
            m.maire_general.wiki = wiki;
            m.maire_general.linkedin = linkedin;
            m.maire_general.photo = photo;
            if (party !== null) m.maire_general.party = party;
            personFound = true;
        }

        // Secteurs (Maires et Députés)
        if (!personFound && m.secteurs) {
            for (const secteur of m.secteurs) {
                // Maire de secteur
                if (secteur.maire && secteur.maire.nom === originalName) {
                    secteur.maire.nom = name;
                    secteur.maire.wiki = wiki;
                    secteur.maire.linkedin = linkedin;
                    secteur.maire.photo = photo;
                    if (party !== null) secteur.maire.parti = party;
                    personFound = true;
                    break;
                }
                // Député de secteur
                if (secteur.depute && secteur.depute.nom === originalName) {
                    secteur.depute.nom = name;
                    secteur.depute.wiki = wiki;
                    secteur.depute.linkedin = linkedin;
                    secteur.depute.photo = photo;
                    if (party !== null) secteur.depute.parti = party;
                    if (circo !== null && !isNaN(circo)) secteur.depute.circo = circo;
                    personFound = true;
                    break;
                }
            }
        }
    }


    // Vérifier dans Ma Fiche Personnelle (nouveau)
    if (!personFound) {
        // On cherche par ID si possible, sinon par nom
        const personId = modal.dataset.personId;

        let pIndex = -1;
        if (personId) {
            pIndex = personalData.findIndex(p => p.id == personId);
        } else {
            // Fallback par nom original
            pIndex = personalData.findIndex(p => {
                const fullname = `${p.prenom ? p.prenom + ' ' : ''}${p.name}`;
                return fullname === originalName;
            });
        }

        if (pIndex !== -1) {
            // Mise à jour
            const p = personalData[pIndex];

            // Mise à jour de Prénom et Nom depuis le champ unique "name" (Full Name)
            const inputFullName = name.trim();
            const lastSpace = inputFullName.lastIndexOf(' ');

            if (lastSpace > 0) {
                p.prenom = inputFullName.substring(0, lastSpace);
                p.name = inputFullName.substring(lastSpace + 1);
            } else {
                p.prenom = '';
                p.name = inputFullName;
            }

            p.function = personFunction || p.function;
            p.wiki = wiki;
            p.linkedin = linkedin;
            p.photo = photo;

            localStorage.setItem('personalData', JSON.stringify(personalData));
            personFound = true;

            // Re-render systématique et arrêt pour rester sur la fiche perso
            renderPersonalList();
            closePersonEditModal();
            return;
        }
    }

    if (personFound) {
        saveData(); // Sauvegarder les autres données si besoin (mais personalData est déjà sauvé)
        closePersonEditModal();

        // Recharger la vue actuelle
        // Recharger la vue actuelle en fonction de ce qui est affiché
        if (document.getElementById('marseille-view').style.display === 'block') {
            showMarseilleFiche();
        } else if (document.getElementById('region-view').style.display === 'block') {
            showRegionFiche();
        } else if (document.getElementById('fiche-view').style.display === 'block' && currentDept) {
            showFiche(currentDept);
        } else if (document.getElementById('personal-view').style.display === 'block') {
            renderPersonalList();
        } else {
            // Fallback (par exemple si on était sur le dashboard, ce qui ne devrait pas arriver lors d'une édition)
            showRegionFiche();
        }

        alert('✅ Profil mis à jour avec succès !');
    } else {
        alert('❌ Personne non trouvée dans les données');
    }
}


// --- Personal View Functions ---

function showPersonalView() {
    currentDept = null;
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('fiche-view').style.display = 'none';
    document.getElementById('region-view').style.display = 'none';
    document.getElementById('marseille-view').style.display = 'none';

    document.getElementById('personal-view').style.display = 'block';

    renderPersonalList();
}

function addPersonalContact() {
    const prenom = document.getElementById('personal-firstname').value.trim();
    const nom = document.getElementById('personal-lastname').value.trim();
    const role = document.getElementById('personal-role').value.trim();

    if (!nom || !role) {
        alert('Nom et Fonction sont obligatoires.');
        return;
    }

    const newPerson = {
        id: Date.now(),
        prenom,
        name: nom,
        function: role,
        photo: '',
        wiki: '',
        linkedin: ''
    };

    personalData.push(newPerson);
    localStorage.setItem('personalData', JSON.stringify(personalData));

    // Reset form
    document.getElementById('personal-firstname').value = '';
    document.getElementById('personal-lastname').value = '';
    document.getElementById('personal-role').value = '';

    renderPersonalList();
}

function renderPersonalList() {
    const container = document.getElementById('personal-list-container');
    if (!container) return;
    container.innerHTML = '';

    // Bouton de secours
    if (personalData && personalData.length > 0) {
        const headerDiv = document.createElement('div');
        headerDiv.style.gridColumn = '1/-1';
        headerDiv.style.textAlign = 'right';
        headerDiv.style.marginBottom = '1rem';
        headerDiv.innerHTML = `<button onclick="if(confirm('Tout supprimer ?')) { personalData=[]; localStorage.setItem('personalData', '[]'); renderPersonalList(); }" style="color:#ff6b6b; border:1px solid #ff6b6b; background:none; padding:0.5rem; border-radius:4px; cursor:pointer;">⚠️ Vider ma liste</button>`;
        container.appendChild(headerDiv);
    }

    if (personalData.length === 0) {
        container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-dim); font-style: italic;">Aucun contact pour le moment.</p>`;
        return;
    }

    personalData.forEach(p => {
        const fullname = `${p.prenom ? p.prenom + ' ' : ''}${p.name}`;
        const photoUrl = p.photo || 'broken';

        const card = document.createElement('div');
        card.className = 'glass';
        card.style.padding = '1rem';
        card.style.position = 'relative';

        card.innerHTML = `
            <div style="display:flex; align-items:center; gap:1rem;">
                <div class="person-photo-container">
                    <img src="${photoUrl}" 
                         class="person-photo ${!p.photo ? 'broken' : ''}" 
                         alt="${fullname}"
                         onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
                </div>
                <div style="flex: 1;">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <div style="font-weight:bold; font-size:1.1rem; cursor:pointer;" 
                             onclick="editPersonComplete('${fullname.replace(/'/g, "\\'")}', '${p.function.replace(/'/g, "\\'")}', this); document.getElementById('edit-person-modal').dataset.personId = '${p.id}'"
                             title="Éditer / Voir">
                            ${fullname}
                        </div>
                        <button onclick="event.stopPropagation(); window.speak('${fullname.replace(/'/g, "\\'")}. ${p.function ? p.function.replace(/'/g, "\\'") : ''}')"
                                style="background:none; border:none; cursor:pointer; font-size:1.2rem; margin-left:0.5rem;"
                                title="Écouter">
                            🔊
                        </button>
                    </div>
                    <div style="font-size:0.9rem; color:var(--text-dim); margin-top:0.2rem;">${p.function}</div>
                </div>
            </div>
            
            <div style="margin-top:0.8rem; display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:0.8rem;">
                    ${p.wiki ? `<a href="${p.wiki}" target="_blank" style="font-size:0.8rem;">Wiki</a>` : '<span style="font-size:0.8rem; opacity:0.5;">Wiki</span>'}
                </div>
                <div style="display:flex; gap:0.5rem;">
                    <button type="button" onclick="event.preventDefault(); event.stopPropagation(); removePersonalContact('${p.id}')"
                            style="font-size:0.75rem; padding:0.2rem 0.6rem; background:rgba(220,50,50,0.9); color:white; border:none; border-radius:4px; cursor:pointer;"
                            title="Supprimer ce contact">
                        🗑️ Supprimer
                    </button>
                    <button onclick="autoFillMissingInfo('${fullname.replace(/'/g, "\\'")}', ${p.id}).then(() => { localStorage.setItem('personalData', JSON.stringify(personalData)); renderPersonalList(); })" 
                            style="font-size:0.75rem; padding:0.2rem 0.6rem; background:rgba(255,255,255,0.1); border:none; border-radius:4px; cursor:pointer;">
                        🔄 Actualiser
                    </button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function removePersonalContact(idArg) {
    // Suppression immédiate car popup instable

    // Récupération et nettoyage direct du localStorage
    let rawData = localStorage.getItem('personalData');
    if (!rawData) rawData = '[]';

    try {
        let list = JSON.parse(rawData);
        const originalLength = list.length;

        // Filtrage robuste (comparaison souple pour string/number)
        let newList = list.filter(p => p.id != idArg);

        if (list.length === newList.length) {
            alert("Erreur technique : Ce contact semble déjà supprimé ou introuvable (ID: " + idArg + ")");
        } else {
            localStorage.setItem('personalData', JSON.stringify(newList));
            // Mise à jour de la variable globale au passage
            if (typeof personalData !== 'undefined') personalData = newList;

            // Mise à jour visuelle immédiate
            renderPersonalList();
        }
    } catch (e) {
        alert("Erreur lors de la suppression : " + e.message);
    }
}

async function autoFillMissingInfo(personName, personId = null) {
    let statusDiv = document.getElementById('photo-search-status');
    // Si statusDiv existe (modal ouvert), on l'utilise. Sinon on log

    if (statusDiv) {
        statusDiv.textContent = '⏳ Recherche Wiki & Photo...';
        statusDiv.className = 'photo-search-status';
    }

    try {
        console.log(`Searching Wiki for: ${personName}`);
        const searchUrl = `https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(personName)}&limit=1&namespace=0&format=json&origin=*`;
        const searchRes = await fetch(searchUrl).then(r => r.json());

        if (searchRes[1] && searchRes[1].length > 0) {
            const wikiTitle = searchRes[1][0];
            const wikiUrl = searchRes[3][0];
            console.log(`Found Wiki: ${wikiTitle} -> ${wikiUrl}`);

            if (document.getElementById('edit-person-wiki')) {
                document.getElementById('edit-person-wiki').value = wikiUrl;
            }

            // Chercher photo
            const photoApiUrl = `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageimages&format=json&pithumbsize=500&origin=*`;
            const photoRes = await fetch(photoApiUrl).then(r => r.json());

            const pages = photoRes.query.pages;
            const pageId = Object.keys(pages)[0];

            let photoUrl = '';
            if (pageId !== "-1" && pages[pageId].thumbnail) {
                photoUrl = pages[pageId].thumbnail.source;
                console.log(`Found Photo: ${photoUrl}`);

                if (document.getElementById('edit-person-photo')) {
                    document.getElementById('edit-person-photo').value = photoUrl;
                }
            } else {
                console.log('No photo found on Wiki page.');
            }

            // Mise à jour objet si ID fourni
            if (personId) {
                const p = personalData.find(x => x.id === personId);
                if (p) {
                    // Mise à jour intelligente Prénom / Nom
                    const lastSpaceIndex = wikiTitle.lastIndexOf(' ');
                    if (lastSpaceIndex > 0) {
                        p.prenom = wikiTitle.substring(0, lastSpaceIndex);
                        p.name = wikiTitle.substring(lastSpaceIndex + 1);
                    } else {
                        p.prenom = '';
                        p.name = wikiTitle;
                    }

                    p.wiki = wikiUrl;
                    if (photoUrl) p.photo = photoUrl;
                }
            }

            if (statusDiv) {
                statusDiv.innerHTML = photoUrl ? '✅ Infos trouvées !' : '⚠️ Wiki trouvé sans photo.';
                statusDiv.className = photoUrl ? 'photo-search-status success' : 'photo-search-status warning';
            }
            return true;
        } else {
            console.log('No Wiki page found.');
            if (statusDiv) {
                statusDiv.textContent = '❌ Aucune page trouvée.';
                statusDiv.className = 'photo-search-status error';
            }
            return false;
        }
    } catch (e) {
        console.error(e);
        if (statusDiv) {
            statusDiv.textContent = '❌ Erreur connexion.';
            statusDiv.className = 'photo-search-status error';
        }
        return false;
    }
}

async function autoCompleteAll() {
    const btn = document.getElementById('auto-complete-all-btn');
    if (btn) btn.disabled = true; btn.textContent = '⏳ En cours...';

    let count = 0;
    for (const p of personalData) {
        // On ne cherche que si incomplet
        if (!p.wiki || !p.photo) {
            const fullname = `${p.prenom ? p.prenom + ' ' : ''}${p.name}`;
            await autoFillMissingInfo(fullname, p.id);
            count++;
            // Pause pour éviter rate limit
            await new Promise(r => setTimeout(r, 500));
        }
    }

    localStorage.setItem('personalData', JSON.stringify(personalData));
    renderPersonalList();

    if (btn) btn.disabled = false; btn.textContent = '⚡ Tout Actualiser';
    alert(`Mise à jour terminée !`);
}


function createEditPersonModal() {
    const modal = document.createElement('div');
    modal.id = 'edit-person-modal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content glass" style="max-width: 500px;">
            <div class="modal-header">
                <h2>✏️ Profil & Édition</h2>
                <div style="display:flex; gap:1rem; align-items:center;">
                    <button onclick="const name = document.getElementById('edit-person-name').value; autoFillMissingInfo(name);" 
                            class="back-btn" 
                            style="font-size:0.8rem; padding:0.3rem 0.6rem; background:rgba(255,255,255,0.2);">
                        🔄 Actualiser infos
                    </button>
                    <button onclick="closePersonEditModal()" class="close-btn" style="background:none; border:none; color:white; font-size:1.5rem; cursor:pointer;">×</button>
                </div>
            </div>
            <div class="modal-body">
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block; margin-bottom:0.5rem; color:var(--text-dim);">Nom complet</label>
                    <input type="text" id="edit-person-name" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px;">
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block; margin-bottom:0.5rem; color:var(--text-dim);">Fonction</label>
                    <input type="text" id="edit-person-function" placeholder="Ex: Maire de..., Député, Préfet..." style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px;">
                </div>
                
                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block; margin-bottom:0.5rem; color:var(--text-dim);">Lien Wikipedia</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="url" id="edit-person-wiki" placeholder="https://fr.wikipedia.org/wiki/..." style="flex: 1; padding:0.5rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px;">
                        <button onclick="const url = document.getElementById('edit-person-wiki').value; if(url) window.open(url, '_blank')" 
                                title="Ouvrir le lien" style="padding: 0.5rem; background: rgba(255,255,255,0.2); border: none; border-radius: 4px; cursor: pointer;">🔗</button>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block; margin-bottom:0.5rem; color:var(--text-dim);">Lien LinkedIn</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="url" id="edit-person-linkedin" placeholder="https://linkedin.com/in/..." style="flex: 1; padding:0.5rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px;">
                        <button onclick="const url = document.getElementById('edit-person-linkedin').value; if(url) window.open(url, '_blank')" 
                                title="Ouvrir le lien" style="padding: 0.5rem; background: #0077b5; color: white; border: none; border-radius: 4px; cursor: pointer;">in</button>
                    </div>
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label style="display:block; margin-bottom:0.5rem; color:var(--text-dim);">URL de la photo</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input type="url" id="edit-person-photo" placeholder="https://..." style="flex: 1; padding:0.5rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px;">
                        <button onclick="const url = document.getElementById('edit-person-photo').value; if(url) window.open(url, '_blank')" 
                                title="Voir la photo" style="padding: 0.5rem; background: rgba(255,255,255,0.2); border: none; border-radius: 4px; cursor: pointer;">🖼️</button>
                    </div>
                    <div id="photo-search-status" class="photo-search-status" style="margin-top: 0.5rem; font-size: 0.8rem;"></div>
                </div>
                
                <!-- Conteneur pour les champs supplémentaires (parti, circo, etc.) -->
                <div id="edit-person-extra-fields"></div>
            </div>
            <div class="modal-footer" style="margin-top: 1.5rem; display: flex; justify-content: flex-end; gap: 1rem;">
                <button onclick="closePersonEditModal()" class="btn-secondary">Fermer</button>
                <button onclick="savePersonEdit()" class="btn-primary">💾 Enregistrer</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

init();

// Exposer les fonctions dans l'espace global pour les onclick HTML (nécessaire car type="module")
window.showFiche = showFiche;
window.showRegionFiche = showRegionFiche;
window.showMarseilleFiche = showMarseilleFiche;
window.editPersonPhoto = editPersonPhoto;
window.editPersonComplete = editPersonComplete;
window.closePersonEditModal = closePersonEditModal;
window.savePersonEdit = savePersonEdit;
window.showPersonalView = showPersonalView;
window.addPersonalContact = addPersonalContact;
window.removePersonalContact = removePersonalContact;
window.autoFillMissingInfo = autoFillMissingInfo;
window.autoCompleteAll = autoCompleteAll;

// Events Personal
const personalBtn = document.getElementById('personal-search-btn');
if (personalBtn) personalBtn.onclick = showPersonalView;

const addPersonalBtn = document.getElementById('add-personal-btn');
if (addPersonalBtn) addPersonalBtn.onclick = addPersonalContact;

const backPersonalBtn = document.getElementById('back-personal-btn');
if (backPersonalBtn) backPersonalBtn.onclick = backToDashboard;

const autoCompleteBtn = document.getElementById('auto-complete-all-btn');
if (autoCompleteBtn) autoCompleteBtn.onclick = autoCompleteAll;
