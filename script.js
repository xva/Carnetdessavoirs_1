let data = {};
let marseilleData = null;


let users = JSON.parse(localStorage.getItem('carnetUsers') || '[]');
let currentUser = JSON.parse(localStorage.getItem('rememberedUser') || sessionStorage.getItem('currentUser') || 'null');
let currentDept = null;
let currentQuestion = null;
let score = 0;
let totalAsked = 0;

// Initialize
async function init() {
    console.log('--- Initializing Application ---');

    try {
        // Update admin password in localStorage if exists
        const adminIdx = users.findIndex(u => u.email === 'drg');
        if (adminIdx !== -1 && users[adminIdx].password !== 'paca') {
            users[adminIdx].password = 'paca';
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
    renderPerson('fiche-pres-cdpp', dept.president_cdpp, 'Président CDPPT');

    // Parlementaires
    const senatorsContainer = document.getElementById('fiche-senators');
    senatorsContainer.innerHTML = '';
    dept.senators.forEach(s => renderPerson(senatorsContainer, s, s.party, true));

    const deputiesContainer = document.getElementById('fiche-deputies');
    deputiesContainer.innerHTML = '';
    dept.deputies.forEach(d => renderPerson(deputiesContainer, d, `${d.party} - Circo ${d.circo}`, true));

    // Villes
    renderVilles(code);
}

function renderVilles(code) {
    const dept = data.departments[code];
    const villesContainer = document.getElementById('fiche-villes');
    villesContainer.innerHTML = '';
    dept.villes_20k.forEach((v, idx) => {
        const div = document.createElement('div');
        div.className = 'glass ville-card';
        div.style.padding = '0.75rem';
        div.style.position = 'relative';
        div.innerHTML = `
            <div class="ville-card-content">
                <strong>${v.name}</strong><br>
                <span style="font-size: 0.8rem; color: var(--text-dim);">${v.pop.toLocaleString()} hab.</span><br>
                Maire: ${v.mayor} (${v.party})
            </div>
            <div class="ville-edit-actions" style="display: ${isEditing ? 'flex' : 'none'}; gap: 0.4rem; position: absolute; top: 0.5rem; right: 0.5rem;">
                <button class="ville-edit-btn" onclick="editVille('${code}', ${idx})" title="Modifier">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="ville-delete-btn" onclick="deleteVille('${code}', ${idx})" title="Supprimer">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        `;
        villesContainer.appendChild(div);
    });

    // Bouton Ajouter une ville (visible seulement en mode édition)
    const addBtn = document.createElement('div');
    addBtn.className = 'glass ville-add-card';
    addBtn.id = 'add-ville-btn';
    addBtn.style.display = isEditing ? 'flex' : 'none';
    addBtn.style.padding = '0.75rem';
    addBtn.style.cursor = 'pointer';
    addBtn.style.alignItems = 'center';
    addBtn.style.justifyContent = 'center';
    addBtn.style.minHeight = '80px';
    addBtn.style.border = '2px dashed rgba(255,255,255,0.15)';
    addBtn.style.transition = 'all 0.3s ease';
    addBtn.innerHTML = `<span style="font-size: 1.5rem; opacity: 0.5;">➕</span><span style="margin-left: 0.5rem; color: var(--text-dim);">Ajouter une ville</span>`;
    addBtn.onclick = () => editVille(code, -1); // -1 = nouvelle ville
    villesContainer.appendChild(addBtn);
}

async function refreshVilleData(cityName) {
    const statusDiv = document.getElementById('ville-refresh-status');
    if (!cityName) {
        cityName = document.getElementById('edit-ville-name')?.value?.trim();
    }
    if (!cityName) {
        if (statusDiv) { statusDiv.textContent = '⚠️ Entrez un nom de ville d\'abord.'; statusDiv.className = 'ville-refresh-status warning'; }
        return;
    }

    const refreshBtn = document.getElementById('ville-refresh-btn');
    if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = '⏳ Recherche...'; }
    if (statusDiv) { statusDiv.textContent = '🔍 Recherche sur Wikipedia...'; statusDiv.className = 'ville-refresh-status'; }

    try {
        // Step 1: Search Wikipedia — try the city name directly first, then with "commune"
        let wikiTitle = null;
        const searchVariants = [cityName, cityName + ' commune', cityName + ' (commune)'];

        for (const searchTerm of searchVariants) {
            const searchUrl = `https://fr.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(searchTerm)}&limit=5&namespace=0&format=json&origin=*`;
            const searchRes = await fetch(searchUrl).then(r => r.json());

            if (searchRes[1] && searchRes[1].length > 0) {
                // Find best match — prefer exact or close match, skip disambiguation pages
                for (const title of searchRes[1]) {
                    if (title.includes('(homonymie)')) continue;
                    if (title.toLowerCase() === cityName.toLowerCase() ||
                        title.toLowerCase().startsWith(cityName.toLowerCase())) {
                        wikiTitle = title;
                        break;
                    }
                }
                if (!wikiTitle) wikiTitle = searchRes[1][0];
                if (wikiTitle) break;
            }
        }

        if (!wikiTitle) {
            if (statusDiv) { statusDiv.textContent = '❌ Aucune page Wikipedia trouvée.'; statusDiv.className = 'ville-refresh-status error'; }
            return;
        }

        if (statusDiv) { statusDiv.textContent = `📖 Page trouvée : ${wikiTitle}. Recherche Wikidata...`; }

        // Step 2: Get Wikidata entity ID from Wikipedia
        const wikiDataUrl = `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=pageprops&format=json&origin=*`;
        const wikiDataRes = await fetch(wikiDataUrl).then(r => r.json());
        const pages = wikiDataRes.query.pages;
        const wpPageId = Object.keys(pages)[0];
        const wikidataId = pages[wpPageId]?.pageprops?.wikibase_item;

        let foundMayor = null;
        let foundPop = null;
        let foundParty = null;

        // Step 3: Use Wikidata REST API (more reliable than SPARQL)
        if (wikidataId) {
            if (statusDiv) { statusDiv.textContent = `🔗 Wikidata ${wikidataId} — récupération maire & population...`; }

            const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wikidataId}.json`;
            try {
                const entityRes = await fetch(entityUrl).then(r => r.json());
                const entity = entityRes.entities?.[wikidataId];

                if (entity) {
                    // Population (P1082) — get the most recent value
                    const popClaims = entity.claims?.P1082;
                    if (popClaims && popClaims.length > 0) {
                        let latestPop = null;
                        let latestDate = '';
                        for (const claim of popClaims) {
                            const popVal = claim.mainsnak?.datavalue?.value?.amount;
                            // Get the point in time qualifier (P585)
                            const qualifiers = claim.qualifiers?.P585;
                            const dateVal = qualifiers?.[0]?.datavalue?.value?.time || '';
                            if (!latestPop || dateVal > latestDate) {
                                latestPop = popVal;
                                latestDate = dateVal;
                            }
                        }
                        if (latestPop) {
                            foundPop = parseInt(latestPop.replace('+', ''));
                        }
                    }

                    // Mayor / Head of government (P6) — find the current one (no end date P582)
                    const mayorClaims = entity.claims?.P6;
                    if (mayorClaims && mayorClaims.length > 0) {
                        let currentMayorId = null;
                        for (const claim of mayorClaims) {
                            // Check if this mandate has ended (qualifier P582 = end date)
                            const endQualifiers = claim.qualifiers?.P582;
                            if (endQualifiers && endQualifiers.length > 0) continue; // mandate ended
                            currentMayorId = claim.mainsnak?.datavalue?.value?.id;
                        }
                        // If no current mayor found, take the last one
                        if (!currentMayorId && mayorClaims.length > 0) {
                            currentMayorId = mayorClaims[mayorClaims.length - 1].mainsnak?.datavalue?.value?.id;
                        }

                        if (currentMayorId) {
                            if (statusDiv) { statusDiv.textContent = `👤 Maire trouvé (${currentMayorId}). Récupération du nom...`; }
                            // Fetch mayor's name and party
                            const mayorUrl = `https://www.wikidata.org/wiki/Special:EntityData/${currentMayorId}.json`;
                            const mayorRes = await fetch(mayorUrl).then(r => r.json());
                            const mayorEntity = mayorRes.entities?.[currentMayorId];

                            if (mayorEntity) {
                                // Mayor name
                                const frLabel = mayorEntity.labels?.fr?.value || mayorEntity.labels?.en?.value;
                                if (frLabel) foundMayor = frLabel;

                                // Mayor's party (P102)
                                const partyClaims = mayorEntity.claims?.P102;
                                if (partyClaims && partyClaims.length > 0) {
                                    // Get the most recent party (the last one without end date)
                                    let currentPartyId = null;
                                    for (const pc of partyClaims) {
                                        const endQ = pc.qualifiers?.P582;
                                        if (endQ && endQ.length > 0) continue;
                                        currentPartyId = pc.mainsnak?.datavalue?.value?.id;
                                    }
                                    if (!currentPartyId) {
                                        currentPartyId = partyClaims[partyClaims.length - 1].mainsnak?.datavalue?.value?.id;
                                    }
                                    if (currentPartyId) {
                                        const partyUrl = `https://www.wikidata.org/wiki/Special:EntityData/${currentPartyId}.json`;
                                        const partyRes = await fetch(partyUrl).then(r => r.json());
                                        const partyEntity = partyRes.entities?.[currentPartyId];
                                        foundParty = partyEntity?.labels?.fr?.value || partyEntity?.labels?.en?.value;
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (wdErr) {
                console.warn('Wikidata REST API failed:', wdErr);
            }
        }

        // Step 4: Fallback — Parse Wikipedia page text
        if (!foundPop || !foundMayor) {
            if (statusDiv) { statusDiv.textContent = `📄 Extraction depuis le texte Wikipedia...`; }
            const extractUrl = `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(wikiTitle)}&prop=extracts&exintro=true&explaintext=true&format=json&origin=*`;
            const extractRes = await fetch(extractUrl).then(r => r.json());
            const extractPages = extractRes.query.pages;
            const extractPageId = Object.keys(extractPages)[0];
            const extract = extractPages[extractPageId]?.extract || '';

            if (!foundPop) {
                const popMatch = extract.match(/(\d[\d\s\u00a0]*)[\s\u00a0]*habitants/);
                if (popMatch) {
                    foundPop = parseInt(popMatch[1].replace(/[\s\u00a0]/g, ''));
                }
            }
            if (!foundMayor) {
                const mayorMatch = extract.match(/maire[^.]*?est\s+([A-ZÀ-Ü][a-zà-ÿ]+(?:\s+[A-ZÀ-Ü][a-zà-ÿ]+)+)/i);
                if (mayorMatch) {
                    foundMayor = mayorMatch[1];
                }
            }
        }

        // Step 5: Apply found data to form fields
        let updates = [];
        if (foundMayor) {
            document.getElementById('edit-ville-mayor').value = foundMayor;
            updates.push(`Maire : ${foundMayor}`);
        }
        if (foundPop) {
            document.getElementById('edit-ville-pop').value = foundPop;
            updates.push(`Population : ${foundPop.toLocaleString('fr-FR')}`);
        }
        if (foundParty) {
            const partyAbbreviations = {
                'Rassemblement national': 'RN',
                'Les Républicains': 'LR',
                'Parti socialiste': 'PS',
                'La République en marche': 'LREM',
                'Renaissance': 'RE',
                'Europe Écologie Les Verts': 'EELV',
                'Parti communiste français': 'PCF',
                'La France insoumise': 'LFI',
                'Mouvement démocrate': 'MoDem',
                'Union des démocrates et indépendants': 'UDI',
                'Divers gauche': 'DVG',
                'Divers droite': 'DVD',
                'Divers centre': 'DVC',
                'Horizons': 'HOR',
            };
            const shortParty = partyAbbreviations[foundParty] || foundParty;
            document.getElementById('edit-ville-party').value = shortParty;
            updates.push(`Parti : ${shortParty}`);
        }

        if (updates.length > 0) {
            if (statusDiv) {
                statusDiv.innerHTML = `✅ Données récupérées :<br>${updates.join('<br>')}`;
                statusDiv.className = 'ville-refresh-status success';
            }
        } else {
            if (statusDiv) {
                statusDiv.textContent = '⚠️ Aucune donnée trouvée sur Wikipedia/Wikidata.';
                statusDiv.className = 'ville-refresh-status warning';
            }
        }

    } catch (err) {
        console.error('Error refreshing ville data:', err);
        if (statusDiv) {
            statusDiv.textContent = '❌ Erreur de connexion.';
            statusDiv.className = 'ville-refresh-status error';
        }
    } finally {
        if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '🔄 Actualiser depuis Internet'; }
    }
}

function editVille(deptCode, villeIndex) {
    const dept = data.departments[deptCode];
    const isNew = villeIndex === -1;
    const ville = isNew ? { name: '', pop: 0, mayor: '', party: '' } : dept.villes_20k[villeIndex];

    // Créer ou réutiliser le modal de ville
    let modal = document.getElementById('edit-ville-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'edit-ville-modal';
        modal.className = 'modal';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="modal-content glass">
            <div class="modal-header">
                <h2>${isNew ? '➕ Nouvelle ville' : '✏️ Modifier la ville'}</h2>
                <button class="close-btn" onclick="closeVilleModal()">&times;</button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Nom de la ville</label>
                    <input type="text" id="edit-ville-name" value="${ville.name}" placeholder="Ex: Marseille">
                </div>
                <div class="form-group">
                    <label>Population</label>
                    <input type="number" id="edit-ville-pop" value="${ville.pop}" placeholder="Ex: 870715">
                </div>
                <div class="form-group">
                    <label>Maire</label>
                    <input type="text" id="edit-ville-mayor" value="${ville.mayor}" placeholder="Ex: Benoît Payan">
                </div>
                <div class="form-group">
                    <label>Parti</label>
                    <input type="text" id="edit-ville-party" value="${ville.party}" placeholder="Ex: DVG, LR, RN...">
                </div>
                <div class="ville-refresh-section">
                    <button id="ville-refresh-btn" class="btn-refresh" onclick="refreshVilleData()">🔄 Actualiser depuis Internet</button>
                    <div id="ville-refresh-status" class="ville-refresh-status"></div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" onclick="closeVilleModal()">Annuler</button>
                <button class="btn-primary" onclick="saveVille('${deptCode}', ${villeIndex})">${isNew ? '➕ Ajouter' : '💾 Enregistrer'}</button>
            </div>
        </div>
    `;
    modal.style.display = 'flex';
}

function saveVille(deptCode, villeIndex) {
    const name = document.getElementById('edit-ville-name').value.trim();
    const pop = parseInt(document.getElementById('edit-ville-pop').value) || 0;
    const mayor = document.getElementById('edit-ville-mayor').value.trim();
    const party = document.getElementById('edit-ville-party').value.trim();

    if (!name) {
        alert('Le nom de la ville est obligatoire.');
        return;
    }

    const dept = data.departments[deptCode];
    const villeData = { name, pop, mayor, party };

    if (villeIndex === -1) {
        // Nouvelle ville
        dept.villes_20k.push(villeData);
    } else {
        // Mise à jour
        // Conserver les éventuels champs supplémentaires (photo, etc.)
        dept.villes_20k[villeIndex] = { ...dept.villes_20k[villeIndex], ...villeData };
    }

    saveData();
    closeVilleModal();
    renderVilles(deptCode);
}

function deleteVille(deptCode, villeIndex) {
    const dept = data.departments[deptCode];
    const ville = dept.villes_20k[villeIndex];
    if (!confirm(`Êtes-vous sûr de vouloir supprimer ${ville.name} ?`)) return;
    dept.villes_20k.splice(villeIndex, 1);
    saveData();
    renderVilles(deptCode);
}

function closeVilleModal() {
    const modal = document.getElementById('edit-ville-modal');
    if (modal) modal.style.display = 'none';
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
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="person-photo-container">
                            <img src="${secteur.maire.photo || 'broken'}" 
                                 class="person-photo ${!secteur.maire.photo ? 'broken' : ''}" 
                                 style="width: 40px; height: 40px;"
                                 alt="${secteur.maire.nom}"
                                 onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
                        </div>
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
                    <div style="display: flex; align-items: center; gap: 0.75rem;">
                        <div class="person-photo-container">
                            <img src="${secteur.depute.photo || 'broken'}" 
                                 class="person-photo ${!secteur.depute.photo ? 'broken' : ''}" 
                                 style="width: 40px; height: 40px;"
                                 alt="${secteur.depute.nom}"
                                 onerror="this.classList.add('broken'); this.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'">
                        </div>
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


function showInterestsPopover(personName, interestsText, btnElement) {
    // Remove any existing popover
    const existing = document.getElementById('interests-popover');
    if (existing) existing.remove();

    if (!interestsText) {
        interestsText = 'Aucun centre d\'intérêts renseigné pour cette personne.';
    }

    const popover = document.createElement('div');
    popover.id = 'interests-popover';
    popover.innerHTML = `
        <div class="interests-popover-header">
            <span>💡 ${personName}</span>
            <button onclick="document.getElementById('interests-popover')?.remove()" style="background:none; border:none; color:var(--text-dim, #aaa); cursor:pointer; font-size:1.1rem; line-height:1;">×</button>
        </div>
        <div class="interests-popover-body">${interestsText}</div>
    `;
    document.body.appendChild(popover);

    // Position near the button
    const rect = btnElement.getBoundingClientRect();
    const popW = 320;
    let left = rect.left + rect.width / 2 - popW / 2;
    let top = rect.bottom + 8;

    // Keep within viewport
    if (left < 10) left = 10;
    if (left + popW > window.innerWidth - 10) left = window.innerWidth - popW - 10;
    if (top + 200 > window.innerHeight) {
        top = rect.top - 8; // will be adjusted with transform
        popover.style.transform = 'translateY(-100%)';
    }

    popover.style.left = left + 'px';
    popover.style.top = top + 'px';

    // Close on outside click
    setTimeout(() => {
        function closeHandler(e) {
            if (!popover.contains(e.target) && e.target !== btnElement) {
                popover.remove();
                document.removeEventListener('click', closeHandler);
            }
        }
        document.addEventListener('click', closeHandler);
    }, 10);
}

function renderPerson(containerId, person, title, append = false) {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;

    // On garde la photo, même si elle est cassée ou absente
    const photoUrl = person.photo || 'broken';

    // Build action icons
    const wikiUrl = person.wiki || '';
    const linkedinSearch = `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(person.name)}`;
    const escapedName = person.name.replace(/'/g, "\\'");
    const escapedTitle = title ? title.replace(/'/g, "\\'") : '';

    const interestsText = (person.interests || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

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
                     <div onclick="editPersonComplete('${escapedName}', '${escapedTitle}', this)"
                          style="cursor: pointer; flex-grow:1;"
                          title="Voir le profil complet">
                        <strong>${person.name}</strong>
                     </div>
                     <button onclick="event.stopPropagation(); window.speak('${escapedName}. ${escapedTitle}')"
                             style="background:none; border:none; cursor:pointer; font-size:1.1rem; padding:0 0.2rem;"
                             title="Écouter">
                         🔊
                     </button>
                </div>
                <div class="person-actions">
                    <button class="person-action-icon info-icon" title="Centre d'intérêts" onclick="event.stopPropagation(); showInterestsPopover('${escapedName}', '${interestsText}', this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    </button>
                    <a href="${wikiUrl}" target="_blank" rel="noopener" class="person-action-icon ${!wikiUrl ? 'disabled' : ''}" title="Wikipedia" onclick="event.stopPropagation(); ${!wikiUrl ? 'event.preventDefault();' : ''}">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.09 13.119c-.936 1.932-2.217 4.548-2.853 5.728-.616 1.074-1.127.931-1.532.029-1.406-3.321-4.293-9.144-5.651-12.409-.251-.601-.441-.987-.619-1.139-.181-.15-.554-.24-1.122-.271C.103 5.033 0 4.982 0 4.898v-.455l.052-.045c.924-.005 5.401 0 5.401 0l.051.045v.434c0 .119-.075.176-.225.176l-.564.031c-.485.029-.727.164-.727.436 0 .135.053.33.166.601 1.082 2.646 4.818 10.521 4.818 10.521l2.681-5.476-2.007-4.218c-.253-.543-.489-.993-.71-1.1-.213-.109-.553-.17-1.024-.184-.127-.003-.19-.06-.19-.17v-.46l.048-.044h4.657l.05.044v.434c0 .119-.074.176-.222.176l-.387.02c-.485.029-.749.17-.749.436 0 .135.063.33.174.601l1.807 3.887 1.81-3.674c.112-.27.174-.47.174-.601 0-.266-.238-.407-.714-.436l-.519-.02c-.149 0-.224-.057-.224-.176v-.434l.052-.044h4.024l.052.044v.46c0 .11-.062.167-.189.17-.416.014-.754.075-.972.184-.215.107-.478.557-.726 1.1l-2.205 4.436 2.695 5.502 4.593-10.595c.117-.27.172-.466.172-.601 0-.266-.22-.407-.68-.436l-.637-.02c-.15 0-.224-.057-.224-.176v-.434l.052-.044h4.04l.05.044v.46c0 .11-.063.167-.189.17-.492.014-.862.109-1.107.283-.246.174-.479.555-.701 1.139L13.878 19.05c-.395.846-.891.846-1.287 0l-2.876-5.93h-.001l2.376.001z"/></svg>
                    </a>
                    <a href="${linkedinSearch}" target="_blank" rel="noopener" class="person-action-icon" title="LinkedIn" onclick="event.stopPropagation();">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
                    </a>
                    <button class="person-action-icon" title="Modifier la fiche" onclick="event.stopPropagation(); editPersonComplete('${escapedName}', '${escapedTitle}', this)">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
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
const quizHistory = []; // { key, correct, cooldownUntil }
let quizQuestionCount = 0;

function getQuestionCooldown(questionKey) {
    return quizHistory.find(h => h.key === questionKey);
}

function isQuestionOnCooldown(questionKey) {
    const entry = getQuestionCooldown(questionKey);
    if (!entry) return false;
    return quizQuestionCount < entry.cooldownUntil;
}

function recordQuestionResult(questionKey, wasCorrect) {
    const existing = quizHistory.findIndex(h => h.key === questionKey);
    const cooldown = wasCorrect ? 20 : Math.floor(Math.random() * 3) + 2; // correct: 20, wrong: 2-4
    const entry = { key: questionKey, correct: wasCorrect, cooldownUntil: quizQuestionCount + cooldown };

    if (existing !== -1) {
        quizHistory[existing] = entry;
    } else {
        quizHistory.push(entry);
    }
}

function generateQuiz() {
    if (!data.departments || Object.keys(data.departments).length === 0) {
        console.warn('Cannot generate quiz: no department data');
        return;
    }

    const allQuestions = [];
    const codes = Object.keys(data.departments);

    // Count total senators across all depts for disambiguation
    let totalSenators = 0;
    codes.forEach(c => { if (data.departments[c].senators) totalSenators += data.departments[c].senators.length; });

    codes.forEach(code => {
        const dept = data.departments[code];
        if (!dept) return;

        // Questions sur les villes (maires) - seulement >= 35 000 habitants
        if (dept.villes_20k) {
            dept.villes_20k.forEach(ville => {
                if (ville.pop && ville.pop < 35000) return; // Exclure < 35k
                allQuestions.push({
                    key: `maire_${ville.name}`,
                    q: `Qui est le maire de ${ville.name} ?`,
                    a: ville.mayor,
                    type: 'person',
                    fullName: ville.mayor
                });
            });

            // Questions de géographie - seulement >= 35 000 habitants
            dept.villes_20k.forEach(ville => {
                if (ville.pop && ville.pop < 35000) return;
                allQuestions.push({
                    key: `dept_${ville.name}`,
                    q: `Dans quel département se trouve la ville de ${ville.name} ?`,
                    a: dept.name,
                    deptCode: code,
                    type: 'place'
                });
            });
        }

        // Questions sur le préfet
        if (dept.prefect) {
            allQuestions.push({
                key: `prefet_${code}`,
                q: `Qui est le préfet de ${dept.name} ?`,
                a: dept.prefect.name,
                type: 'person',
                fullName: dept.prefect.name
            });
        }

        // Questions sur le président du conseil départemental
        if (dept.president_conseil) {
            allQuestions.push({
                key: `pres_cd_${code}`,
                q: `Qui préside le conseil départemental de ${dept.name} ?`,
                a: dept.president_conseil.name,
                type: 'person',
                fullName: dept.president_conseil.name
            });
        }

        // Questions sur le président de la CDPPT
        if (dept.president_cdpp) {
            allQuestions.push({
                key: `pres_cdpp_${code}`,
                q: `Qui préside la CDPPT de ${dept.name} ?`,
                a: dept.president_cdpp.name,
                type: 'person',
                fullName: dept.president_cdpp.name
            });
        }

        // Questions sur les sénateurs - préciser le département si plusieurs sénateurs dans la région
        if (dept.senators && dept.senators.length > 0) {
            if (totalSenators > 1) {
                // Plusieurs sénateurs dans la région → préciser le département
                dept.senators.forEach((senator, idx) => {
                    allQuestions.push({
                        key: `senateur_${code}_${idx}`,
                        q: `Nommez un sénateur de ${dept.name}`,
                        a: senator.name,
                        type: 'person',
                        fullName: senator.name,
                        alternatives: dept.senators.map(s => s.name)
                    });
                });
            } else {
                dept.senators.forEach((senator, idx) => {
                    allQuestions.push({
                        key: `senateur_${code}_${idx}`,
                        q: `Nommez un sénateur de ${dept.name}`,
                        a: senator.name,
                        type: 'person',
                        fullName: senator.name,
                        alternatives: dept.senators.map(s => s.name)
                    });
                });
            }
        }

        // Questions sur les députés
        if (dept.deputies && dept.deputies.length > 0) {
            dept.deputies.forEach(deputy => {
                // Question classique: qui est le député de la Xème circo ?
                allQuestions.push({
                    key: `depute_${code}_${deputy.circo}`,
                    q: `Qui est le député de la ${deputy.circo}ème circonscription de ${dept.name} ?`,
                    a: deputy.name,
                    type: 'person',
                    fullName: deputy.name
                });
                // Question inverse: de quel département est ce député ?
                allQuestions.push({
                    key: `depute_dept_${code}_${deputy.circo}`,
                    q: `De quel département est le député ${deputy.name} ?`,
                    a: dept.name,
                    deptCode: code,
                    type: 'place'
                });
            });
        }
    });

    // Questions régionales
    if (data.region) {
        if (data.region.president) {
            allQuestions.push({
                key: 'pres_region',
                q: `Qui préside la région PACA ?`,
                a: data.region.president.name,
                type: 'person',
                fullName: data.region.president.name
            });
        }
        if (data.region.dgs) {
            allQuestions.push({
                key: 'dgs_region',
                q: `Qui est le DGS de la région PACA ?`,
                a: data.region.dgs.name,
                type: 'person',
                fullName: data.region.dgs.name
            });
        }
    }

    // Filter out questions that are on cooldown
    const available = allQuestions.filter(q => !isQuestionOnCooldown(q.key));

    if (available.length === 0) {
        // All questions on cooldown, reset cooldowns
        quizHistory.length = 0;
        currentQuestion = allQuestions[Math.floor(Math.random() * allQuestions.length)];
    } else {
        // Prioritize questions that were answered wrong (low cooldown, closer to expiry)
        const wrongOnes = available.filter(q => {
            const h = getQuestionCooldown(q.key);
            return h && !h.correct;
        });

        if (wrongOnes.length > 0 && Math.random() > 0.3) {
            // 70% chance to prioritize a previously wrong answer
            currentQuestion = wrongOnes[Math.floor(Math.random() * wrongOnes.length)];
        } else {
            currentQuestion = available[Math.floor(Math.random() * available.length)];
        }
    }

    quizQuestionCount++;

    document.getElementById('quiz-question').textContent = currentQuestion.q;
    document.getElementById('quiz-input').value = '';
    document.getElementById('quiz-feedback').style.display = 'none';
}

function checkAnswer() {
    const input = document.getElementById('quiz-input').value.trim();
    const feedback = document.getElementById('quiz-feedback');

    totalAsked++;

    // Normalize comparison
    const normalizedInput = input.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const normalizedAnswer = currentQuestion.a.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Pour les questions de département, accepter aussi le code (numéro)
    let isCorrect = false;
    if (currentQuestion.type === 'place' && currentQuestion.deptCode) {
        isCorrect = (normalizedInput === normalizedAnswer || normalizedAnswer.includes(normalizedInput) && normalizedInput.length > 3) ||
            (input === currentQuestion.deptCode);
    } else if (currentQuestion.alternatives) {
        // Pour les sénateurs: accepter n'importe quel sénateur du département
        isCorrect = currentQuestion.alternatives.some(alt => {
            const normAlt = alt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return normalizedInput === normAlt || (normAlt.includes(normalizedInput) && normalizedInput.length > 3);
        });
    } else {
        isCorrect = normalizedInput === normalizedAnswer || (normalizedAnswer.includes(normalizedInput) && normalizedInput.length > 3);
    }

    // Record result for spaced repetition
    recordQuestionResult(currentQuestion.key, isCorrect);

    if (isCorrect) {
        score++;
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
        } else if (currentQuestion.alternatives) {
            feedback.textContent = `Incorrect. Les réponses acceptées étaient : ${currentQuestion.alternatives.join(', ')}`;
        } else {
            feedback.textContent = `Incorrect. La réponse était : ${currentQuestion.a}`;
        }
        feedback.className = "feedback wrong";
    }

    feedback.style.display = 'block';
    updateStats();

    // Afficher le bouton "Question suivante" au lieu d'avancer automatiquement
    const submitBtn = document.getElementById('quiz-submit');
    const nextBtn = document.getElementById('quiz-next');
    const quizInput = document.getElementById('quiz-input');
    if (submitBtn) submitBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'inline-block';
    if (quizInput) quizInput.disabled = true;
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

    // Afficher/cacher les boutons d'édition des villes
    const villeEditActions = document.querySelectorAll('.ville-edit-actions');
    villeEditActions.forEach(el => {
        el.style.display = isEditing ? 'flex' : 'none';
    });
    const addVilleBtn = document.getElementById('add-ville-btn');
    if (addVilleBtn) addVilleBtn.style.display = isEditing ? 'flex' : 'none';

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
const quizNextBtn = document.getElementById('quiz-next');
if (quizNextBtn) {
    quizNextBtn.onclick = () => {
        const submitBtn = document.getElementById('quiz-submit');
        const nextBtn = document.getElementById('quiz-next');
        const quizInput = document.getElementById('quiz-input');
        if (submitBtn) submitBtn.style.display = 'inline-block';
        if (nextBtn) nextBtn.style.display = 'none';
        if (quizInput) quizInput.disabled = false;
        generateQuiz();
    };
}
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



    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) logoutBtn.onclick = () => {
        console.log('Logging out...');
        sessionStorage.removeItem('currentUser');
        localStorage.removeItem('rememberedUser');
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

        // Admin login
        if (email === 'drg' && password === 'paca') {
            console.log('Login: Admin login');
            currentUser = { name: 'Administrateur', email: 'drg' };
            localStorage.setItem('rememberedUser', JSON.stringify(currentUser));
            checkAuth();
            return;
        }

        console.log('Check against users:', users);
        const user = users.find(u => u.email === email && u.password === password);
        if (user) {
            console.log('Login: Match found');
            currentUser = user;
            localStorage.setItem('rememberedUser', JSON.stringify(currentUser));
            checkAuth();
        } else {
            console.error('Login: Invalid credentials');
            alert('Identifiant ou mot de passe incorrect.');
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

    if (!person) {
        alert('❌ Personne non trouvée dans les données');
        return;
    }

    // Ouvrir le modal avec toutes les informations
    showPersonEditModalComplete(person, personType, deptCode, personTitle);
}

function showPersonEditModalComplete(person, personType, deptCode, personTitle) {
    const modal = document.getElementById('edit-person-modal');
    if (!modal) {
        createEditPersonModal();
        setTimeout(() => showPersonEditModalComplete(person, personType, deptCode, personTitle), 100);
        return;
    }

    const isPersonal = (personType === 'personal');

    // Show/hide the separate prenom field depending on type
    const prenomGroup = document.getElementById('edit-person-prenom-group');
    const nameLabel = document.getElementById('edit-person-name-label');

    if (isPersonal) {
        prenomGroup.style.display = 'block';
        nameLabel.textContent = 'Nom';
        document.getElementById('edit-person-prenom').value = person.prenom || '';
        document.getElementById('edit-person-name').value = person.name || '';
    } else {
        prenomGroup.style.display = 'none';
        nameLabel.textContent = 'Nom complet';
        document.getElementById('edit-person-prenom').value = '';
        let displayName = person.name || '';
        if (person.prenom && !displayName.startsWith(person.prenom)) {
            displayName = `${person.prenom} ${displayName}`;
        }
        document.getElementById('edit-person-name').value = displayName;
    }

    document.getElementById('edit-person-function').value = personTitle || person.function || '';
    document.getElementById('edit-person-wiki').value = person.wiki || '';
    document.getElementById('edit-person-linkedin').value = person.linkedin || '';
    document.getElementById('edit-person-photo').value = person.photo || '';

    // Extra fields (party, circo)
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

    // Centre d'intérêts
    const interestsSection = document.getElementById('edit-person-interests-section');
    const interestsDisplay = document.getElementById('interests-display');
    const interestsTextarea = document.getElementById('edit-person-interests');
    const interestsToggle = document.getElementById('interests-edit-toggle');

    if (interestsSection && interestsDisplay && interestsTextarea) {
        const interests = person.interests || '';
        interestsTextarea.value = interests;

        if (interests) {
            // Mode affichage
            interestsDisplay.textContent = interests;
            interestsDisplay.style.display = 'block';
            interestsTextarea.style.display = 'none';
            interestsSection.style.display = 'block';
            if (interestsToggle) interestsToggle.style.display = 'inline-block';
        } else {
            // Mode édition directe si pas d'intérêts
            interestsDisplay.style.display = 'none';
            interestsTextarea.style.display = 'block';
            interestsSection.style.display = 'block';
            if (interestsToggle) interestsToggle.style.display = 'none';
        }
    }

    // Store metadata for save
    modal.dataset.personType = personType;
    modal.dataset.deptCode = deptCode || '';
    modal.dataset.originalName = person.name;
    modal.dataset.personId = person.id || '';

    modal.style.display = 'flex';

    // Auto-search photo from Wikipedia if missing
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
        const pageTitle = decodeURIComponent(wikiUrl.split('/wiki/').pop());
        const apiUrl = `https://fr.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=pageimages&format=json&pithumbsize=300&origin=*`;

        const response = await fetch(apiUrl);
        const result = await response.json();

        const pages = result.query.pages;
        const page = Object.values(pages)[0];

        if (page && page.thumbnail && page.thumbnail.source) {
            const filename = page.thumbnail.source.split('/').pop().replace(/^\d+px-/, '');
            const filePathUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${filename}`;

            document.getElementById('edit-person-photo').value = filePathUrl;
            updatePhotoPreview(filePathUrl);
            statusDiv.textContent = '✅ Photo trouvée sur Wikipedia !';
            statusDiv.className = 'photo-search-status success';
        } else {
            statusDiv.textContent = '⚠️ Aucune photo sur Wikipedia. Cliquez "Chercher des photos" ci-dessous.';
            statusDiv.className = 'photo-search-status warning';
            // Auto-trigger image search
            searchPersonImages();
        }
    } catch (error) {
        console.error('Error searching Wikipedia photo:', error);
        statusDiv.textContent = '❌ Erreur Wikipedia. Essayez "Chercher des photos".';
        statusDiv.className = 'photo-search-status error';
    }
}

function updatePhotoPreview(url) {
    const preview = document.getElementById('edit-person-photo-preview');
    if (preview && url) {
        preview.src = url;
        preview.style.display = 'block';
        preview.onerror = () => { preview.style.display = 'none'; };
    } else if (preview) {
        preview.style.display = 'none';
    }
}

async function searchPersonImages() {
    const prenomEl = document.getElementById('edit-person-prenom');
    const nameEl = document.getElementById('edit-person-name');
    const prenomGroup = document.getElementById('edit-person-prenom-group');

    let searchName = '';
    if (prenomGroup && prenomGroup.style.display !== 'none' && prenomEl.value.trim()) {
        searchName = `${prenomEl.value.trim()} ${nameEl.value.trim()}`;
    } else {
        searchName = nameEl.value.trim();
    }

    if (!searchName) {
        alert('Veuillez d\'abord renseigner le nom de la personne.');
        return;
    }

    const grid = document.getElementById('photo-picker-grid');
    const statusDiv = document.getElementById('photo-search-status');

    grid.style.display = 'block';
    grid.innerHTML = '<div style="text-align:center; padding:1.5rem; color:var(--text-dim);"><div class="spinner" style="display:inline-block; width:24px; height:24px; border:2.5px solid rgba(255,255,255,0.15); border-top-color:#7c3aed; border-radius:50%; animation:spin 0.8s linear infinite;"></div><br><span style="font-size:0.85rem;">Recherche en cours...</span></div>';
    statusDiv.textContent = `🔍 Recherche de photos pour "${searchName}"...`;
    statusDiv.className = 'photo-search-status searching';

    const imageResults = [];

    try {
        const [wikiImages, wikiEnImages, commonsImages, wikidataImages, googleImages] = await Promise.allSettled([
            fetchWikipediaImages(searchName, 'fr'),
            fetchWikipediaImages(searchName, 'en'),
            fetchCommonsImages(searchName),
            fetchWikidataImage(searchName),
            fetchGoogleImages(searchName)
        ]);

        if (wikiImages.status === 'fulfilled') imageResults.push(...wikiImages.value);
        if (wikiEnImages.status === 'fulfilled') imageResults.push(...wikiEnImages.value);
        if (commonsImages.status === 'fulfilled') imageResults.push(...commonsImages.value);
        if (wikidataImages.status === 'fulfilled' && wikidataImages.value) imageResults.push(wikidataImages.value);
        if (googleImages.status === 'fulfilled') imageResults.push(...googleImages.value);
    } catch (error) {
        console.error('Image search error:', error);
    }

    // Deduplicate by URL
    const uniqueUrls = new Set();
    const uniqueResults = imageResults.filter(img => {
        if (uniqueUrls.has(img.url)) return false;
        uniqueUrls.add(img.url);
        return true;
    });

    // Build the grid
    if (uniqueResults.length > 0) {
        statusDiv.textContent = `✅ ${uniqueResults.length} photo(s) trouvée(s). Cliquez pour sélectionner.`;
        statusDiv.className = 'photo-search-status success';

        let html = '<div class="photo-picker-items">';
        uniqueResults.forEach(img => {
            html += `
                <div class="photo-picker-item" onclick="selectPickerPhoto('${img.url.replace(/'/g, "\\'")}', this)" title="${(img.title || '').replace(/"/g, '&quot;')}">
                    <img src="${img.thumb}" alt="${(img.title || '').replace(/"/g, '&quot;')}" 
                         onerror="this.parentElement.style.display='none'">
                    <div class="photo-picker-source">${img.source}</div>
                </div>
            `;
        });
        html += '</div>';
        grid.innerHTML = html;
    } else {
        statusDiv.textContent = '⚠️ Aucune photo trouvée.';
        statusDiv.className = 'photo-search-status warning';
        grid.innerHTML = `
            <div style="text-align:center; padding:1rem;">
                <p style="color:var(--text-dim); margin-bottom:0.5rem;">Aucun résultat trouvé.</p>
                <p style="color:var(--text-dim); font-size:0.75rem;">Vous pouvez saisir directement une URL dans le champ Photo ci-dessus.</p>
            </div>
        `;
    }
}

async function fetchGoogleImages(searchName) {
    const images = [];
    try {
        const resp = await fetch(`/api/google-images?q=${encodeURIComponent(searchName)}`);

        if (!resp.ok) {
            console.warn('Google Images API returned', resp.status);
            return images;
        }

        const data = await resp.json();

        if (data.success && data.images) {
            data.images.forEach(img => {
                images.push({
                    url: img.url,
                    thumb: img.url,
                    title: searchName,
                    source: 'Google'
                });
            });
        }
    } catch (err) {
        console.warn('Google image search failed:', err);
    }
    return images;
}

async function fetchWikipediaImages(searchName, lang) {
    const images = [];

    const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchName)}&srnamespace=0&srlimit=3&format=json&origin=*`;
    const searchResp = await fetch(searchUrl);
    const searchData = await searchResp.json();

    if (!searchData.query || !searchData.query.search || searchData.query.search.length === 0) return images;

    const titles = searchData.query.search.map(s => s.title).join('|');
    const imgUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=pageimages&format=json&pithumbsize=200&origin=*`;
    const imgResp = await fetch(imgUrl);
    const imgData = await imgResp.json();

    if (imgData.query && imgData.query.pages) {
        for (const page of Object.values(imgData.query.pages)) {
            if (page.thumbnail && page.thumbnail.source) {
                const filename = page.thumbnail.source.split('/').pop().replace(/^\d+px-/, '');
                const fullUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${filename}`;
                images.push({
                    url: fullUrl,
                    thumb: page.thumbnail.source,
                    title: page.title,
                    source: `Wiki ${lang.toUpperCase()}`
                });
            }
        }
    }

    return images;
}

async function fetchCommonsImages(searchName) {
    const images = [];

    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchName)}&srnamespace=6&srlimit=10&format=json&origin=*`;
    const resp = await fetch(url);
    const respData = await resp.json();

    if (!respData.query || !respData.query.search) return images;

    const imageFiles = respData.query.search
        .filter(s => /\.(jpg|jpeg|png|webp)$/i.test(s.title))
        .slice(0, 8);

    if (imageFiles.length === 0) return images;

    const titles = imageFiles.map(f => f.title).join('|');
    const thumbUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(titles)}&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=200&format=json&origin=*`;
    const thumbResp = await fetch(thumbUrl);
    const thumbData = await thumbResp.json();

    if (thumbData.query && thumbData.query.pages) {
        for (const page of Object.values(thumbData.query.pages)) {
            if (page.imageinfo && page.imageinfo[0]) {
                const info = page.imageinfo[0];
                const thumbSrc = info.thumburl || info.url;
                const fullUrl = info.url;

                images.push({
                    url: fullUrl,
                    thumb: thumbSrc,
                    title: page.title.replace('File:', '').replace(/_/g, ' '),
                    source: 'Commons'
                });
            }
        }
    }

    return images;
}

async function fetchWikidataImage(searchName) {
    try {
        // Search Wikidata for the person
        const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(searchName)}&language=fr&limit=1&format=json&origin=*`;
        const searchResp = await fetch(searchUrl);
        const searchData = await searchResp.json();

        if (!searchData.search || searchData.search.length === 0) return null;

        const entityId = searchData.search[0].id;

        // Get image property (P18) from the entity
        const entityUrl = `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${entityId}&property=P18&format=json&origin=*`;
        const entityResp = await fetch(entityUrl);
        const entityData = await entityResp.json();

        if (entityData.claims && entityData.claims.P18 && entityData.claims.P18.length > 0) {
            const filename = entityData.claims.P18[0].mainsnak.datavalue.value;
            const encodedFilename = encodeURIComponent(filename.replace(/ /g, '_'));
            const thumbUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${encodedFilename}&prop=imageinfo&iiprop=url&iiurlwidth=200&format=json&origin=*`;
            const thumbResp = await fetch(thumbUrl);
            const thumbData = await thumbResp.json();

            let thumb = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFilename}?width=200`;
            if (thumbData.query && thumbData.query.pages) {
                const page = Object.values(thumbData.query.pages)[0];
                if (page && page.imageinfo && page.imageinfo[0] && page.imageinfo[0].thumburl) {
                    thumb = page.imageinfo[0].thumburl;
                }
            }

            return {
                url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodedFilename}`,
                thumb: thumb,
                title: searchData.search[0].label || searchName,
                source: 'Wikidata'
            };
        }
    } catch (err) {
        console.warn('Wikidata image search failed:', err);
    }
    return null;
}

function selectPickerPhoto(url, el) {
    document.getElementById('edit-person-photo').value = url;
    updatePhotoPreview(url);

    // Visual feedback: highlight selected
    document.querySelectorAll('.photo-picker-item').forEach(item => item.classList.remove('selected'));
    if (el) el.classList.add('selected');

    // Hide paste preview if visible
    const pastePreview = document.getElementById('paste-preview-container');
    if (pastePreview) pastePreview.style.display = 'none';

    const statusDiv = document.getElementById('photo-search-status');
    statusDiv.textContent = '✅ Photo sélectionnée ! Cliquez "Enregistrer" pour confirmer.';
    statusDiv.className = 'photo-search-status success';
}

function toggleInterestsEdit() {
    const display = document.getElementById('interests-display');
    const textarea = document.getElementById('edit-person-interests');
    const toggleBtn = document.getElementById('interests-edit-toggle');

    if (display && textarea) {
        if (textarea.style.display === 'none') {
            // Switch to edit mode
            display.style.display = 'none';
            textarea.style.display = 'block';
            textarea.focus();
            if (toggleBtn) toggleBtn.innerHTML = '👁️ Aperçu';
        } else {
            // Switch to display mode
            const text = textarea.value.trim();
            if (text) {
                display.textContent = text;
                display.style.display = 'block';
                textarea.style.display = 'none';
                if (toggleBtn) toggleBtn.innerHTML = '✏️ Modifier';
            }
        }
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
    const interestsInput = document.getElementById('edit-person-interests');
    const interests = interestsInput ? interestsInput.value.trim() : null;

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
            if (interests !== null) senator.interests = interests;
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
            if (interests !== null) deputy.interests = interests;
            personFound = true;
            break;
        }

        // Vérifier le préfet
        if (dept.prefect && dept.prefect.name === originalName) {
            dept.prefect.name = name;
            dept.prefect.wiki = wiki;
            dept.prefect.linkedin = linkedin;
            dept.prefect.photo = photo;
            if (interests !== null) dept.prefect.interests = interests;
            personFound = true;
            break;
        }

        // Vérifier les présidents
        if (dept.president_conseil && dept.president_conseil.name === originalName) {
            dept.president_conseil.name = name;
            dept.president_conseil.wiki = wiki;
            dept.president_conseil.linkedin = linkedin;
            dept.president_conseil.photo = photo;
            if (interests !== null) dept.president_conseil.interests = interests;
            personFound = true;
            break;
        }

        if (dept.president_cdpp && dept.president_cdpp.name === originalName) {
            dept.president_cdpp.name = name;
            dept.president_cdpp.wiki = wiki;
            dept.president_cdpp.linkedin = linkedin;
            dept.president_cdpp.photo = photo;
            if (interests !== null) dept.president_cdpp.interests = interests;
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
        if (interests !== null) data.region.president.interests = interests;
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
            if (interests !== null) dc.interests = interests;
            personFound = true;
        }
    }

    // Vérifier DGS Région
    if (!personFound && data.region && data.region.dgs && data.region.dgs.name === originalName) {
        data.region.dgs.name = name;
        data.region.dgs.wiki = wiki;
        data.region.dgs.linkedin = linkedin;
        data.region.dgs.photo = photo;
        if (interests !== null) data.region.dgs.interests = interests;
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
            if (interests !== null) vp.interests = interests;
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
            if (interests !== null) m.maire_general.interests = interests;
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
                    if (interests !== null) secteur.maire.interests = interests;
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
                    if (interests !== null) secteur.depute.interests = interests;
                    personFound = true;
                    break;
                }
            }
        }
    }


    if (personFound) {
        saveData();
        closePersonEditModal();

        // Recharger la vue actuelle en fonction de ce qui est affiché
        if (document.getElementById('marseille-view').style.display === 'block') {
            showMarseilleFiche();
        } else if (document.getElementById('region-view').style.display === 'block') {
            showRegionFiche();
        } else if (document.getElementById('fiche-view').style.display === 'block' && currentDept) {
            showFiche(currentDept);
        } else {
            showRegionFiche();
        }

        alert('✅ Profil mis à jour avec succès !');
    } else {
        alert('❌ Personne non trouvée dans les données');
    }
}


async function autoFillMissingInfo(personName) {
    let statusDiv = document.getElementById('photo-search-status');

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
                <div id="edit-person-prenom-group" class="form-group" style="margin-bottom: 1rem; display: none;">
                    <label style="display:block; margin-bottom:0.5rem; color:var(--text-dim);">Prénom</label>
                    <input type="text" id="edit-person-prenom" placeholder="Prénom" style="width:100%; padding:0.5rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px;">
                </div>

                <div class="form-group" style="margin-bottom: 1rem;">
                    <label id="edit-person-name-label" style="display:block; margin-bottom:0.5rem; color:var(--text-dim);">Nom complet</label>
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
                    <label style="display:block; margin-bottom:0.5rem; color:var(--text-dim);">Photo</label>
                    <div style="display: flex; gap: 0.5rem; align-items: center;">
                        <input type="url" id="edit-person-photo" placeholder="https://..." style="flex: 1; padding:0.5rem; background:rgba(255,255,255,0.1); border:1px solid rgba(255,255,255,0.2); color:white; border-radius:4px;">
                        <img id="edit-person-photo-preview" src="" alt="" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:1.5px solid rgba(255,255,255,0.2); display:none;">
                        <button onclick="const url = document.getElementById('edit-person-photo').value; if(url) window.open(url, '_blank')" 
                                title="Voir la photo" style="padding: 0.5rem; background: rgba(255,255,255,0.2); border: none; border-radius: 4px; cursor: pointer;">🖼️</button>
                    </div>
                    <div id="photo-search-status" class="photo-search-status" style="margin-top: 0.5rem; font-size: 0.8rem;"></div>
                    <button onclick="searchPersonImages()" type="button"
                            style="margin-top:0.5rem; width:100%; padding:0.6rem; background:linear-gradient(135deg, #4f46e5, #7c3aed); color:white; border:none; border-radius:6px; cursor:pointer; font-size:0.85rem; transition: opacity 0.2s;"
                            onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                        🔍 Chercher des photos
                    </button>
                    <div id="photo-picker-grid" class="photo-picker-grid" style="display:none;"></div>
                </div>
                
                <!-- Conteneur pour les champs supplémentaires (parti, circo, etc.) -->
                <div id="edit-person-extra-fields"></div>

                <!-- Section Centre d'intérêts -->
                <div id="edit-person-interests-section" class="interests-section" style="margin-top: 1.5rem; display: none;">
                    <div class="interests-header" style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem;">
                        <span style="font-size: 1.2rem;">💡</span>
                        <label style="font-size: 0.95rem; font-weight: 600; color: var(--text-bright, #e0e0e0); letter-spacing: 0.3px;">Centre d'intérêts</label>
                        <button type="button" id="interests-edit-toggle" onclick="toggleInterestsEdit()" 
                                style="margin-left: auto; padding: 0.2rem 0.6rem; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 6px; color: var(--text-dim, #aaa); font-size: 0.75rem; cursor: pointer; transition: all 0.2s;" 
                                onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                            ✏️ Modifier
                        </button>
                    </div>
                    <div id="interests-display" class="interests-display" style="padding: 0.85rem 1rem; background: linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(139, 92, 246, 0.08)); border: 1px solid rgba(139, 92, 246, 0.2); border-radius: 10px; color: var(--text-dim, #ccc); font-size: 0.88rem; line-height: 1.55; font-style: italic;"></div>
                    <textarea id="edit-person-interests" 
                              placeholder="Décrivez les centres d'intérêts de cette personne en 2-3 phrases... (passions, hobbies, sujets de conversation favoris)" 
                              style="display: none; width:100%; min-height: 90px; padding:0.75rem; background:rgba(255,255,255,0.08); border:1px solid rgba(139, 92, 246, 0.3); color:white; border-radius:8px; font-size:0.88rem; line-height:1.5; resize: vertical; font-family: inherit;"></textarea>
                </div>
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

// ===== Photo Zoom Modal =====
function openPhotoModal(imgSrc, personName) {
    const overlay = document.getElementById('photo-modal');
    const modalImg = document.getElementById('photo-modal-img');
    const modalName = document.getElementById('photo-modal-name');
    modalImg.src = imgSrc;
    modalImg.alt = personName || '';
    modalName.textContent = personName || '';
    // Small delay so CSS transition triggers properly
    requestAnimationFrame(() => {
        overlay.classList.add('active');
    });
    document.body.style.overflow = 'hidden';
}

function closePhotoModal(event) {
    if (event) {
        // Only close when clicking the overlay background or the close button, not the content
        const content = document.querySelector('.photo-modal-content');
        if (event.target !== document.getElementById('photo-modal') &&
            !event.target.classList.contains('photo-modal-close') &&
            content && content.contains(event.target)) {
            return;
        }
        event.stopPropagation();
    }
    const overlay = document.getElementById('photo-modal');
    overlay.classList.remove('active');
    document.body.style.overflow = '';
}

// Event delegation (capture phase): click on any person-photo that isn't broken
// Using capture phase to intercept before inline onclick on parent elements
document.body.addEventListener('click', function (e) {
    const img = e.target.closest('img.person-photo:not(.broken)');
    if (!img) return;
    // Don't open modal for tiny broken placeholder images
    if (img.naturalWidth === 0) return;

    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();

    const personName = img.alt || '';
    openPhotoModal(img.src, personName);
}, true);

// Close on Escape key
document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
        const overlay = document.getElementById('photo-modal');
        if (overlay && overlay.classList.contains('active')) {
            closePhotoModal();
        }
    }
});

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
window.searchPersonImages = searchPersonImages;
window.selectPickerPhoto = selectPickerPhoto;
window.openPhotoModal = openPhotoModal;
window.closePhotoModal = closePhotoModal;
window.editVille = editVille;
window.saveVille = saveVille;
window.deleteVille = deleteVille;
window.closeVilleModal = closeVilleModal;
window.refreshVilleData = refreshVilleData;
window.showInterestsPopover = showInterestsPopover;
window.toggleInterestsEdit = toggleInterestsEdit;



// ── Burger Menu / Side Drawer ──────────────────────────────
(function initDrawer() {
    const burgerToggle = document.getElementById('burger-toggle');
    const drawer = document.getElementById('side-drawer');
    const overlay = document.getElementById('drawer-overlay');
    const closeBtn = document.getElementById('drawer-close');

    if (!burgerToggle || !drawer || !overlay) return;

    function openDrawer() {
        drawer.classList.add('open');
        overlay.classList.add('visible');
        burgerToggle.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeDrawer() {
        drawer.classList.remove('open');
        overlay.classList.remove('visible');
        burgerToggle.classList.remove('open');
        document.body.style.overflow = '';
    }

    burgerToggle.addEventListener('click', () => {
        drawer.classList.contains('open') ? closeDrawer() : openDrawer();
    });

    overlay.addEventListener('click', closeDrawer);
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    // Wire drawer buttons to the same actions as header buttons
    const wire = (drawerId, action) => {
        const el = document.getElementById(drawerId);
        if (el) el.addEventListener('click', () => {
            closeDrawer();
            action();
        });
    };

    wire('drawer-refresh-btn', refreshData);

    wire('drawer-region-btn', showRegionFiche);
    wire('drawer-marseille-btn', showMarseilleFiche);
    wire('drawer-logout-btn', () => {
        sessionStorage.removeItem('currentUser');
        localStorage.removeItem('rememberedUser');
        currentUser = null;
        checkAuth();
    });

    // Close drawer on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && drawer.classList.contains('open')) {
            closeDrawer();
        }
    });
})();
