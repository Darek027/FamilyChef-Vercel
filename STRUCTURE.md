# Struktura Projektu: Family Chef (Vercel + Supabase + Tailwind)

## 📂 Drzewo Katalogów
/FamilyChef-Vercel
├── .vercel/                    # Konfiguracja i cache Vercel (auto-gen)
├── api/                        # BACKEND: Funkcje bezserwerowe (Node.js)
│   ├── auth.js                 # Autoryzacja użytkowników (Supabase Auth)
│   ├── delete-recipe.js        # Usuwanie przepisów
│   ├── delete-shopping-list.js # Usuwanie list zakupów
│   ├── delete-user.js          # Usuwanie konta
│   ├── generate-custom-shopping-list.js
│   ├── generate-shopping-list.js
│   ├── generate.js             # Core AI (Integracja z Gemini/OpenAI)
│   ├── get-dashboard.js        # Statystyki i dane profilu
│   ├── get-recipe.js           # Pobieranie przepisów
│   ├── get-shopping-lists.js   # Pobieranie list zakupów
│   ├── save-recipe.js          # Zapisywanie do bazy Supabase
│   ├── send-recipe.js          # Udostępnianie przepisu (e-mail/link)
│   ├── send-shopping.js        # Udostępnianie listy zakupów
│   ├── update-recipe-category.js
│   ├── update-shopping-list.js
│   └── update-user-profile.js
├── node_modules/               # Zależności projektu
├── .env                        # Zmienne środowiskowe (klucze API - niepubliczne)
├── .gitignore                  # Pliki ignorowane przez Git
├── index.html                  # FRONTEND: Główny szkielet aplikacji
├── input.css                   # FRONTEND: Plik źródłowy Tailwind CSS (warstwy @tailwind)
├── main.js                     # FRONTEND: Główna logika kliencka i obsługa DOM
├── package.json                # Konfiguracja npm, skrypty i zależności
├── package-lock.json           # Dokładna mapa wersji zależności
├── STRUCTURE.md                # Dokumentacja struktury (ten plik)
├── style.css                   # FRONTEND: Skompilowany plik CSS gotowy dla przeglądarki
└── tailwind.config.js          # Konfiguracja Tailwind CSS (motywy, kolory, ścieżki)

## 🛠️ Podział Funkcjonalny dla AI Agentów

### 1. Warstwa Klienta (Frontend)
- **Logika:** `main.js` obsługuje interakcje z użytkownikiem i wywołuje funkcje z folderu `api/`.
- **Prezentacja:** `index.html` + `style.css` (generowany z Tailwind).
- **Stylizacja:** `tailwind.config.js` oraz `input.css` definiują wygląd UI.

### 2. Warstwa Serwerowa (Backend - Vercel Functions)
- Wszystkie pliki w `api/` to endpointy HTTP wywoływane przez frontend.
- Komunikują się bezpośrednio z **Supabase** (Baza danych/Auth) oraz zewnętrznymi API (AI).

### 3. Konfiguracja i Środowisko
- `package.json`: Zawiera skrypty budowania (np. dla Tailwind) oraz listę paczek takich jak `@supabase/supabase-js`.
- `.env`: Zawiera krytyczne dane (SUPABASE_URL, GEMINI_API_KEY).