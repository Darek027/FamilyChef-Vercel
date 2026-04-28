/FamilyChef-Vercel
├── .vercel/                    # Pliki konfiguracyjne/cache Vercel (generowane automatycznie)
├── api/                        # Funkcje bezserwerowe (Serverless Functions)
│   ├── auth.js                 # Logowanie (Działa)
│   ├── delete-recipe.js        # Usuwanie przepisu
│   ├── delete-shopping-list.js # Usuwanie listy zakupów
│   ├── generate-shopping-list.js # Generowanie listy zakupów
│   ├── generate.js             # Silnik AI (Działa)
│   ├── get-dashboard.js        # Pobieranie danych do panelu głównego
│   ├── get-recipe.js           # Pobieranie pojedynczego przepisu/przepisów
│   ├── get-shopping-lists.js   # Pobieranie list zakupów
│   ├── save-recipe.js          # Zapisywanie nowego przepisu
│   ├── send-recipe.js          # Wysyłanie/udostępnianie przepisu
│   ├── send-shopping.js        # Wysyłanie/udostępnianie listy zakupów
│   ├── update-recipe-category.js # Zmiana kategorii przepisu
│   ├── update-shopping-list.js # Aktualizacja istniejącej listy zakupów
│   └── update-user-profile.js  # Aktualizacja profilu użytkownika
├── node_modules/               # Zainstalowane zależności Node.js
├── .env                        # Klucze (URL, ANON, SERVICE_ROLE, GEMINI)
├── .gitignore                  # Pliki i foldery ignorowane przez system Git
├── index.html                  # Główny interfejs (Zaktualizowany pod Vercel)
├── package-lock.json           # Dokładne wersje zainstalowanych zależności
├── package.json                # Konfiguracja projektu i zależności (@supabase/supabase-js)
└── STRUCTURE.md                # Dokumentacja struktury projektu