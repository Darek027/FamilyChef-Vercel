# Struktura Projektu: Family Chef (Vercel + Supabase)

/FamilyChef-Vercel
├── .vercel/                      # Pliki konfiguracyjne i cache Vercel (generowane automatycznie)
├── api/                          # Funkcje bezserwerowe (Serverless Functions) stanowiące backend
│   ├── auth.js                   # Logowanie i autoryzacja (Działa)
│   ├── delete-recipe.js          # Usuwanie przepisu z bazy
│   ├── delete-shopping-list.js   # Usuwanie listy zakupów
│   ├── delete-user.js            # Usuwanie konta użytkownika
│   ├── generate-custom-shopping-list.js # Generowanie niestandardowej listy zakupów
│   ├── generate-shopping-list.js # Generowanie listy zakupów z wybranych przepisów
│   ├── generate.js               # Główny silnik AI (Działa)
│   ├── get-dashboard.js          # Pobieranie danych i statystyk do panelu głównego
│   ├── get-recipe.js             # Fetchowanie pojedynczego przepisu lub listy przepisów
│   ├── get-shopping-lists.js     # Fetchowanie zapisanych list zakupów
│   ├── save-recipe.js            # Zapisywanie nowego przepisu do bazy
│   ├── send-recipe.js            # Wysyłanie i udostępnianie przepisu
│   ├── send-shopping.js          # Wysyłanie i udostępnianie listy zakupów
│   ├── update-recipe-category.js # Zmiana przypisanej kategorii przepisu
│   ├── update-shopping-list.js   # Aktualizacja stanu/zawartości istniejącej listy zakupów
│   └── update-user-profile.js    # Aktualizacja danych w profilu użytkownika
├── node_modules/                 # Zainstalowane zależności Node.js (nie commitowane do repozytorium)
├── .env                          # Zmienne środowiskowe (Klucze: URL, ANON, SERVICE_ROLE, GEMINI)
├── .gitignore                    # Reguły wykluczeń dla systemu kontroli wersji Git
├── index.html                    # Główny plik wejściowy interfejsu (Zaktualizowany pod Vercel)
├── package-lock.json             # Zablokowane, dokładne drzewo wersji zależności
├── package.json                  # Konfiguracja projektu, skrypty i lista zależności (m.in. @supabase/supabase-js)
└── STRUCTURE.md                  # Dokumentacja struktury projektu (ten plik)