        lucide.createIcons();

          // WERSJA 5.7.0 - [LOGIKA PWA: Sprawdzony kod + 24h timer + rejestracja SW]
        let deferredPrompt;
        const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;

        // Rejestracja Service Workera (Krytyczne dla odblokowania promptu w Android Chrome)
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js');
            });
        }

        // WERSJA 5.7.1 - [SAAS RESILIENCE: Zabezpieczenie localStorage w trybie prywatnym iOS]
        // Używamy try...catch, aby restrykcyjne tryby prywatne Safari nie crashowały całej aplikacji.
        
        function canShowPwa() {
            try {
                const blockedUntil = localStorage.getItem('pwaBlockedUntil');
                if (!blockedUntil) return true; 
                if (Date.now() > parseInt(blockedUntil, 10)) {
                    localStorage.removeItem('pwaBlockedUntil'); 
                    return true;
                }
                return false; 
            } catch (error) {
                // Jeżeli przeglądarka blokuje localStorage (np. ścisły tryb incognito),
                // prewencyjnie nie pokazujemy banera, by nie drażnić użytkownika,
                // który i tak w tym trybie nie zainstaluje PWA.
                console.warn("PWA: Brak dostępu do localStorage (Tryb prywatny?). Blokuję baner.");
                return false; 
            }
        }

        // WERSJA 5.8.1 - [SAAS PWA FIX: Niezawodny trigger z opóźnieniem UX]
        
        function showPwaBanner() {
            const banner = document.getElementById('pwa-install-banner');
            if (banner) {
                banner.classList.remove('hidden');
                // Delikatne opóźnienie przed animacją pozwala przeglądarce upewnić się,
                // że renderuje widoczny obiekt, co naprawia ucięte animacje w iOS Safari.
                setTimeout(() => banner.classList.remove('translate-y-full'), 100);
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }

        function initPwaLogic() {
            if (isIOSDevice && !isStandalone && canShowPwa()) {
                // Opóźniamy start banera o 1.5s - nie atakujemy usera w pierwszej sekundzie
                setTimeout(showPwaBanner, 1500);
            }
        }

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault(); 
            deferredPrompt = e; 
            if (isMobileDevice && !isStandalone && canShowPwa()) {
                setTimeout(showPwaBanner, 1500);
            }
        });

        // Niezależnie od momentu zjawienia się skryptu w pamięci telefonu, 
        // bezpiecznie sprawdzamy czy strona już żyje. Jeśli tak - odpalamy.
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
            initPwaLogic();
        } else {
            window.addEventListener('DOMContentLoaded', initPwaLogic);
        }

// WERSJA 5.9.0 - [UX PWA: Resetowanie stanu banera i wyeliminowanie systemowego alertu]
        function dismissPwaPrompt() {
            const banner = document.getElementById('pwa-install-banner');
            banner.classList.add('translate-y-full');
            
            setTimeout(() => {
                banner.classList.add('hidden');
                // Resetujemy stan HTML, aby baner wyglądał poprawnie przy kolejnym otwarciu apki
                const iosInst = document.getElementById('pwa-ios-instructions');
                if(iosInst) iosInst.classList.add('hidden');
                const installBtn = document.getElementById('pwa-install-btn');
                if(installBtn) installBtn.classList.remove('hidden');
                const installText = document.getElementById('pwa-install-text');
                if(installText) installText.innerText = "Gotuj jednym kliknięciem!";
            }, 300); 
            
            try {
                // Zapisujemy blokadę na 24 godziny
                localStorage.setItem('pwaBlockedUntil', Date.now() + 86400000);
            } catch (error) {
                console.warn("PWA: Nie udało się zapisać blokady banera w localStorage.");
            }
        }

        async function triggerPwaInstall() {
            if (isIOSDevice) {
                // Pokazujemy instrukcję bezpośrednio w DOM, nie zamrażając UI systemu
                document.getElementById('pwa-install-btn').classList.add('hidden');
                document.getElementById('pwa-ios-instructions').classList.remove('hidden');
                document.getElementById('pwa-install-text').innerText = "Postępuj zgodnie z instrukcją poniżej:";
                if (typeof lucide !== 'undefined') lucide.createIcons();
            } else if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                if (outcome === 'accepted') console.log('Zainstalowano');
                deferredPrompt = null;
                dismissPwaPrompt();
            }
        }
        // KONIEC MODUŁU PWA

        // WERSJA 1.23.0 - Dodanie stanu widoku (Kafelki vs Lista)
        // ==========================================
        // WERSJA 6.0.3 - HTTP-ONLY COOKIE REFRESH INTERCEPTOR (SaaS Grade)
        // ==========================================
        const originalFetch = window.fetch;
        let isRefreshing = false;
        let refreshSubscribers = [];

        window.fetch = async (...args) => {
            let [resource, config] = args;
            
            // DRY CLEANER: Automatycznie usuwamy stare nagłówki Authorization z requestów, 
            // żebyś nie musiał ręcznie edytować ponad 20 funkcji fetch w całym kodzie!
            if (config && config.headers && config.headers['Authorization']) {
                delete config.headers['Authorization'];
            }

            // Wymuszamy wysyłanie ciasteczek do każdego zapytania do naszego API
            config = config || {};
            config.credentials = 'same-origin';

            let response = await originalFetch(resource, config);

            if (response.status === 401 && resource.toString().includes('/api/')) {
                if (isRefreshing) {
                    return new Promise(resolve => {
                        refreshSubscribers.push(() => {
                            resolve(originalFetch(resource, config));
                        });
                    });
                }

                isRefreshing = true;
                try {
                    // Backend automatycznie odczyta refresh_token z ciasteczka i sam wystawi nowe!
                    const res = await originalFetch('/api/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ step: 'refresh' }),
                        credentials: 'same-origin'
                    });
                    
                    const data = await res.json();
                    if (data.status === 'success') {
                        isRefreshing = false;
                        refreshSubscribers.forEach(cb => cb());
                        refreshSubscribers = [];
                        return await originalFetch(resource, config);
                    } else {
                        logoutUser();
                    }
                } catch (e) { logoutUser(); }
                isRefreshing = false;
            }
            return response;
        };

        let currentRecipeData = null;
        let allSavedRecipes = [];
        let filteredRecipes = [];
        let isListView = false; // Domyślnie widok kafelkowy
        let currentUserEmail = null;
        let currentUserProfile = null;
       
        let uniqueCategories = [];
        let selectedRecipesForShopping = [];

        let allShoppingLists = [];
        let activeShoppingListId = null;
        let activeShoppingTitle = "";
        let activeShoppingListArray = [];
        let activeLinkedRecipes = []; // NOWE: Zmienna trzymająca w pamięci Plan Posiłków

        // WERSJA 5.1.0 - [TRENDY ICONS: Nowoczesne odznaki person i poziomów]
        // WERSJA 7.3.0 - [UI: Zmiana Odznak Person na Style Gotowania z zachowaniem poprawnej kolejności]
// WERSJA 7.4.0 - [UI: Zmiana Odznak Person na Style Gotowania (Dodane 3 nowe style)]
        const CHEF_BADGES = {
            'DEFAULT_CHEF': '🍳 Domowa Kuchnia',
            'QUICK_EASY': '⏱️ Na Szybko',
            'KIDS_HERO': '🪄 Dla Niejadków',
            'WEIGHT_LOSS': '🔥 Misja Odchudzanie',
            'KETO': '🥘 KETO',
            'HIGH_PROTEIN': '🏋️ Wysokobiałkowy',
            'ECO_PURE': '🌿 Ekologiczny',
            'VEGE_MASTER': '🥑 Wege',
            'LOW_GI': '📉 Niskie IG',
            'PRO_CHEF': '✨ Restauracyjnie',
            'POLISH_TRADITION': '🥟 Polskie Tradycje',
            'HUNTER': '🥩 Kuchnia Myśliwska',
            'MEAL_PREP': '🍱 Raz a dobrze'
        };

        const SKILL_BADGES = {
            'SKILL_NOOB': '💡 Poziom: Łatwy',
            'DEFAULT_SKILL': '🔪 Poziom: Średni',
            'SKILL_EXPERT': '🎓 Poziom: Ekspert'
        };

        // WERSJA 4.3.1 - Obsługa wskaźnika planu (Zabezpieczenie przed ściskaniem)
        function updatePremiumBadge() {
            const badge = document.getElementById('premiumBadge');
            if (!badge) return;
            
            if (currentUserProfile && currentUserProfile.is_premium) {
                // Wygląd dla PREMIUM (dumnie, nieklikalne)
                badge.innerHTML = `<i data-lucide="star" class="w-3 h-3 fill-current text-terracotta"></i> PREMIUM`;
                badge.className = "text-[10px] sm:text-xs font-extrabold px-3 py-1.5 rounded-full transition-all border shadow-sm flex items-center gap-1 shrink-0 cursor-default bg-sage/10 text-sage_dark border-sage/20";
                badge.onclick = null; 
            } else {
                // Wygląd dla FREE (zachęcające do kliknięcia)
                badge.innerHTML = `DARMOWY <span class="font-normal opacity-75 hidden sm:inline">- Ulepsz</span>`;
                badge.className = "text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full transition-all border shadow-sm flex items-center gap-1 shrink-0 cursor-pointer bg-white text-charcoal_light border-charcoal/10 hover:border-terracotta/30 hover:text-terracotta hover:bg-terracotta/5";
                badge.onclick = triggerUpgradeModal;
            }
            lucide.createIcons(); 
        }

        function triggerUpgradeModal() {
            // Tutaj w Fazie 6 podmienimy alert na wywołanie okna Checkout / Paywall
            alert("🚀 Moduł płatności Premium jest w przygotowaniu (Faza 6).\n\nWkrótce będziesz mógł przejść na pakiet Premium, aby odblokować zaawansowane persony Szefów Kuchni, łączenie kont i bezlimitową bazę przepisów!");
        }

        // WERSJA 4.3.2 - Funkcja blokująca wybór opcji Premium dla darmowych użytkowników (Soft Paywall UI)
        function enforcePremiumSelect(selectElement, fallbackValue) {
            if (currentUserProfile && !currentUserProfile.is_premium) {
                if (selectElement.value !== fallbackValue) {
                    triggerUpgradeModal(); // Pokazuje alert z zachętą do Premium
                    selectElement.value = fallbackValue; // Cofa UI natychmiast do darmowej opcji
                }
            }
        }

        // WERSJA 4.9.4 - Normalizacja kategorii (naprawa duplikatów)
        function normalizeCategory(cat) {
            if (!cat) return 'Inne';
            cat = cat.trim();
            // Pierwsza litera duża, reszta mała (np. "Danie główne")
            return cat.charAt(0).toUpperCase() + cat.slice(1).toLowerCase();
        }
        // WERSJA 5.1.3 - [UX FIX: Logika Preloadera]
        function hideInitialPreloader() {
            const preloader = document.getElementById('initial-preloader');
            if(preloader && preloader.style.opacity !== '0') {
                preloader.style.opacity = '0';
                setTimeout(() => preloader.remove(), 500);
            }
        }

        // WERSJA 6.3.0 - [SAAS FIX: Inicjalizacja sesji oparta o ciasteczka]
        window.onload = function() {
            lucide.createIcons();
            const storedEmail = localStorage.getItem('familyChefEmail');
            const magicEmail = window.MAGIC_LINK_EMAIL;
           
            if (magicEmail && magicEmail !== "") {
                localStorage.setItem('familyChefEmail', magicEmail);
                verifyUserInDatabase(magicEmail); 
            } else if (storedEmail) { 
                // ZMIANA: Skoro token mamy ukryty w bezpiecznym ciasteczku HttpOnly, 
                // na frontendzie sprawdzamy tylko, czy użytkownik "pamięta" swój email.
                // Przeglądarka sama doklei ciasteczko, a backend oceni czy sesja jest ważna.
                verifyUserInDatabase(storedEmail); 
            } else {
                hideInitialPreloader(); 
                document.getElementById('auth-overlay').classList.remove('hidden');
                document.getElementById('app-container').classList.add('hidden');
            }
        };

        // WERSJA 4.6.0 - Logika OTP (Send, Verify & Auto-login)
        function processAuth() {
            const emailInput = document.getElementById('loginEmail').value.trim().toLowerCase();
            if (!emailInput || !emailInput.includes('@')) return alert("Błędny email");
            
            document.getElementById('authBtn').innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Wysyłam kod...`;
            document.getElementById('authBtn').disabled = true;
            document.getElementById('authErrorMsg').classList.add('hidden');
            
            sendOTP(emailInput);
        }

        async function sendOTP(email) {
            try {
                const response = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: email, step: 'send' })
                });
                const res = await response.json();

                if (res.status === 'success') {
                    document.getElementById('authStep1').classList.add('hidden');
                    document.getElementById('authStep2').classList.remove('hidden');
                    document.getElementById('loginCode').focus();
                } else {
                    document.getElementById('authErrorMsg').innerText = res.message;
                    document.getElementById('authErrorMsg').classList.remove('hidden');
                }
            } catch (error) {
                document.getElementById('authErrorMsg').innerText = "Krytyczny błąd serwera.";
                document.getElementById('authErrorMsg').classList.remove('hidden');
            } finally {
                document.getElementById('authBtn').innerHTML = `<i data-lucide="mail" class="w-5 h-5"></i> Wyślij kod`;
                document.getElementById('authBtn').disabled = false;
                lucide.createIcons();
            }
        }

        async function verifyAuthCode() {
            const emailInput = document.getElementById('loginEmail').value.trim().toLowerCase();
            const codeInput = document.getElementById('loginCode').value.trim();
            
            if (codeInput.length !== 6) return alert("Kod musi mieć 6 cyfr.");

            document.getElementById('verifyBtn').innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Sprawdzam...`;
            document.getElementById('verifyBtn').disabled = true;
            document.getElementById('verifyErrorMsg').classList.add('hidden');

            try {
                const response = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailInput, step: 'verify', token: codeInput })
                });
                const res = await response.json();

// WERSJA 6.0.0 - [SECURITY FIRST: Koniec z JWT w localStorage. Backend wysyła HttpOnly Cookies]
            if (res.status === 'success') {
                // Tokeny są teraz ustawiane automatycznie przez przeglądarkę z nagłówków Set-Cookie
                finalizeLogin(res.data);
                } else {
                    document.getElementById('verifyErrorMsg').innerText = res.message;
                    document.getElementById('verifyErrorMsg').classList.remove('hidden');
                }
            } catch (error) {
                document.getElementById('verifyErrorMsg').innerText = "Błąd weryfikacji.";
                document.getElementById('verifyErrorMsg').classList.remove('hidden');
            } finally {
                document.getElementById('verifyBtn').innerHTML = `<i data-lucide="check-circle" class="w-5 h-5"></i> Weryfikuj`;
                document.getElementById('verifyBtn').disabled = false;
                lucide.createIcons();
            }
        }

        function resetAuth() {
            document.getElementById('authStep2').classList.add('hidden');
            document.getElementById('authStep1').classList.remove('hidden');
            document.getElementById('loginCode').value = '';
            document.getElementById('verifyErrorMsg').classList.add('hidden');
        }

        // WERSJA 6.0.1 - [SECURITY FIRST: Auto-login oparty o ciasteczka HttpOnly]
        async function verifyUserInDatabase(email) {
            try {
                // Przeglądarka sama dołączy ciasteczko z tokenem sesyjnym!
                const response = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // Włączenie credentials pozwala na przesył ciasteczek w środowiskach lokalnych i na Vercelu
                    credentials: 'same-origin',
                    body: JSON.stringify({ email: email, step: 'get_profile' })
                });
                const res = await response.json();
                
                if (res.status === 'success') {
                    finalizeLogin(res.data);
                    hideInitialPreloader(); // WERSJA 5.1.3 - Sukces logowania, odkrywamy gotowy interfejs!
                } else {
                    hideInitialPreloader();
                    logoutUser();
                }
            } catch (error) {
                console.error("Auto-login error", error);
                hideInitialPreloader(); 
                logoutUser(); // W przypadku błędu bezpieczniej wyrzucić do ekranu logowania
            }
        }

        function finalizeLogin(userData) {
            localStorage.setItem('familyChefEmail', userData.email);
            currentUserEmail = userData.email; 
            currentUserProfile = userData;
            
            document.getElementById('recipeServings').value = currentUserProfile.default_servings || 2;
            document.getElementById('generatorChef').value = currentUserProfile.default_chef || 'DEFAULT_CHEF';
            document.getElementById('generatorSkill').value = currentUserProfile.default_skill || 'DEFAULT_SKILL';
            
            updatePremiumBadge();
            document.getElementById('auth-overlay').classList.add('hidden');
            document.getElementById('app-container').classList.remove('hidden');
            document.getElementById('app-container').classList.add('flex');
            
            lucide.createIcons();
            loadDashboard();
        }
       
        // WERSJA 6.0.2 - [SECURITY FIRST: Bezpieczne wylogowywanie (ubijanie ciasteczek na backendzie)]
        async function logoutUser() { 
            localStorage.removeItem('familyChefEmail'); 
            localStorage.removeItem('supabaseToken'); // Czyścimy resztki starego systemu u obecnych userów
            localStorage.removeItem('supabaseRefreshToken'); 
            
            try {
                await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'same-origin',
                    body: JSON.stringify({ step: 'logout' })
                });
            } catch (e) {
                console.error("Błąd podczas wylogowywania:", e);
            }
            location.reload(); 
        }

// --- FUNKCJE OBSŁUGI DROPDOWNU (Dodaj to nad switchTab) ---
function toggleUserMenu(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('userDropdown');
    dropdown.classList.toggle('hidden');
    lucide.createIcons();
}

window.addEventListener('click', function(e) {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        dropdown.classList.add('hidden');
    }
});

// --- ZAKTUALIZOWANY switchTab ---
function switchTab(tabName) {
    ['generator', 'dashboard', 'shopping', 'profile'].forEach(tab => {
        const btn = document.getElementById('tab-' + tab);
        if (btn) {
            btn.className = "flex-1 py-4 px-1 sm:px-4 font-semibold text-charcoal_light border-b-2 border-transparent hover:text-terracotta flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-base transition-colors whitespace-nowrap";
        }
        document.getElementById('view-' + tab).classList.add('hidden');
    });

    const activeBtn = document.getElementById('tab-' + tabName);
    if (activeBtn) {
        activeBtn.className = "flex-1 py-4 px-1 sm:px-4 font-bold text-terracotta border-b-2 border-terracotta flex items-center justify-center gap-1 sm:gap-2 text-xs sm:text-base transition-colors whitespace-nowrap";
    }

    document.getElementById('view-' + tabName).classList.remove('hidden');

    if(tabName === 'dashboard') { 
        loadDashboard(); 
        document.getElementById('shoppingListFab').style.display = selectedRecipesForShopping.length > 0 ? 'block' : 'none'; 
    } else { 
        document.getElementById('shoppingListFab').style.display = 'none'; 
    }
   
    if(tabName === 'shopping') showShoppingDash();
    if(tabName === 'profile') {
        loadProfileData();
        document.getElementById('userDropdown').classList.add('hidden'); // Zamyka menu po wejściu w profil
    }
}

        async function loadDashboard() {
            var grid = document.getElementById("dashboard-grid");
            grid.innerHTML = `<div class="col-span-full text-center py-12"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto text-sage mb-2"></i><p class="text-charcoal_light font-semibold">Wczytuję z bazy...</p></div>`;
            lucide.createIcons();

            try {
                // WERSJA 4.7.0 - RLS SECURITY (Ciasteczka automatyczne)
                const fId = (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : '';
                
                // WERSJA 1.25.0 - DASHBOARD: Intercepcja 401 (Auto-Logout)
                const response = await fetch(`/api/get-dashboard?email=${encodeURIComponent(currentUserEmail)}&familyId=${encodeURIComponent(fId)}`);
                
                // Przerywamy i wylogowujemy, zanim frontend zdąży spanikować
                if (response.status === 401) {
                    alert("Twoja sesja wygasła ze względów bezpieczeństwa. Zaloguj się ponownie.");
                    logoutUser();
                    return;
                }

                const res = await response.json();

                if (res.status === 'success') {
                    allSavedRecipes = res.recipes || [];
                    // Normalizujemy kategorie w pamięci przy starcie
                    allSavedRecipes.forEach(r => r.category = normalizeCategory(r.category));
                    uniqueCategories = [...new Set(allSavedRecipes.map(r => r.category).filter(Boolean))];
                    
                    populateFilters(); 
                    applyFilters();    
                } else {
                    grid.innerHTML = `<p class="col-span-full text-terracotta text-center font-bold">Błąd: ${res.message}</p>`;
                }
            } catch (error) {
                console.error("Dashboard Fetch Error:", error);
                grid.innerHTML = `<p class="col-span-full text-terracotta text-center font-bold">Krytyczny błąd połączenia z serwerem.</p>`;
            }
        }

        // WERSJA 5.5.2 - [UX: Filtry oparte o pobrany Nick zamiast e-maila]
        function populateFilters() {
            const userSelect = document.getElementById('filterUser');
            const catSelect = document.getElementById('filterCategory');
            
            userSelect.innerHTML = '<option value="all">👨‍👩‍👧 Wszyscy</option>';
            catSelect.innerHTML = '<option value="all">🍽️ Kategorie</option>';
           
            // Tworzymy unikalną mapę użytkowników (email jako klucz dla wartości logicznych, name do wyświetlania)
            const usersMap = {};
            allSavedRecipes.forEach(r => {
                const email = String(r.author_email || r.author).trim().toLowerCase();
                if (email && email !== 'undefined') {
                    // Fallback do pierwszej części e-maila, jeśli backend z jakiegoś powodu nie zwróci name
                    usersMap[email] = r.author_name || email.split('@')[0];
                }
            });

Object.entries(usersMap).forEach(([email, name]) => {
                let safeName = escapeHTML(name);
                userSelect.innerHTML += `<option value="${escapeHTML(email)}">${safeName}${email === currentUserEmail ? " (Ty)" : ""}</option>`;
            });

            uniqueCategories.forEach(c => catSelect.innerHTML += `<option value="${escapeHTML(c)}">${escapeHTML(c)}</option>`);
        }

        // Funkcja wyciągnięta poza applyFilters (naprawa błędu scope'u)
        function toggleViewMode() {
            isListView = !isListView;
            const btn = document.getElementById('viewToggleBtn');
            // Zmieniamy ikonę (oraz tekst na mobile) w zależności od trybu
            btn.innerHTML = isListView 
                ? `<i data-lucide="grid" class="w-5 h-5"></i> <span class="md:hidden">Siatka</span>` 
                : `<i data-lucide="list" class="w-5 h-5"></i> <span class="md:hidden">Lista</span>`;
            lucide.createIcons();
            
            renderGrid(filteredRecipes);
        }

        function applyFilters() {
            const uFilter = document.getElementById('filterUser').value;
            const cFilter = document.getElementById('filterCategory').value;
            const searchVal = document.getElementById('searchRecipe').value.toLowerCase().trim();
            const sortVal = document.getElementById('sortRecipe').value;
            
            // 1. Filtrowanie (User + Kategoria + Wyszukiwanie tekstowe)
            filteredRecipes = allSavedRecipes.filter(r => {
                const matchUser = (uFilter === 'all' || String(r.author_email || r.author).trim().toLowerCase() === uFilter);
                const matchCat = (cFilter === 'all' || (r.category || 'Inne') === cFilter);
                const matchSearch = (r.title && r.title.toLowerCase().includes(searchVal));
                
                return matchUser && matchCat && matchSearch;
            });

            // 2. Sortowanie wyników
            filteredRecipes.sort((a, b) => {
                if (sortVal === 'newest') {
                    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                } else if (sortVal === 'oldest') {
                    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                } else if (sortVal === 'az') {
                    return String(a.title || '').localeCompare(String(b.title || ''), 'pl');
                } else if (sortVal === 'za') {
                    return String(b.title || '').localeCompare(String(a.title || ''), 'pl');
                }
                return 0;
            });
            
            renderGrid(filteredRecipes);
        }

// WERSJA 6.1.0 - [SECURITY FIRST: Globalna funkcja sanitizująca XSS]
const escapeHTML = (str) => {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (match) => {
        const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return escapeMap[match];
    });
};

// WERSJA 5.3.0 - [OPTYMALIZACJA DOM: DocumentFragment dla renderGrid]
function renderGrid(recipesToRender) {
    var grid = document.getElementById("dashboard-grid");
    grid.innerHTML = "";
    
    // Jeśli lista jest pusta
    if (recipesToRender.length === 0) {
         grid.innerHTML = `<p class="col-span-full text-center text-charcoal_light py-8 font-medium">Brak przepisów spełniających kryteria.</p>`;
         return;
    }

    // Dopasowanie kontenera: widok listy to kolumna z odstępami, widok siatki to grid
    grid.className = isListView 
        ? "flex flex-col gap-3" 
        : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6";

    // Inicjalizacja wirtualnego kontenera pamięciowego
    const fragment = document.createDocumentFragment();

    recipesToRender.forEach(recipe => {
        let authorEmail = recipe.author_email || recipe.author; 
        let isMe = String(authorEmail).trim().toLowerCase() === currentUserEmail;
        let isChecked = selectedRecipesForShopping.includes(recipe.id) ? 'checked' : '';
        
        // WERSJA 6.1.1 - SANITIZACJA ZMIENNYCH PRZED WSTRZYKNIĘCIEM DO DOM (Ochrona XSS)
        let displayAuthorName = escapeHTML(recipe.author_name || String(authorEmail || currentUserEmail).split('@')[0]);
        let safeTitle = escapeHTML(recipe.title || 'Bez tytułu');
        let safeCategory = escapeHTML(recipe.category || 'Inne');
        
        var card = document.createElement('div');
        let borderClass = isChecked ? 'border-sage ring-2 ring-sage/20 shadow-md' : 'border-black/5 shadow-sm';
        
        if (isListView) {
            // --- STRUKTURA DLA WIDOKU LISTY (Mobilna & Kompaktowa) ---
            card.className = `bg-white p-4 rounded-2xl ${borderClass} border hover:border-sage/30 hover:shadow-md transition cursor-pointer flex items-center gap-3 md:gap-4`;
            card.onclick = function() { openRecipe(recipe.id); };
            
            let deleteBtnListHtml = isMe ? `<button onclick="event.stopPropagation(); deleteRecipeAction('${recipe.id}')" class="text-charcoal_light hover:text-terracotta p-2 rounded-full hover:bg-terracotta/10 transition z-30 shrink-0" title="Usuń ten przepis"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';

            card.innerHTML = `
                <input type="checkbox" ${isChecked} onclick="event.stopPropagation(); toggleCart('${recipe.id}')" class="w-5 h-5 accent-sage rounded cursor-pointer shrink-0">
                <div class="flex-grow min-w-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                    <h3 class="font-bold text-base text-charcoal truncate">${safeTitle}</h3>
                    <span class="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[10px] uppercase font-bold px-2 py-0.5 rounded-md tracking-wider w-max">${safeCategory}</span>
                </div>
                <div class="hidden sm:flex text-xs text-charcoal_light font-mono shrink-0 items-center gap-1">
                    <i data-lucide="user" class="w-3 h-3"></i> ${displayAuthorName}
                </div>
                ${deleteBtnListHtml}
            `;
        } else {
            // --- STRUKTURA DLA WIDOKU KAFELEK (Klasyczna) ---
            card.className = `bg-white p-6 rounded-3xl ${borderClass} border hover:border-sage/30 hover:shadow-md transition cursor-pointer group relative flex flex-col`;
            card.onclick = function() { openRecipe(recipe.id); };
            
            let deleteBtnGridHtml = isMe ? `<button onclick="event.stopPropagation(); deleteRecipeAction('${recipe.id}')" class="absolute top-4 right-4 text-charcoal_light bg-cream/50 p-2 rounded-full hover:text-terracotta hover:bg-terracotta/10 transition z-30" title="Usuń ten przepis"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '';
            
            card.innerHTML = `
                ${deleteBtnGridHtml}
                <div class="flex items-center gap-2 mb-3 relative z-20 pr-12">
                    <input type="checkbox" ${isChecked} onclick="event.stopPropagation(); toggleCart('${recipe.id}')" class="w-5 h-5 accent-sage rounded cursor-pointer shrink-0">
                    <span class="bg-terracotta/10 text-terracotta border border-terracotta/20 text-[10px] uppercase font-bold px-2 py-1 rounded-md tracking-wider overflow-hidden text-ellipsis whitespace-nowrap">${safeCategory}</span>
                </div>
                <h3 class="font-bold text-lg text-charcoal leading-tight mb-2 pr-2">${safeTitle}</h3>
                <p class="text-xs text-charcoal_light font-mono mb-4 flex items-center gap-1"><i data-lucide="user" class="w-3 h-3"></i> ${displayAuthorName} &bull; ${recipe.created_at ? new Date(recipe.created_at).toLocaleDateString() : ''}</p>
                <div class="mt-auto pt-4 border-t border-charcoal/5 relative"><p class="text-sm text-charcoal_light">Kliknij, aby ugotować...</p></div>
            `;
        }
        // Wrzucamy do bufora pamięciowego, NIE do widoku
        fragment.appendChild(card);
    });
    
    // Na koniec wstrzykujemy cały bufor za jednym zamachem do DOM
    grid.appendChild(fragment);
    lucide.createIcons();
}

        function toggleCart(id) {
            const idx = selectedRecipesForShopping.indexOf(id);
            if (idx > -1) selectedRecipesForShopping.splice(idx, 1); else selectedRecipesForShopping.push(id);
            const fab = document.getElementById("shoppingListFab");
            if (selectedRecipesForShopping.length > 0) { fab.style.display = 'block'; document.getElementById("shoppingListCount").innerText = selectedRecipesForShopping.length; }
            else fab.style.display = 'none';
            renderGrid(filteredRecipes);
        }

        function populateCategoryDropdown(activeCat) {
            const select = document.getElementById("recipeCategorySelect");
            select.innerHTML = '';
            uniqueCategories.forEach(c => {
                select.innerHTML += `<option value="${c}" class="text-charcoal">${c}</option>`;
            });
            if (!uniqueCategories.includes(activeCat)) {
                select.innerHTML += `<option value="${activeCat}" class="text-charcoal">${activeCat}</option>`;
            }
            select.innerHTML += `<option value="NEW_CUSTOM" class="text-sage font-bold">+ DODAJ NOWĄ</option>`;
            select.value = activeCat;
        }

        async function changeCategoryHandler(newVal) {
            if (newVal === "NEW_CUSTOM") {
                const customCat = prompt("Wpisz nową kategorię:");
                if (customCat && customCat.trim() !== "") {
                    newVal = normalizeCategory(customCat);
                    const select = document.getElementById("recipeCategorySelect");
                    select.innerHTML = `<option value="${newVal}">${newVal}</option>` + select.innerHTML;
                    select.value = newVal;
                } else {
                    populateCategoryDropdown(currentRecipeData.category);
                    return;
                }
            }
            
            currentRecipeData.category = newVal;

            let authorEmail = currentRecipeData.author || currentRecipeData.author_email;
            let isMe = String(authorEmail).trim().toLowerCase() === currentUserEmail;

            if (isMe && currentRecipeData.id && currentRecipeData.id !== "temporary_saved") {
                // WERSJA 4.9.22 - RLS SECURITY: Edycja kategorii w bazie (Tylko własne przepisy)
                try {
                    await fetch('/api/update-recipe-category', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            recipeId: currentRecipeData.id, 
                            category: newVal
                            // Zero Trust: Backend ignoruje e-mail z body, bazuje na Tokenie JWT
                        })
                    });
                    loadDashboard(); 
                } catch (error) {
                    console.error("Błąd aktualizacji kategorii w bazie:", error);
                }
            } else if (!isMe && currentRecipeData.id) {
                // WERSJA 4.9.22 - Tryb klonowania przy zmianie kategorii cudzego przepisu!
                alert("Zmieniłeś kategorię przepisu innego domownika.\n\nAby zapisać tę wersję jako TWOJĄ nową pozycję w książce kucharskiej, kliknij 'Zapisz do bazy' na dole ekranu.");
                
                delete currentRecipeData.id; 
                currentRecipeData.author_email = currentUserEmail;
                currentRecipeData.author = currentUserEmail;
                
                setActionButtonsMode(false); // Wraca do trybu "Draftu" (Pokaż przycisk Zapisz)
            }
        }

        function setActionButtonsMode(isSaved) {
            if (isSaved) {
                document.getElementById('actionButtonsDraft').classList.add('hidden');
                document.getElementById('actionButtonsSaved').classList.remove('hidden');
            } else {
                document.getElementById('actionButtonsDraft').classList.remove('hidden');
                document.getElementById('actionButtonsSaved').classList.add('hidden');
            }
        }

        // WERSJA 4.8.1 - RLS SECURITY: Ciasteczka dla pobierania przepisu
        async function openRecipe(id) {
            startLoadingProcess("Pobieram przepis z bazy...");
            
            try {
                const response = await fetch(`/api/get-recipe?id=${id}`);
                const recipe = await response.json();

                if (recipe && !recipe.status) { 
                    currentRecipeData = {
                        id: recipe.id,
                        author: recipe.author_email,
                        title: recipe.title,
                        ingredients: recipe.ingredients,
                        instructions: recipe.instructions,
                        category: recipe.category || 'Inne',
                        servings: recipe.servings,
                        calories_per_serving: recipe.calories_per_serving,
                        // WERSJA 4.9.9.1 - Odczyt zapisanych odznak
                        usedChef: recipe.used_chef,
                        usedSkill: recipe.used_skill
                    };
                    
                    populateCategoryDropdown(currentRecipeData.category);
                    document.getElementById("recipeTitle").innerText = currentRecipeData.title;
                    
                    // WERSJA 3.2.0 - Renderowanie odznak dla pobranego przepisu
                    const badgesContainer = document.getElementById("recipeBadges");
                    badgesContainer.innerHTML = '';
                    if(currentRecipeData.servings) {
                        badgesContainer.innerHTML += `<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm flex items-center gap-1"><i data-lucide="users" class="w-3 h-3"></i> ${currentRecipeData.servings} porcje</span>`;
                    }
                    if(currentRecipeData.calories_per_serving) {
                         badgesContainer.innerHTML += `<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm flex items-center gap-1"><i data-lucide="flame" class="w-3 h-3"></i> ok. ${currentRecipeData.calories_per_serving} kcal/porcja</span>`;
// Wyliczanie całości (fallback do 'Brak danych', jeśli brakuje wartości w starej bazie)
                             const totalKcal = currentRecipeData.calories_per_serving * currentRecipeData.servings;
                             if(!isNaN(totalKcal)) {
                                 badgesContainer.innerHTML += `<span class="bg-white/10 text-white/80 px-3 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm shadow-sm flex items-center gap-1">(Całość: ${totalKcal} kcal)</span>`;
                             }
                        }

                        // WERSJA 4.9.9.2 - [POPRAWKA] Renderowanie odznak po odczycie z bazy
                        if (currentRecipeData.usedChef && CHEF_BADGES[currentRecipeData.usedChef]) {
                            badgesContainer.innerHTML += `<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm flex items-center gap-1">${CHEF_BADGES[currentRecipeData.usedChef]}</span>`;
                        }
                        if (currentRecipeData.usedSkill && SKILL_BADGES[currentRecipeData.usedSkill]) {
                            badgesContainer.innerHTML += `<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm flex items-center gap-1">${SKILL_BADGES[currentRecipeData.usedSkill]}</span>`;
                        }

                        badgesContainer.classList.remove('hidden');
                    
                    var ingList = document.getElementById("recipeIngredients");
                    ingList.innerHTML = ""; currentRecipeData.ingredients.forEach(i => { if(i) { let li = document.createElement("li"); li.innerText = i; ingList.appendChild(li); }});
                    
                    var instList = document.getElementById("recipeInstructions");
                    instList.innerHTML = ""; currentRecipeData.instructions.forEach(i => { if(i) { let li = document.createElement("li"); li.innerText = i; instList.appendChild(li); }});

                    setActionButtonsMode(true);
                    switchTab('generator'); 
                    document.getElementById("recipeContainer").classList.remove("hidden");
                    document.getElementById("feedbackContainer").style.display = "block";
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                    
                    document.getElementById("loadingMsg").classList.add("hidden"); 
                    document.getElementById("submitBtn").disabled = false;
                    lucide.createIcons(); // Ważne: renderowanie ikonek Lucide w wstrzykniętym HTML-u
                } else {
                    alert("Błąd: " + (recipe.message || "Nie udało się pobrać przepisu."));
                    onFailure({message: "Anulowano"});
                }
            } catch (error) {
                console.error("Error fetching recipe details:", error);
                alert("Krytyczny błąd połączenia.");
                onFailure({message: "Anulowano"});
            }
        }

        async function askChef() {
            var inputField = document.getElementById("userInput");
            if (!inputField.value) return alert("Wpisz pomysł!");
            startLoadingProcess("Szef kuchni pracuje... 👨‍🍳");
            
            try {
                // WERSJA 5.0.0 - RLS SECURITY: Ciasteczka dla endpointu AI
                const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
body: JSON.stringify({
                    email: currentUserEmail,
                    userMessage: inputField.value,
                    isAdjustment: false,
                    previousRecipe: null,
                    servings: parseInt(document.getElementById("recipeServings").value),
                    chefPersona: document.getElementById("generatorChef").value,
                    skillLevel: document.getElementById("generatorSkill").value
                })
            });

            // WERSJA 5.5.2 - [SAAS UX: Obsługa Timeoutów AI dla nowego przepisu]
            // Zabezpieczenie przed błędem parsowania JSON w przypadku awarii bramki Vercel/Gemini
            if (response.status === 504 || response.status === 502) {
                return onFailure({ message: "Nasz Szef Kuchni dostał zadyszki od nadmiaru zamówień. Odczekaj chwilę i spróbuj ponownie (Twój limit jest bezpieczny)." });
            }
            
            // WERSJA 4.9.9.2 - [POPRAWKA] Przekazywanie tagów z API do UI
            const res = await response.json();
                
                if (res.status === 'success') {
                    onSuccess({ 
                        status: "success", 
                        data: res.recipe, 
                        usedChef: res.usedChef, 
                        usedSkill: res.usedSkill 
                    });
                    inputField.value = "";
                } else {
                    onFailure({ message: res.message });
                }
            } catch (error) {
                console.error(error);
                onFailure({ message: "Krytyczny błąd połączenia z serwerem." });
            }
        }

        async function sendFeedback() {
            var feedbackInput = document.getElementById("feedbackInput");
            if (!feedbackInput.value) return alert("Napisz co zmienić!");
            startLoadingProcess("Koryguję... 🔄");
            
            try {
                // WERSJA 5.0.0 - RLS SECURITY: Ciasteczka dla poprawki przepisu
                const response = await fetch('/api/generate', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    // WERSJA 5.5.1 - [SAAS UX: Obsługa Timeoutów AI - Krok 4.2]
                    body: JSON.stringify({
                        email: currentUserEmail,
                        userMessage: feedbackInput.value,
                        isAdjustment: true,
                        previousRecipe: currentRecipeData,
                        servings: parseInt(document.getElementById("recipeServings").value),
                        chefPersona: document.getElementById("generatorChef").value,
                        skillLevel: document.getElementById("generatorSkill").value
                    })
                });

                if (response.status === 504 || response.status === 502) {
                    return onFailure({ message: "Nasz Szef Kuchni dostał zadyszki przy poprawkach. Odczekaj chwilę i spróbuj ponownie." });
                }
                
                // WERSJA 4.9.9.2 - [POPRAWKA] Przekazywanie tagów po użyciu Feedbacku
                const res = await response.json();
                
                if (res.status === 'success') {
                    onSuccess({ 
                        status: "success", 
                        data: res.recipe, 
                        usedChef: res.usedChef, 
                        usedSkill: res.usedSkill 
                    });
                    feedbackInput.value = "";
                } else {
                    onFailure({ message: res.message });
                }
            } catch (error) {
                console.error(error);
                onFailure({ message: "Krytyczny błąd połączenia z serwerem." });
            }
        }

        function startLoadingProcess(msg) {
            document.getElementById("loadingMsg").innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i><span>${msg}</span>`;
            document.getElementById("loadingMsg").classList.remove("hidden"); document.getElementById("loadingMsg").classList.add("flex");
            document.getElementById("recipeContainer").classList.add("hidden"); document.getElementById("submitBtn").disabled = true; lucide.createIcons();
        }

        function onSuccess(response) {
            document.getElementById("loadingMsg").classList.add("hidden"); document.getElementById("submitBtn").disabled = false;
            if (response.status === "success") {
                currentRecipeData = response.data;
                
                // WERSJA 4.9.21 - [BUGFIX: Przypisanie autorstwa do świeżego draftu AI]
                // Zapobiega to oznaczaniu własnych, nowo wygenerowanych przepisów jako "cudze"
                currentRecipeData.author_email = currentUserEmail;
                currentRecipeData.author = currentUserEmail;

                // WERSJA 4.9.9.2 - Zapisujemy metadane z API do głównego stanu, aby save-recipe.js mogło je odebrać i wrzucić do Supabase
                currentRecipeData.usedChef = response.usedChef;
                currentRecipeData.usedSkill = response.usedSkill;
                
                // Normalizujemy to, co wymyśliło AI
                currentRecipeData.category = normalizeCategory(currentRecipeData.category);
                populateCategoryDropdown(currentRecipeData.category);
                document.getElementById("recipeTitle").innerText = currentRecipeData.title;
                // WERSJA 3.2.0 - Renderowanie odznak
                const badgesContainer = document.getElementById("recipeBadges");
                badgesContainer.innerHTML = '';
                if(currentRecipeData.servings) {
                    badgesContainer.innerHTML += `<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm flex items-center gap-1"><i data-lucide="users" class="w-3 h-3"></i> ${currentRecipeData.servings} porcje</span>`;
                }
                if(currentRecipeData.calories_per_serving) {
                     badgesContainer.innerHTML += `<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm flex items-center gap-1"><i data-lucide="flame" class="w-3 h-3"></i> ok. ${currentRecipeData.calories_per_serving} kcal/porcja</span>`;
                     // Dodajemy też info o całości potrawy by było to ultra jasne
                     const totalKcal = currentRecipeData.calories_per_serving * currentRecipeData.servings;
                     if(!isNaN(totalKcal)) {
                        badgesContainer.innerHTML += `<span class="bg-white/10 text-white/80 px-3 py-1 rounded-full text-[10px] font-medium backdrop-blur-sm shadow-sm flex items-center gap-1">(Całość: ${totalKcal} kcal)</span>`;
                     }
                }
                
                // WERSJA 4.9.6 - Dynamiczne odznaki Persony i Poziomu
                if (response.usedChef && CHEF_BADGES[response.usedChef]) {
                    badgesContainer.innerHTML += `<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm flex items-center gap-1">${CHEF_BADGES[response.usedChef]}</span>`;
                }
                if (response.usedSkill && SKILL_BADGES[response.usedSkill]) {
                    badgesContainer.innerHTML += `<span class="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-bold backdrop-blur-sm shadow-sm flex items-center gap-1">${SKILL_BADGES[response.usedSkill]}</span>`;
                }

                badgesContainer.classList.remove('hidden');
                lucide.createIcons();
                var ingList = document.getElementById("recipeIngredients");
                ingList.innerHTML = ""; currentRecipeData.ingredients.forEach(i => { let li = document.createElement("li"); li.innerText = i; ingList.appendChild(li); });
                var instList = document.getElementById("recipeInstructions");
                instList.innerHTML = ""; currentRecipeData.instructions.forEach(i => { let li = document.createElement("li"); li.innerText = i; instList.appendChild(li); });
                setActionButtonsMode(false);
                document.getElementById("recipeContainer").classList.remove("hidden");
                document.getElementById("feedbackContainer").style.display = "block";
                document.getElementById("feedbackInput").value = "";
            } else alert("Błąd: " + response.message);
        }

        function onFailure(error) {
            document.getElementById("loadingMsg").classList.add("hidden"); document.getElementById("submitBtn").disabled = false;
            alert("Błąd połączenia: " + error.message);
        }

        async function saveOnlyAction() {
            if (!currentRecipeData) return;
            var btn = document.getElementById("saveOnlyBtn");
            var originalHtml = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Zapisywanie...`;
            btn.disabled = true; lucide.createIcons();
            
            // WERSJA 4.9.3 - RLS SECURITY: Ciasteczka przy zapisie do bazy
            try {
                const response = await fetch('/api/save-recipe', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: currentUserEmail,
                        familyId: (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null,
                        recipe: currentRecipeData
                    })
                });
                
                const res = await response.json();
                
                if (res.status === 'success') {
                    alert(res.message);
                    btn.innerHTML = `<i data-lucide="check" class="w-5 h-5"></i> Zapisano!`;
                    lucide.createIcons();
                    setTimeout(() => {
                        currentRecipeData.id = res.recipeId; 
                        setActionButtonsMode(true);
                        btn.innerHTML = originalHtml; btn.disabled = false;
                    }, 2000);
                } else {
                    alert("Błąd: " + res.message);
                    btn.innerHTML = originalHtml; btn.disabled = false; lucide.createIcons();
                }
            } catch (error) {
                console.error("Fetch Error:", error);
                alert("Krytyczny błąd połączenia z serwerem.");
                btn.innerHTML = originalHtml; btn.disabled = false; lucide.createIcons();
            }
        }

// WERSJA 4.9.21 - [SAAS SECURITY: Twarda walidacja Kodu Rodziny (Ochrona przed kolizją ID)]
        function promptFamilyChange() {
            const currentCode = document.getElementById('profileFamilyId').value;
            const msg = currentCode 
                ? "Wpisz kod rodziny partnera, aby połączyć wasze konta.\nJeśli chcesz stworzyć nową rodzinę, zostaw to pole puste i wciśnij OK:"
                : "Wpisz kod rodziny (otrzymany od partnera) lub zostaw to pole puste, aby serwer wygenerował Twój bezpieczny kod:";
                
            const newCode = prompt(msg, "");
            
            if (newCode !== null) {
                const finalCode = newCode.trim().toUpperCase();
                
                // --- FRONTEND WALIDACJA BEZPIECZEŃSTWA ---
                if (finalCode !== "" && finalCode.length < 8) {
                    alert("⚠️ Zbyt krótki kod!\n\nAby zapobiec przypadkowemu połączeniu kont z obcymi ludźmi, kod rodziny musi mieć minimum 8 znaków.\n\nZostaw pole puste, a serwer sam wygeneruje bezpieczny klucz.");
                    return;
                }
                if (finalCode !== "" && !/^[A-Z0-9-]+$/.test(finalCode)) {
                    alert("⚠️ Niedozwolone znaki!\n\nKod rodziny może zawierać wyłącznie litery (bez polskich znaków), cyfry oraz myślniki.");
                    return;
                }
                // -----------------------------------------

                const inputEl = document.getElementById('profileFamilyId');
                
                if (finalCode === "") {
                    inputEl.value = "";
                    inputEl.placeholder = "Serwer wygeneruje nowy kod po zapisie...";
                } else {
                    inputEl.value = finalCode;
                }
                
                inputEl.classList.remove('bg-cream/50', 'text-charcoal_light', 'cursor-not-allowed');
                inputEl.classList.add('bg-sage/10', 'text-sage_dark', 'ring-2', 'ring-sage');
                
                alert("Gotowe! Kliknij 'Zapisz zmiany' na dole ekranu, aby wysłać żądanie do serwera.");
            }
        }

        function loadProfileData() {
            if (currentUserProfile) {
                document.getElementById('profileEmailDisplay').innerText = currentUserEmail;
                
                // WERSJA 5.5.1 - Ładowanie Nazwy/Nicku (z fallbackiem do emaila)
                let defaultName = currentUserEmail.split('@')[0];
                let profileName = currentUserProfile.name;
                if (!profileName || profileName === 'Nowy Szef Kuchni') {
                    profileName = defaultName;
                }
                document.getElementById('profileName').value = profileName;

                document.getElementById('profileFamilyId').value = currentUserProfile.family_id || "";
                document.getElementById('profilePreferences').value = currentUserProfile.preferences || "";
                document.getElementById('profileServings').value = currentUserProfile.default_servings || 2;
                // WERSJA 4.0.0 - Ładowanie Persony do widoku ustawień profilu
                document.getElementById('profileChef').value = currentUserProfile.default_chef || 'DEFAULT_CHEF';
                document.getElementById('profileSkill').value = currentUserProfile.default_skill || 'DEFAULT_SKILL';

                // WERSJA 4.9.23 - [SAAS TRANSPARENCY FIX: Zawsze widoczny licznik dla spokoju ducha użytkownika]
                const membersBtn = document.getElementById('familyMembersBtn');
                const membersCount = document.getElementById('familyMembersCount');
                
                // Pokazujemy przycisk ZAWSZE, gdy jesteśmy w jakiejś rodzinie (nawet jeśli jesteśmy w niej sami)
                if (currentUserProfile.family_members && currentUserProfile.family_members.length > 0) {
                    membersCount.innerText = currentUserProfile.family_members.length;
                    membersBtn.classList.remove('hidden');
                } else {
                    membersBtn.classList.add('hidden');
                }
            }
        }

        // WERSJA 4.9.22 - Pop-up pokazujący domowników
        function showFamilyMembers() {
            if (!currentUserProfile || !currentUserProfile.family_members) return;
            const membersList = currentUserProfile.family_members.map(email => 
                email === currentUserEmail ? `- ${email} (To Ty)` : `- ${email}`
            ).join("\n");
            
            alert("Osoby przypisane do tego Kodu Rodziny:\n\n" + membersList + "\n\nJeśli widzisz tu kogoś niepożądanego, kliknij 'Zmień Kod' powyżej.");
        }

        async function saveUserProfile() {
            const fId = document.getElementById('profileFamilyId').value;
            const pref = document.getElementById('profilePreferences').value || "Brak wytycznych";
            const serv = parseInt(document.getElementById('profileServings').value) || 2;
            const chef = document.getElementById('profileChef').value;
            const skill = document.getElementById('profileSkill').value;
            // WERSJA 5.5.1 - Pobranie wpisanego Nicku
            const newName = document.getElementById('profileName').value.trim();
            
            // WERSJA 4.0.0 - Soft Paywall
            if (!currentUserProfile.is_premium && (chef !== 'DEFAULT_CHEF' || skill !== 'DEFAULT_SKILL')) {
                alert("⭐ Zapisanie innej persony lub poziomu niż domyślne wymaga pakietu Premium! (Wkrótce dostępne)");
                // Przywracamy domyślne wartości
                document.getElementById('profileChef').value = 'DEFAULT_CHEF';
                document.getElementById('profileSkill').value = 'DEFAULT_SKILL';
                return;
            }

            const btn = document.getElementById('saveProfileBtn'); 
            const oHtml = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Zapisywanie...`; 
            btn.disabled = true; lucide.createIcons();

            // WERSJA 4.8.3 - RLS SECURITY: Ciasteczka do aktualizacji profilu
            try {
                const response = await fetch('/api/update-user-profile', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        email: currentUserEmail, 
                        name: newName, // WERSJA 5.5.1 - Wysyłka nicku do bazy
                        familyId: fId, 
                        preferences: pref, 
                        defaultServings: serv,
                        defaultChef: chef, 
                        defaultSkill: skill 
                    })
                });
                const res = await response.json();

                if (res.status === 'success') {
                    btn.innerHTML = `<i data-lucide="check" class="w-5 h-5 text-sage"></i> Zapisano`;
                    currentUserProfile.name = newName; // WERSJA 5.5.1 - Aktualizacja nicku w pamięci sesji
                    currentUserProfile.family_id = res.newFamilyId || fId;
                    currentUserProfile.preferences = pref;
                    currentUserProfile.default_servings = serv;
                    currentUserProfile.default_chef = chef;
                    currentUserProfile.default_skill = skill;
                    
                    document.getElementById('profileFamilyId').value = currentUserProfile.family_id;
                    // WERSJA 4.0.0 - Odświeżamy też inputy w kreatorze w razie przełączenia zakładek
                    document.getElementById('recipeServings').value = serv;
                    document.getElementById('generatorChef').value = chef;
                    document.getElementById('generatorSkill').value = skill;

                    // WERSJA 6.1.2 - [SAAS SECURITY: Proactive Refresh via Cookies]
                    // Wymuszamy odświeżenie ciasteczka na backendzie (przeglądarka sama dołączy stare ciastko)
                    fetch('/api/auth', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'same-origin',
                        body: JSON.stringify({ step: 'refresh' })
                    }).then(r => r.json()).then(data => {
                        if (data.status === 'success') {
                            console.log("🔒 Sesja (Ciasteczka) zsynchronizowana z nowym Family ID.");
                        }
                    }).catch(e => console.error("Błąd odświeżania ciasteczka po zapisie profilu", e));
                } else {
                    alert(res.message);
                    btn.innerHTML = oHtml;
                }
            } catch (error) {
                alert("Błąd połączenia z serwerem.");
                btn.innerHTML = oHtml;
            }
            setTimeout(() => { btn.innerHTML = oHtml; btn.disabled = false; lucide.createIcons(); }, 2000);
        }

        // WERSJA 4.9.10 - Github-style Hard Delete Flow (SaaS UI)
        function initiateDeleteAccount() {
            document.getElementById('deleteAccountSection').classList.add('hidden');
            document.getElementById('deleteAccountConfirmSection').classList.remove('hidden');
            document.getElementById('deleteEmailHint').innerText = currentUserEmail;
            document.getElementById('deleteAccountInput').value = '';
            validateDeleteInput(); // Resetuje stan przycisku
            lucide.createIcons();
        }

        function cancelDeleteAccount() {
            document.getElementById('deleteAccountConfirmSection').classList.add('hidden');
            document.getElementById('deleteAccountSection').classList.remove('hidden');
        }

        function validateDeleteInput() {
            const input = document.getElementById('deleteAccountInput').value.trim().toLowerCase();
            const emailToMatch = currentUserEmail.trim().toLowerCase();
            const btn = document.getElementById('finalDeleteBtn');
            
            if (input === emailToMatch) {
                btn.disabled = false;
                btn.classList.remove('bg-terracotta/40', 'cursor-not-allowed');
                btn.classList.add('bg-terracotta', 'hover:bg-terracotta/90', 'shadow-md');
            } else {
                btn.disabled = true;
                btn.classList.add('bg-terracotta/40', 'cursor-not-allowed');
                btn.classList.remove('bg-terracotta', 'hover:bg-terracotta/90', 'shadow-md');
            }
        }

        async function executeDeleteAccount() {
            const btn = document.getElementById('finalDeleteBtn');
            const oHtml = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Usuwanie...`;
            btn.disabled = true; lucide.createIcons();

            // RLS SECURITY: Ciasteczka + Hard Delete Backend Call
            try {
                const response = await fetch('/api/delete-user', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ email: currentUserEmail })
                });
                const res = await response.json();

                if (res.status === 'success') {
                    alert("Twoje konto i wszystkie dane zostały trwale usunięte z naszych serwerów.\n\nZostaniesz wylogowany.");
                    logoutUser(); 
                } else {
                    alert("Błąd serwera: " + res.message);
                    btn.innerHTML = oHtml; btn.disabled = false; lucide.createIcons();
                }
            } catch (error) {
                alert("Krytyczny błąd połączenia z serwerem.");
                btn.innerHTML = oHtml; btn.disabled = false; lucide.createIcons();
            }
        }

        // WERSJA 4.9.20 - [UX: Podwójne potwierdzenie dla pojedynczego usunięcia przepisu (Idiot-proof Check)]
        async function deleteRecipeAction(recipeId) {
            // Etap 1: Standardowe ostrzeżenie
            if (!confirm("⚠️ UWAGA! Zamierzasz usunąć ten przepis. Kontynuować?")) return;
            
            // Etap 2: Twarda blokada psychologiczna
            if (!confirm("Ostatnie ostrzeżenie. Usunięcie tego przepisu jest absolutnie nieodwracalne. Na pewno usunąć?")) return;

            var grid = document.getElementById("dashboard-grid"); 
            grid.innerHTML = `<div class="col-span-full text-center py-12"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-3 text-terracotta"></i> Usuwanie...</div>`; 
            lucide.createIcons();
            
            // WERSJA 4.9.7 - RLS SECURITY: Ciasteczka dla pojedynczego usunięcia przepisu
            try {
                await fetch('/api/delete-recipe', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        recipeId: recipeId 
                        // ZERO TRUST: Usunięto email
                    })
                });
                loadDashboard(); 
            } catch (error) {
                alert("Błąd połączenia.");
                loadDashboard();
            }
        }

        async function fetchShoppingLists() {
            document.getElementById('shoppingListsGrid').innerHTML = `<div class="col-span-full text-center py-10 text-charcoal_light"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i></div>`;
            lucide.createIcons();
            
            // WERSJA 4.7.1 - Ciasteczka automatyczne do list zakupów z frontendu
            try {
                const fId = (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : '';
                
                // WERSJA 1.25.0 - SHOPPING LISTS: Intercepcja 401 (Auto-Logout)
                const response = await fetch(`/api/get-shopping-lists?email=${encodeURIComponent(currentUserEmail)}&familyId=${encodeURIComponent(fId)}`);
                
                if (response.status === 401) {
                    alert("Twoja sesja wygasła ze względów bezpieczeństwa. Zaloguj się ponownie.");
                    logoutUser();
                    return;
                }

                const res = await response.json();

                if (res.status === 'success') {
                    // WERSJA 5.5.2 - Dodanie pobranego author_name do obiektu w pamięci
                    allShoppingLists = res.lists.map(listObj => {
                        return {
                            id: listObj.id,
                            title: listObj.title,
                            date: listObj.created_at,       
                            author: listObj.author_email,
                            author_name: listObj.author_name,
                            data: listObj.data,
                            linked_recipes: listObj.linked_recipes || [] // NOWE: Pobieramy powiązane przepisy z bazy
                        };
                    });
                    
                    renderShoppingListsDash();
                } else {
                    document.getElementById('shoppingListsGrid').innerHTML = `<div class="col-span-full text-center text-terracotta">Błąd pobierania list: ${res.message}</div>`;
                }
            } catch (error) {
                console.error("Krytyczny błąd zapytania:", error);
                document.getElementById('shoppingListsGrid').innerHTML = `<div class="col-span-full text-center text-terracotta font-bold">Krytyczny błąd połączenia z bazą. Odśwież stronę.</div>`;
            }
        }

// WERSJA 5.3.0 - [OPTYMALIZACJA DOM: DocumentFragment dla renderShoppingListsDash]
function renderShoppingListsDash() {
    const grid = document.getElementById('shoppingListsGrid');
    grid.innerHTML = '';
   
    if (allShoppingLists.length === 0) {
        grid.innerHTML = `<div class="col-span-full text-center py-10 text-charcoal_light bg-white rounded-3xl border border-charcoal/5 shadow-sm">Nie masz żadnych list zakupów. Zaznacz przepisy w Bazie i kliknij 'Stwórz Listę'.</div>`;
        return;
    }

    const fragment = document.createDocumentFragment();

allShoppingLists.forEach(list => {
            let totalItems = 0; let checkedItems = 0;
            list.data.forEach(g => g.items.forEach(i => { totalItems++; if(i.checked) checkedItems++; }));
            const progress = totalItems === 0 ? 0 : Math.round((checkedItems/totalItems)*100);

            const card = document.createElement('div');
            card.className = "bg-white p-5 rounded-2xl border border-charcoal/5 shadow-sm hover:border-sage/30 hover:shadow-md transition cursor-pointer relative flex flex-col";
            card.onclick = () => openShoppingListDetail(list.id);

            // SANITIZACJA DANYCH
            let displayAuthorName = list.author_name || String(list.author).split('@')[0];
            let safeTitle = escapeHTML(list.title);
            let safeAuthorName = escapeHTML(displayAuthorName);

            card.innerHTML = `
                <div class="flex justify-between items-start mb-3 pr-8">
                    <h3 class="font-bold text-charcoal leading-tight">${safeTitle}</h3>
                </div>
                <button onclick="event.stopPropagation(); deleteShoppingListFromDash('${list.id}')" class="absolute top-4 right-4 p-2 text-charcoal_light hover:text-terracotta hover:bg-terracotta/10 rounded-full transition z-20"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                <p class="text-xs text-charcoal_light mb-4 font-mono"><i data-lucide="calendar" class="w-3 h-3 inline mr-1"></i>${new Date(list.date).toLocaleDateString()} • ${safeAuthorName}</p>
           
                <div class="mt-auto w-full bg-charcoal/5 rounded-full h-2.5 mb-1 overflow-hidden">
                    <div class="bg-sage h-2.5 rounded-full transition-all" style="width: ${progress}%"></div>
                </div>
                <div class="text-xs text-right text-charcoal_light font-bold">${checkedItems}/${totalItems} produktów</div>
            `;
            fragment.appendChild(card);
        });
    
    grid.appendChild(fragment);
    lucide.createIcons();
}

        function showShoppingDash() {
            document.getElementById('shoppingDashView').style.display = 'block';
            document.getElementById('shoppingDetailView').style.display = 'none';
            fetchShoppingLists();
        }

        function openShoppingListDetail(listId) {
            const list = allShoppingLists.find(l => l.id === listId);
            if (!list) return;
           
            activeShoppingListId = list.id;
            activeShoppingListArray = list.data;
            activeShoppingTitle = list.title;
            activeLinkedRecipes = list.linked_recipes || []; // NOWE: Ładujemy plan posiłków do pamięci UI
            document.getElementById('activeShoppingTitle').innerText = list.title;

            document.getElementById('shoppingDashView').style.display = 'none';
            document.getElementById('shoppingDetailView').style.display = 'block';
            renderShoppingListUI();
        }

        async function deleteShoppingListFromDash(listId) {
            if (!confirm("Usunąć tę listę zakupów?")) return;
            // WERSJA 4.8.5 - RLS SECURITY: Ciasteczka dla usuwania listy z dashboardu
            try {
                const fId = (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null;
                
                await fetch('/api/delete-shopping-list', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                        body: JSON.stringify({ 
                        listId: listId 
                        // ZERO TRUST: Usunięto email i familyId
                    })
                });
                fetchShoppingLists(); 
            } catch (error) {
                alert("Błąd usuwania listy.");
            }
        }

        async function deleteActiveShoppingList() {
            if (!confirm("Na pewno usunąć tę listę?")) return;
            const btn = document.getElementById('clearShoppingBtn');
            btn.innerText = "Usuwanie...";
            // WERSJA 4.8.6 - RLS SECURITY: Ciasteczka dla usuwania aktywnej listy
            try {
                const fId = (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null;
                
                await fetch('/api/delete-shopping-list', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
  
                    body: JSON.stringify({ 
                        listId: activeShoppingListId 
                        // ZERO TRUST: Usunięto email i familyId
                    })
                });
                btn.innerText = "Usuń tę listę";
                showShoppingDash(); 
            } catch (error) {
                alert("Błąd usuwania listy.");
                btn.innerText = "Usuń tę listę";
            }
        }

        let syncTimeout;
        function toggleShoppingItem(gIdx, iIdx) {
            activeShoppingListArray[gIdx].items[iIdx].checked = !activeShoppingListArray[gIdx].items[iIdx].checked;
            renderShoppingListUI();
            
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(async () => {
                try {
                    const fId = (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null;
                    
                    // WERSJA 4.8.2 - RLS SECURITY: Ciasteczka do aktualizacji listy
                    await fetch('/api/update-shopping-list', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            listId: activeShoppingListId, 
                            email: currentUserEmail, 
                            familyId: fId,
                            listData: activeShoppingListArray 
                        })
                    });
                } catch (error) {
                    console.error("Błąd zapisu checkboxa:", error);
                }
            }, 1000);
        }

        async function generateShoppingListAction() {
            if (selectedRecipesForShopping.length === 0) return;
            const btn = document.querySelector('#shoppingListFab button'); const oHtml = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Tworzę listę...`; 
            btn.disabled = true; lucide.createIcons();
            
            try {
                // WERSJA 5.0.0 - RLS SECURITY: Ciasteczka dla generowania masowej listy
                const response = await fetch('/api/generate-shopping-list', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: currentUserEmail,
                        familyId: (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null,
                        recipeIds: selectedRecipesForShopping
                    })
                });
                
                const res = await response.json();
                
                btn.innerHTML = oHtml; btn.disabled = false; lucide.createIcons();
                
                if (res.status === 'success') {
                    selectedRecipesForShopping = []; 
                    document.getElementById("shoppingListFab").style.display = 'none';
                    renderGrid(filteredRecipes); 
                    switchTab('shopping'); 
                } else {
                    alert("Błąd: " + res.message);
                }
            } catch (error) {
                console.error("Błąd generowania listy:", error);
                alert("Krytyczny błąd połączenia z serwerem.");
                btn.innerHTML = oHtml; btn.disabled = false; lucide.createIcons();
            }
        }

// WERSJA 4.4.0 - Logika własnych list zakupów AI
        function toggleCustomListInput() {
            const container = document.getElementById('customListContainer');
            container.classList.toggle('hidden');
            if(!container.classList.contains('hidden')) {
                document.getElementById('customListInput').focus();
            }
        }

// WERSJA 4.5.1 - Poprawiona funkcja tworzenia listy
        async function generateCustomShoppingList() {
            const inputField = document.getElementById('customListInput');
            const rawText = inputField.value.trim();
            if (!rawText) return alert("Wpisz produkty, które chcesz kupić!");

            const btn = document.getElementById('customListSubmitBtn');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Organizuję...`;
            btn.disabled = true; lucide.createIcons();

            try {
                const fId = (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null;
                // WERSJA 5.0.0 - RLS SECURITY: Ciasteczka dla własnej listy
                const response = await fetch('/api/generate-custom-shopping-list', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: currentUserEmail,
                        familyId: fId,
                        rawItems: rawText
                    })
                });

                const res = await response.json();

                if (res.status === 'success') {
                    inputField.value = "";
                    toggleCustomListInput();
                    fetchShoppingLists(); // Odśwież widok by pokazać nową listę
                } else {
                    alert("Błąd: " + res.message);
                }
            } catch (error) {
                console.error(error);
                alert("Krytyczny błąd połączenia z serwerem.");
            } finally {
                btn.innerHTML = originalHtml; btn.disabled = false; lucide.createIcons();
            }
        }

        // WERSJA 4.5.0 - Logika dodawania produktów do ISTNIEJĄCEJ listy
        async function addItemsToExistingList() {
            const inputField = document.getElementById('addMoreItemsInput');
            const rawText = inputField.value.trim();
            if (!rawText) return alert("Wpisz produkty, które chcesz dopisać!");

            const btn = document.getElementById('addMoreItemsBtn');
            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Dodaję...`;
            btn.disabled = true; lucide.createIcons();

            try {
                const fId = (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null;
                
                // Używamy tego samego endpointu, ale podajemy 'listId'
                const response = await fetch('/api/generate-custom-shopping-list', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: currentUserEmail,
                        familyId: fId,
                        rawItems: rawText,
                        listId: activeShoppingListId // <-- KLUCZOWE: Mówi backendowi, że to Update
                    })
                });

                const res = await response.json();

                if (res.status === 'success') {
                    inputField.value = "";
                    
                    // Odświeżamy listy z bazy w tle, aby pobrać "zmergowanego" JSONa
                    await fetchShoppingLists(); 
                    
                    // Aktualizujemy aktualny widok nowymi danymi
                    const updatedList = allShoppingLists.find(l => l.id === activeShoppingListId);
                    if (updatedList) {
                        activeShoppingListArray = updatedList.data;
                        renderShoppingListUI();
                    }
                } else {
                    alert("Błąd: " + res.message);
                }
            } catch (error) {
                console.error(error);
                alert("Krytyczny błąd połączenia z serwerem.");
            } finally {
                btn.innerHTML = originalHtml; btn.disabled = false; lucide.createIcons();
            }
        }

// WERSJA 4.9.5 - MASOWE USUWANIE PRZEPISÓW (Bulk Delete z 2-stopniowym RODO-safe potwierdzeniem)
        // WERSJA 4.9.13 - [ZABEZPIECZENIE: Blokada usuwania cudzych przepisów z poziomu koszyka]
        async function bulkDeleteRecipesAction() {
            if (selectedRecipesForShopping.length === 0) return;
            
            // Zabezpieczenie: Sprawdzamy czy w koszyku są przepisy, których autorem NIE JEST obecny użytkownik
            const foreignRecipes = allSavedRecipes.filter(r => 
                selectedRecipesForShopping.includes(r.id) && 
                String(r.author_email || r.author).trim().toLowerCase() !== currentUserEmail
            );

            if (foreignRecipes.length > 0) {
                alert(`Zaraz, zaraz! Próbujesz usunąć ${foreignRecipes.length} przepis(ów) należących do kogoś z Twojej rodziny.\n\nZe względów bezpieczeństwa możesz usuwać wyłącznie własne przepisy. Odznacz je z koszyka, aby kontynuować.`);
                return; // Blokada wykonania akcji
            }

            const count = selectedRecipesForShopping.length;
            
            // Etap 1: Standardowe ostrzeżenie
            if (!confirm(`⚠️ UWAGA! Zamierzasz usunąć ${count} zaznaczonych przepisów. Kontynuować?`)) return;
            
            // Etap 2: Twarda blokada psychologiczna (tzw. "Idiot-proof Check")
            if (!confirm(`Ostatnie ostrzeżenie. Usunięcie ${count} przepisów jest absolutnie nieodwracalne. Na pewno usunąć?`)) return;

            const fab = document.getElementById("shoppingListFab");
            const originalHtml = fab.innerHTML;
            
            // Estetyczny stan ładowania w czerwonym tonie
            fab.innerHTML = `<div class="max-w-xs mx-auto bg-white px-6 py-4 rounded-full shadow-2xl font-bold flex justify-center gap-3 text-terracotta pointer-events-auto border-4 border-terracotta/20"><i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Usuwanie...</div>`;
            lucide.createIcons();

            // WERSJA 4.9.8 - RLS SECURITY: Ciasteczka dla masowego usuwania
            try {
                const response = await fetch('/api/delete-recipe', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        recipeIds: selectedRecipesForShopping
                        // ZERO TRUST: Usunięto email
                    })
                });
                
                const res = await response.json();
                
                if (res.status === 'success') {
                    // Czyścimy koszyk i przeładowujemy widok z bazy
                    selectedRecipesForShopping = []; 
                    fab.style.display = 'none';
                    fab.innerHTML = originalHtml; 
                    loadDashboard(); 
                } else {
                    alert("Błąd bazy danych: " + res.message);
                    fab.innerHTML = originalHtml; lucide.createIcons();
                }
            } catch (error) {
                console.error("Błąd masowego usuwania:", error);
                alert("Krytyczny błąd połączenia z serwerem.");
                fab.innerHTML = originalHtml; lucide.createIcons();
            }
        }

// --- NOWE: RENDEROWANIE I OBSŁUGA PLANU POSIŁKÓW W KOSZYKU ---
        function renderShoppingMealPlan() {
            const container = document.getElementById('shoppingMealPlan');
            const itemsDiv = document.getElementById('shoppingMealPlanItems');
            itemsDiv.innerHTML = '';

            // Jeśli ta lista nie ma żadnych przypisanych przepisów, ukrywamy sekcję
            if (!activeLinkedRecipes || activeLinkedRecipes.length === 0) {
                container.classList.add('hidden');
                return;
            }

            container.classList.remove('hidden');
            
            activeLinkedRecipes.forEach(recipe => {
                const safeTitle = escapeHTML(recipe.title);
                // Stylizacja różna dla odznaczonych vs do ugotowania
                const isCookedClass = recipe.is_cooked ? 'line-through text-charcoal/40 bg-charcoal/5 border-charcoal/10' : 'text-charcoal bg-white border-sage/30 hover:border-sage shadow-sm';
                const iconClass = recipe.is_cooked ? 'text-sage' : 'text-charcoal/20 hover:text-sage';
                const iconName = recipe.is_cooked ? 'check-square' : 'square';

                itemsDiv.innerHTML += `
                    <div class="flex items-center gap-3 p-3 rounded-xl border transition ${isCookedClass}">
                        <div onclick="toggleCookedRecipe('${recipe.id}')" class="shrink-0 cursor-pointer p-1" title="Zaznacz jako ugotowane">
                            <i data-lucide="${iconName}" class="w-5 h-5 transition ${iconClass}"></i>
                        </div>
                        <span onclick="openRecipe('${recipe.id}')" class="text-sm font-bold flex-grow cursor-pointer hover:text-terracotta transition" title="Kliknij, aby otworzyć przepis w kreatorze">${safeTitle}</span>
                    </div>
                `;
            });
            lucide.createIcons();
        }

        function toggleCookedRecipe(recipeId) {
            const recipe = activeLinkedRecipes.find(r => r.id === recipeId);
            if (recipe) {
                recipe.is_cooked = !recipe.is_cooked; // Zmieniamy stan w pamięci
                renderShoppingMealPlan(); // Natychmiastowo przerysowujemy kafelki (UX)
                
                // Opóźniony zapis w tle, żeby nie spamować bazy przy szybkim klikaniu
                clearTimeout(syncTimeout);
                syncTimeout = setTimeout(async () => {
                    try {
                        await fetch('/api/update-shopping-list', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ 
                                listId: activeShoppingListId, 
                                linkedRecipes: activeLinkedRecipes // Wysyłamy nowy stan planu
                            })
                        });
                        
                        // Zapisujemy nowy stan również w liście "matce", by nie resetował się po wyjściu z detali
                        const listIndex = allShoppingLists.findIndex(l => l.id === activeShoppingListId);
                        if(listIndex > -1) allShoppingLists[listIndex].linked_recipes = activeLinkedRecipes;
                        
                    } catch (error) {
                        console.error("Błąd zapisu planu posiłków:", error);
                    }
                }, 1000);
            }
        }
// ----------------------------------------------------

// WERSJA 5.4.0.1 - [UX MOBILE FIX: Stała widoczność ikon usuwania z bezpiecznym hitboxem]
        function renderShoppingListUI() {
            renderShoppingMealPlan(); // Wywołujemy przerysowanie planu przy każdym przeładowaniu UI koszyka
            
            const content = document.getElementById('shoppingContent'); 
            content.innerHTML = "";
            const fragment = document.createDocumentFragment();
            
            let hasCheckedItems = false;
            let checkedItemsHtml = "";
            
            activeShoppingListArray.forEach((group, gIndex) => {
                // SANITIZACJA KATEGORII
                const safeCategory = escapeHTML(group.category);

                // 1. Wyciągamy tylko NIEKUPIONE produkty
                const uncheckedItems = group.items.map((item, iIndex) => ({item, iIndex})).filter(x => !x.item.checked);
                
                if (uncheckedItems.length > 0) {
                    const grpDiv = document.createElement('div');
                    grpDiv.innerHTML = `<h3 class="font-bold text-sage_dark mb-2 border-b border-charcoal/5 pb-1">${safeCategory}</h3>`;
                
                    const ul = document.createElement('div'); 
                    ul.className = "space-y-2 mb-4";
                    
                    let itemsHtml = "";
                    uncheckedItems.forEach(({item, iIndex}) => {
                        // SANITIZACJA NAZWY PRODUKTU (Niekupione)
                        const safeItemName = escapeHTML(item.name);
                        
                        itemsHtml += `
                            <div class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl border bg-white border-charcoal/5 shadow-sm hover:border-sage/30 transition">
                                <div onclick="toggleShoppingItem(${gIndex}, ${iIndex})" class="mt-0.5 shrink-0 cursor-pointer p-1">
                                    <i data-lucide="square" class="text-charcoal/20 w-5 h-5 hover:text-sage transition"></i>
                                </div>
                                <span onclick="toggleShoppingItem(${gIndex}, ${iIndex})" class="text-sm font-semibold flex-grow cursor-pointer">${safeItemName}</span>
                                <button onclick="deleteShoppingItem(${gIndex}, ${iIndex})" class="text-charcoal/20 hover:text-terracotta transition p-3 -mr-2 shrink-0 flex items-center justify-center" title="Usuń produkt">
                                    <i data-lucide="x" class="w-4 h-4"></i>
                                </button>
                            </div>
                        `;
                    });
                    ul.innerHTML = itemsHtml;
                    grpDiv.appendChild(ul);
                    fragment.appendChild(grpDiv);
                }

                // 2. Zbieramy KUPIONE produkty
                const checkedItems = group.items.map((item, iIndex) => ({item, iIndex})).filter(x => x.item.checked);
                if (checkedItems.length > 0) {
                    hasCheckedItems = true;
                    checkedItems.forEach(({item, iIndex}) => {
                        // SANITIZACJA NAZWY PRODUKTU (Kupione)
                        const safeItemNameChecked = escapeHTML(item.name);
                        
                        checkedItemsHtml += `
                            <div class="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl border item-checked transition">
                                <div onclick="toggleShoppingItem(${gIndex}, ${iIndex})" class="mt-0.5 shrink-0 cursor-pointer p-1">
                                    <i data-lucide="check-square" class="text-sage w-5 h-5"></i>
                                </div>
                                <span onclick="toggleShoppingItem(${gIndex}, ${iIndex})" class="text-sm font-semibold flex-grow cursor-pointer line-through">${safeItemNameChecked}</span>
                                <button onclick="deleteShoppingItem(${gIndex}, ${iIndex})" class="text-charcoal/30 hover:text-terracotta transition p-3 -mr-2 shrink-0 flex items-center justify-center" title="Usuń produkt">
                                    <i data-lucide="x" class="w-4 h-4"></i>
                                </button>
                            </div>
                        `;
                    });
                }
            });
            
            content.appendChild(fragment);

            // 3. Renderujemy sekcję KUPIONE
            if (hasCheckedItems) {
                const boughtDiv = document.createElement('div');
                boughtDiv.className = "mt-8 pt-4 border-t-2 border-dashed border-charcoal/10";
                boughtDiv.innerHTML = `
                    <h3 class="font-bold text-charcoal_light mb-3 flex items-center gap-2">
                        <i data-lucide="check-circle-2" class="w-5 h-5"></i> Kupione
                    </h3>
                    <div class="space-y-2 opacity-70">
                        ${checkedItemsHtml}
                    </div>
                `;
                content.appendChild(boughtDiv);
            }
            
            lucide.createIcons();
        }

        // WERSJA 5.4.1 - [LOGIKA: Usuwanie pojedynczych produktów z listy zakupów (Manual Clean)]
        function deleteShoppingItem(gIdx, iIdx) {
            // 1. Usuwamy produkt z odpowiedniej kategorii w tablicy
            activeShoppingListArray[gIdx].items.splice(iIdx, 1);

            // 2. Jeśli po usunięciu kategoria jest pusta, całkowicie ją usuwamy
            if (activeShoppingListArray[gIdx].items.length === 0) {
                activeShoppingListArray.splice(gIdx, 1);
            }

            // 3. Natychmiastowe przerenderowanie UI frontendu
            renderShoppingListUI();

            // 4. Zapis w tle do Supabase (wykorzystujemy ten sam debouncer co przy checkboksach)
            clearTimeout(syncTimeout);
            syncTimeout = setTimeout(async () => {
                try {
                    const fId = (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null;
                    
                    await fetch('/api/update-shopping-list', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ 
                            listId: activeShoppingListId, 
                            familyId: fId,
                            listData: activeShoppingListArray 
                            // Zero trust: bez przesyłania e-maila
                        })
                    });
                } catch (error) {
                    console.error("Błąd zapisu po usunięciu z listy:", error);
                }
            }, 1000);
        }

        async function confirmAndSend() {
            if (!currentRecipeData) return;
            var isSavedMode = currentRecipeData.id ? true : false;
            var btnId = isSavedMode ? "actionButtonsSaved" : "saveEmailBtn";
            var btn = isSavedMode ? document.querySelector('#actionButtonsSaved button') : document.getElementById(btnId);
            var originalHtml = btn.innerHTML;
            
            btn.innerHTML = `<i data-lucide="loader-2" class="w-5 h-5 animate-spin"></i> Wysyłanie...`;
            btn.disabled = true; lucide.createIcons();
            
            // WERSJA 1.21.2 - Frontend: Dodanie familyId do payloadu dla atomowego zapisu i wysyłki
            // WERSJA 4.9.6 - RLS SECURITY: Ciasteczka do zapisu i wysyłki
            try {
                const response = await fetch('/api/send-recipe', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        email: currentUserEmail, 
                        familyId: (currentUserProfile && currentUserProfile.family_id) ? currentUserProfile.family_id : null,
                        recipe: currentRecipeData 
                    })
                });
                const res = await response.json();
                
                if (res.status === 'success') {
                    alert(res.message);
                    // DYNAMICZNY TEKST PRZYCISKU
                    btn.innerHTML = isSavedMode 
                        ? `<i data-lucide="check-circle" class="w-5 h-5"></i> Wysłano!` 
                        : `<i data-lucide="check-circle" class="w-5 h-5"></i> Wysłano i Zapisano!`;
                    lucide.createIcons();
                    setTimeout(() => {
                        currentRecipeData.id = res.recipeId; 
                        setActionButtonsMode(true);
                        btn.innerHTML = originalHtml; btn.disabled = false; lucide.createIcons();
                    }, 3000);
                } else {
                    alert("Błąd: " + res.message);
                    btn.innerHTML = originalHtml; btn.disabled = false; lucide.createIcons();
                }
            } catch (error) {
                alert("Krytyczny błąd połączenia z serwerem.");
                btn.innerHTML = originalHtml; btn.disabled = false; lucide.createIcons();
            }
        }

        async function sendShoppingPDF() {
            const btn = document.getElementById('sendShoppingEmailBtn'); const oHtml = btn.innerHTML;
            btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>`;
            
            // WERSJA 4.8.4 - RLS SECURITY: Ciasteczka do wysyłki maila
            try {
                const response = await fetch('/api/send-shopping', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ 
                        email: currentUserEmail, 
                        listTitle: activeShoppingTitle, 
                        listArray: activeShoppingListArray 
                    })
                });
                const res = await response.json();
                
                alert(res.status === 'success' ? res.message : "Błąd: " + res.message);
                btn.innerHTML = oHtml; lucide.createIcons();
            } catch (error) {
                alert("Krytyczny błąd połączenia.");
                btn.innerHTML = oHtml; lucide.createIcons();
            }
        }

        function changeServings(delta) {
            const el = document.getElementById('recipeServings');
            let val = parseInt(el.value) + delta;
            if(val >= 1 && val <= 20) el.value = val;
        }

// WERSJA 4.9.19 - [LOGIKA: Edycja tytułów i klonowanie - UŻYCIE ZOPTYMALIZOWANYCH ENDPOINTÓW]
        async function editRecipeTitle() {
            if (!currentRecipeData) return;

            const newTitle = prompt("Wpisz nową nazwę przepisu:", currentRecipeData.title);
            // Ignorujemy puste, anulowane lub niezmienione próby
            if (!newTitle || newTitle.trim() === "" || newTitle.trim() === currentRecipeData.title) return;

            currentRecipeData.title = newTitle.trim();
            document.getElementById("recipeTitle").innerText = currentRecipeData.title;

            let authorEmail = currentRecipeData.author || currentRecipeData.author_email;
            let isMe = String(authorEmail).trim().toLowerCase() === currentUserEmail;

            if (isMe && currentRecipeData.id && currentRecipeData.id !== "temporary_saved") {
                // To JEST Twój przepis. Uderzamy w nasz zoptymalizowany endpoint od kategorii
                try {
                    await fetch('/api/update-recipe-category', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            recipeId: currentRecipeData.id,
                            newTitle: currentRecipeData.title
                        })
                    });
                    loadDashboard(); // Odświeża kafelki w tle
                } catch (error) {
                    console.error("Błąd aktualizacji tytułu:", error);
                }
            } else if (!isMe) {
                // To NIE JEST Twój przepis. Przechodzimy w tryb klonowania!
                alert("Zmieniłeś nazwę przepisu innego domownika.\n\nAby zapisać tę wersję jako TWOJĄ nową pozycję w książce kucharskiej, kliknij 'Zapisz do bazy' na dole ekranu.");
                
                // Odpinamy ID, aby system myślał, że to nowy draft wygenerowany przez AI
                delete currentRecipeData.id; 
                currentRecipeData.author_email = currentUserEmail;
                currentRecipeData.author = currentUserEmail;
                
                // Zamienia widok guzików na "Draft" (pokazuje Zapisz do bazy)
                setActionButtonsMode(false); 
            }
        }

        async function editShoppingListTitle() {
            if (!activeShoppingListId) return;

            const newTitle = prompt("Wpisz nową nazwę listy zakupów:", activeShoppingTitle);
            if (!newTitle || newTitle.trim() === "" || newTitle.trim() === activeShoppingTitle) return;

            activeShoppingTitle = newTitle.trim();
            document.getElementById("activeShoppingTitle").innerText = activeShoppingTitle;

            // Listy zakupów są współdzielone, nadpisujemy w bazie (Update) za pomocą głównego endpointa list
            try {
                await fetch('/api/update-shopping-list', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        listId: activeShoppingListId,
                        newTitle: activeShoppingTitle
                    })
                });
                fetchShoppingLists(); // Odświeża siatkę list w tle
            } catch (error) {
                console.error("Błąd zmiany nazwy listy:", error);
            }
        }