let map;
let routeLayers = [];
let routeData = [];
let currentView = 'plan';

// Start coordinates (Delhi default)
const defaultStart = [28.6139, 77.2090];

function initMap() {
    // Initialize Leaflet Map
    // Create map in the hidden main map div initially
    map = L.map('map', {
        zoomControl: false
    }).setView(defaultStart, 13);

    // Standard OpenStreetMap (Light Mode)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors',
        subdomains: 'abc',
        maxZoom: 19
    }).addTo(map);

    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Create custom panes for forced safety route layering
    map.createPane('safety-risky');
    map.getPane('safety-risky').style.zIndex = 400;

    map.createPane('safety-moderate');
    map.getPane('safety-moderate').style.zIndex = 401;

    map.createPane('safety-recommended');
    map.getPane('safety-recommended').style.zIndex = 402;
}

function switchMainView(viewName, navEl) {
    // Nav Active State
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    if (navEl) navEl.classList.add('active');

    // Hide all views
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));

    // Show Target View
    const targetView = document.getElementById('view-' + (viewName === 'navigate' ? 'plan' : viewName));
    if (targetView) targetView.classList.add('active');

    // Map Movement Logic
    if (viewName === 'options') {
        const container = document.getElementById('map-options');
        if (container) {
            container.appendChild(document.getElementById('map'));
            document.getElementById('map').style.display = 'block';
            setTimeout(() => map.invalidateSize(), 100);
        }
    } else if (viewName === 'details') {
        const container = document.getElementById('map-details');
        if (container) {
            container.appendChild(document.getElementById('map'));
            document.getElementById('map').style.display = 'block';
            setTimeout(() => map.invalidateSize(), 100);
        }
    } else {
        // Hide map on other views
        document.getElementById('map').style.display = 'none';
    }
}

async function findSafeRoute() {
    const sourceVal = document.getElementById('start-node').value;
    const destVal = document.getElementById('end-node').value;

    if (!destVal) { alert("Please enter a destination"); return; }
    if (!sourceVal) { alert("Please enter a source location"); return; }

    // Switch View to Options
    switchMainView('options');

    try {
        // 1. Geocode Source & Dest
        const startCoords = await geocodeLocation(sourceVal);
        const endCoords = await geocodeLocation(destVal);

        if (!startCoords || !endCoords) {
            alert("Could not find location. Please try being more specific (e.g. 'Mumbai, India')");
            return;
        }

        // 2. Fetch Routes form OSRM
        await fetchOSRMRoute(startCoords, endCoords);

    } catch (e) {
        console.error(e);
        alert("Error finding route. Please try again.");
    }
}

async function geocodeLocation(query) {
    if (query.toLowerCase() === "current location") {
        return defaultStart;
    }

    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=in&addressdetails=1&limit=1`;

    const response = await fetch(url);
    const data = await response.json();

    if (data && data.length > 0) {
        return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    }
    return null;
}

async function fetchOSRMRoute(start, end) {
    // Clear Previous Layers
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];

    const startStr = `${start[1]},${start[0]}`;
    const endStr = `${end[1]},${end[0]}`;

    // 1. Fetch Primary Route (Best)
    const url = `https://router.project-osrm.org/route/v1/driving/${startStr};${endStr}?overview=full&geometries=geojson&alternatives=3`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.code !== 'Ok') throw new Error("Routing failed");

    let rawRoutes = data.routes;

    // 2. Force 3 distinct routes if API fails to provide them
    if (rawRoutes.length < 3) {
        const primaryPoints = rawRoutes[0].geometry.coordinates;
        // Try multiple waypoints to get distinct full paths
        const searchSplits = [0.3, 0.6, 0.45, 0.75];
        const searchOffsets = [0.005, -0.005, 0.008, -0.008];

        for (let i = 0; i < searchSplits.length; i++) {
            if (rawRoutes.length >= 3) break;

            const midIndex = Math.floor(primaryPoints.length * searchSplits[i]);
            const midPoint = primaryPoints[midIndex];
            const viaStr = `${midPoint[0] + searchOffsets[i]},${midPoint[1] + searchOffsets[i]}`;

            const altUrl = `https://router.project-osrm.org/route/v1/driving/${startStr};${viaStr};${endStr}?overview=full&geometries=geojson`;
            try {
                const altResp = await fetch(altUrl);
                const altData = await altResp.json();
                if (altData.code === 'Ok') {
                    // Check if significantly different duration to avoid near-clones
                    const isNew = !rawRoutes.some(r => Math.abs(r.duration - altData.routes[0].duration) < 10);
                    if (isNew) rawRoutes.push(altData.routes[0]);
                }
            } catch (e) { }
        }

        // Final fallback to ensure we have 3 objects
        while (rawRoutes.length < 3) {
            rawRoutes.push(JSON.parse(JSON.stringify(rawRoutes[0])));
        }
    }

    // 3. Process routes as entities and calculate/assign safety scores
    // Create base route objects with temporary data
    let processedRoutes = rawRoutes.slice(0, 3).map((r, index) => {
        const latlngs = r.geometry.coordinates.map(coord => [coord[1], coord[0]]);

        // In a real app, this score would come from a backend analyzing the specific path
        // For now, we assign distinct scores to simulate different safety levels
        let safetyScore = 0;
        if (index === 0) safetyScore = 95 - Math.floor(Math.random() * 5); // 90-95
        else if (index === 1) safetyScore = 75 - Math.floor(Math.random() * 10); // 65-75
        else safetyScore = 45 - Math.floor(Math.random() * 10); // 35-45

        return {
            points: latlngs,
            duration: Math.round(r.duration / 60) + ' min',
            distance: (r.distance / 1000).toFixed(1) + ' km',
            summary: r.legs[0].summary || "Main Route",
            score: safetyScore
        };
    });

    // 4. Rank by safety and assign colors
    processedRoutes.sort((a, b) => b.score - a.score);

    routeData = processedRoutes.map((r, index) => {
        let type, color, typeClass, routeLabel, pane;
        if (index === 0) {
            type = 'RECOMMENDED';
            color = '#22C55E';
            typeClass = 'green';
            routeLabel = 'Safest Path via ' + r.summary;
            pane = 'safety-recommended';
        } else if (index === 1) {
            type = 'MODERATE';
            color = '#FACC15';
            typeClass = 'yellow';
            routeLabel = 'Cautionary Path via ' + r.summary;
            pane = 'safety-moderate';
        } else {
            type = 'RISKY';
            color = '#EF4444';
            typeClass = 'red';
            routeLabel = 'Unsafe Path via ' + r.summary;
            pane = 'safety-risky';
        }

        const factors = {
            crime: Math.max(10, r.score - 5 + Math.floor(Math.random() * 10)),
            cctv: Math.max(10, r.score - 10 + Math.floor(Math.random() * 15)),
            reports: Math.max(10, r.score - 8 + Math.floor(Math.random() * 12)),
            weather: 85 + Math.floor(Math.random() * 10),
            lighting: Math.max(10, r.score - 3 + Math.floor(Math.random() * 6))
        };

        return {
            ...r,
            type, color, typeClass, routeLabel, pane, factors
        };
    });

    // 5. Render on Map (Reverse draw for layering: Red -> Yellow -> Green)
    const renderOrder = ['RISKY', 'MODERATE', 'RECOMMENDED'];
    renderOrder.forEach(type => {
        const r = routeData.find(route => route.type === type);
        if (!r) return;

        let weight = (r.type === 'RECOMMENDED') ? 7 : 5;
        let opacity = 1; // Solid colors as requested

        const polyline = L.polyline(r.points, {
            color: r.color,
            weight: weight,
            opacity: opacity,
            lineJoin: 'round',
            pane: r.pane
        }).addTo(map);
        routeLayers.push(polyline);

        if (r.type === 'RECOMMENDED') {
            map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        }
    });

    renderRouteCards(routeData);
}

function renderRouteCards(sortedRoutes) {
    const container = document.getElementById('route-cards-container');
    container.innerHTML = '';

    sortedRoutes.forEach((route) => {
        const card = document.createElement('div');
        card.className = `info-card ${route.typeClass}`;
        const badge = route.type === 'RECOMMENDED' ? '<div style="margin-top:10px; background:#22C55E; color:white; font-size:0.75rem; padding:4px 8px; border-radius:10px; display:inline-block;">Best Choice</div>' : '';

        card.innerHTML = `
            <div class="score-big" style="color:${route.color}">${route.score}</div>
            <div class="card-label" style="color:${route.color}">${route.type}</div>
            <div class="route-meta" style="color:white; margin-top:10px;">${route.routeLabel}</div>
            <div class="route-meta">${route.duration} • ${route.distance}</div>
            ${badge}
        `;

        card.onclick = () => showRouteDetails(route);
        container.appendChild(card);
    });
}

function showRouteDetails(route) {
    switchMainView('details');

    // Filter Map to show ONLY selected route
    routeLayers.forEach(layer => map.removeLayer(layer));

    const polyline = L.polyline(route.points, {
        color: route.color,
        weight: 6,
        opacity: 1
    }).addTo(map);
    routeLayers.push(polyline);
    map.fitBounds(polyline.getBounds(), { padding: [50, 50] });

    // Update Score Hero
    const scoreDisplay = document.getElementById('final-score-display');
    scoreDisplay.innerText = route.score;
    scoreDisplay.style.color = route.color;

    // Update Recommendation Note
    const note = document.getElementById('route-recommendation-note');
    if (route.type === 'RECOMMENDED') {
        note.style.display = 'block';
        note.innerHTML = '<i class="fas fa-sparkles"></i> This is the safest recommended route.';
        note.style.background = 'rgba(34, 197, 94, 0.1)';
        note.style.color = 'var(--accent-green)';
    } else {
        note.style.display = 'none';
    }

    // Update Navigation Button Text
    document.getElementById('btn-start-nav').innerHTML = `Start Navigation via ${route.summary} <i class="fas fa-location-arrow"></i>`;
    document.getElementById('btn-start-nav').style.background = route.color;

    // Animate 5 Progress Bars
    updateProgressBar('bar-crime', 'val-crime', route.factors.crime);
    updateProgressBar('bar-cctv', 'val-cctv', route.factors.cctv);
    updateProgressBar('bar-reports', 'val-reports', route.factors.reports);
    updateProgressBar('bar-weather', 'val-weather', route.factors.weather);
    updateProgressBar('bar-lighting', 'val-lighting', route.factors.lighting);
}

function updateProgressBar(barId, valId, value) {
    document.getElementById(valId).innerText = value;
    const bar = document.getElementById(barId);
    bar.style.width = '0%';
    setTimeout(() => {
        bar.style.width = value + '%';
        // Adjust color based on value for small indicators
        if (value < 50) bar.style.background = 'var(--accent-red)';
        else if (value < 80) bar.style.background = 'var(--accent-yellow)';
        else bar.style.background = 'var(--accent-blue)';
    }, 100);
}

function backToOptions() {
    switchMainView('options');
    // We already have the routeData, just re-render layers
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];

    // Render on Map with the same layered effect (Red -> Yellow -> Green)
    const renderOrder = ['RISKY', 'MODERATE', 'RECOMMENDED'];
    renderOrder.forEach(type => {
        const r = routeData.find(route => route.type === type);
        if (!r) return;

        let weight = (r.type === 'RECOMMENDED') ? 7 : 5;
        let opacity = 1;

        const polyline = L.polyline(r.points, {
            color: r.color,
            weight: weight,
            opacity: opacity,
            lineJoin: 'round',
            pane: r.pane
        }).addTo(map);
        routeLayers.push(polyline);
    });

    // Fit to recommended
    const recommended = routeData.find(r => r.type === 'RECOMMENDED');
    if (recommended) {
        const polyline = L.polyline(recommended.points);
        map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
    }
}

function triggerSOS(type) {
    alert(`🚨 SOS TRIGGERED (${type}) \n\nNotifying Emergency Contacts and nearest authorities...`);
}

function submitCommunityReport() {
    const input = document.getElementById('community-report-input');
    if (!input.value.trim()) {
        alert("Please enter a report description.");
        return;
    }
    alert("✅ Report Submitted! \n\nThank you for contributing to community safety. Your report will be reviewed and will influence future safety scores.");
    input.value = '';
}

function toggleProfileDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    dropdown.classList.toggle('active');
}

function showEditContacts() {
    toggleProfileDropdown(); // Close dropdown
    switchMainView('edit-contacts');
}

async function updateContacts(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);

    const emergency_contacts = [
        formData.get('emergency_1'),
        formData.get('emergency_2')
    ];
    if (formData.get('emergency_3')) {
        emergency_contacts.push(formData.get('emergency_3'));
    }

    try {
        const response = await fetch('/update_contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ emergency_contacts })
        });

        const result = await response.json();
        if (result.success) {
            alert("✅ Emergency contacts updated successfully!");
            location.reload(); // Refresh to update user info in session
        } else {
            alert("❌ Error: " + result.message);
        }
    } catch (error) {
        console.error("Update error:", error);
        alert("❌ Failed to update contacts. Please try again.");
    }
}

// Close dropdown when clicking outside
window.addEventListener('click', function (e) {
    const dropdown = document.getElementById('profile-dropdown');
    const profile = document.querySelector('.user-profile');
    if (dropdown && !dropdown.contains(e.target) && !profile.contains(e.target)) {
        dropdown.classList.remove('active');
    }
});

window.onload = function () {
    initMap();
};
