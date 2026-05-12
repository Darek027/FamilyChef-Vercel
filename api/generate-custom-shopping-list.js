// WERSJA 4.4.0 - API VERCEL: TWORZENIE RĘCZNEJ LISTY ZAKUPÓW Z WYKORZYSTANIEM AI
// WERSJA 4.5.0 - [SaaS Update] Wsparcie dla dopisywania produktów do istniejącej listy (Merge)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // WERSJA 5.3.0 - ZERO TRUST: Ignorujemy email i familyId z frontendu
    const { rawItems, listId } = req.body;
    let currentDailyCount; 

    if (!rawItems || rawItems.trim() === '') {
        return res.status(400).json({ status: "error", message: "Brak produktów." });
    }

    if (!rawItems || rawItems.trim() === '') {
        return res.status(400).json({ status: "error", message: "Brak produktów." });
    }

    try {
        // WERSJA 5.3.0 - SECURITY: ZERO TRUST + RLS + Race Condition Fix
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });
        const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // KRYPTOGRAFICZNA WERYFIKACJA TOŻSAMOŚCI
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        
        const email = authUser.email; // Zaufany email z JWT
        const authUserId = authUser.id; // Migracja na UUID

        // 1. Pobranie Family ID (z public.users) i limitów AI (z users_billing przez Admina)
        const { data: user } = await supabase
            .from('users')
            .select('family_id')
            .eq('id', authUserId)
            .maybeSingle();
        const familyId = user?.family_id;

        const { data: billing } = await supabaseAdmin
            .from('users_billing')
            .select('*')
            .eq('id', authUserId)
            .maybeSingle();

        const isPremium = billing?.is_premium || false;
        const DAILY_FREE_LIMIT = parseInt(process.env.DAILY_FREE_LIMIT || '3', 10);   
        const DAILY_PREMIUM_LIMIT = parseInt(process.env.DAILY_PREMIUM_LIMIT || '50', 10); 
        
        const todayStr = new Date().toISOString().split('T')[0];
        const userLastDate = billing?.last_generation_date ? new Date(billing.last_generation_date).toISOString().split('T')[0] : null;
        
        currentDailyCount = billing?.daily_generations || 0;
        if (userLastDate !== todayStr) {
            currentDailyCount = 0;
        }

        if (!isPremium && currentDailyCount >= DAILY_FREE_LIMIT) {
            return res.status(403).json({ status: "error", message: `Wykorzystałeś dzienny limit akcji AI (${DAILY_FREE_LIMIT}) dla konta Free.` });
        }
        if (isPremium && currentDailyCount >= DAILY_PREMIUM_LIMIT) {
            return res.status(403).json({ status: "error", message: `Osiągnąłeś limit Premium (${DAILY_PREMIUM_LIMIT} akcji AI).` });
        }

        // CHARGE UPFRONT: Zabezpieczenie przed Race Condition przez supabaseAdmin
        const { error: limitError } = await supabaseAdmin.from('users_billing')
            .update({ daily_generations: currentDailyCount + 1, last_generation_date: todayStr })
            .eq('id', authUserId);
            
        if (limitError) throw new Error("Błąd podczas rezerwacji limitu AI.");

        // 2. Prompt do Gemini - Autokategoryzacja wolnego tekstu
        const systemInstruction = `Jesteś asystentem kulinarnym. Użytkownik wpisał ciągłym tekstem rzeczy, które chce kupić w sklepie. Twoim zadaniem jest wyodrębnienie tych produktów i pogrupowanie ich w logiczne kategorie sklepowe (np. Pieczywo, Nabiał, Mięso, Zbożowe, Warzywa i owoce, Inne).
Zwróć wynik WYŁĄCZNIE jako czysty JSON według tego schematu:
[
  {
    "category": "Nazwa działu",
    "items": [
      { "name": "Wyodrębniony produkt (np. mleko)", "checked": false },
      { "name": "Kolejny produkt (np. 5 jajek)", "checked": false }
    ]
  }
]`;

        // WERSJA 4.4.1 - [ZABEZPIECZENIE API] Retry logic & Fallback model
        // 3. API Gemini (Rozpoczynamy od Premium, spadamy na Lite w razie awarii)
        let currentModel = process.env.GEMINI_MODEL_PREMIUM || 'gemini-2.5-flash'; 
        const MAX_RETRIES = 3;
        let attempt = 0;
        let aiResponse;
        let data;

        while (attempt < MAX_RETRIES) {
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${currentModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;
            
            aiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemInstruction }] },
                    contents: [{ parts: [{ text: rawItems }] }], // Przekazujemy surowy tekst od użytkownika
                    generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
                })
            });

            data = await aiResponse.json();

            // Przerywamy pętlę, jeśli sukces LUB błąd to nie nasza wina (inny niż 503/429)
            if (aiResponse.ok || (data.error?.code !== 503 && data.error?.code !== 429)) {
                break;
            }

            attempt++;
            if (attempt < MAX_RETRIES) {
                // FALLBACK: Zrzutka na model Lite
                if (attempt === MAX_RETRIES - 1) {
                    console.warn(`🛒 Model Listy Własnej (${currentModel}) przeciążony. Fallback na model Lite.`);
                    currentModel = process.env.GEMINI_MODEL_FREE || 'gemini-2.5-flash-lite';
                }

                const waitTime = attempt * 1500; 
                console.warn(`🛒 GEMINI API PRZECIĄŻONE (${data.error?.code}). Próba ${attempt}/${MAX_RETRIES}. Ponawiam za ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // BEZPIECZEŃSTWO: Obsługa błędów po wykorzystaniu wszystkich prób
        if (!aiResponse.ok || data.error) {
            console.error("🔥 GEMINI API ERROR (CUSTOM SHOPPING):", JSON.stringify(data.error || data, null, 2));
            if (data.error?.code === 503) throw new Error("Serwery AI są przeciążone. Odczekaj chwilę i spróbuj ponownie.");
            if (data.error?.code === 429) throw new Error("Przekroczono limit zapytań do AI.");
            throw new Error(`Błąd połączenia z mózgiem AI: ${data.error?.message || aiResponse.statusText}`);
        }

        // BEZPIECZEŃSTWO: Sprawdzamy, czy Gemini w ogóle odpowiedziało prawidłowo
        if (!data.candidates || data.candidates.length === 0) {
            console.error("🔥 GEMINI EMPTY RESPONSE (Safety Block?):", JSON.stringify(data, null, 2));
            throw new Error("AI odmówiło wygenerowania listy (Filtry bezpieczeństwa lub pusty zwrot).");
        }

        // WERSJA 4.5.0 - BEZPIECZNE PARSOWANIE I ŁĄCZENIE (MERGE) LIST
        // 4. Parsowanie nowo wygenerowanych produktów
        let newItemsData;
        try {
            newItemsData = JSON.parse(data.candidates[0].content.parts[0].text);
        } catch (parseError) {
            console.error("🔥 JSON PARSE ERROR:", data.candidates[0].content.parts[0].text);
            throw new Error("AI zwróciło dane w nieprawidłowym formacie.");
        }

        // 5. Obsługa Update (Dopisywanie) vs Insert (Nowa lista)
        if (listId) {
            // A. Pobieramy obecny stan listy z bazy
            let fetchQuery = supabase.from('shopping_lists').select('data').eq('id', listId);
            if (familyId && familyId !== 'undefined') fetchQuery = fetchQuery.eq('family_id', familyId);
            else fetchQuery = fetchQuery.eq('author_email', email);

            const { data: existingListDB, error: fetchError } = await fetchQuery.single();
            
            if (fetchError || !existingListDB) {
                throw new Error("Nie znaleziono oryginalnej listy do aktualizacji.");
            }

            let mergedData = existingListDB.data;

            // B. Inteligentny Merge JSONów
            newItemsData.forEach(newCategoryObj => {
                const existingCategoryIndex = mergedData.findIndex(
                    c => c.category.toLowerCase() === newCategoryObj.category.toLowerCase()
                );

                if (existingCategoryIndex !== -1) {
                    // Kategoria istnieje - wrzucamy nowe rzeczy na koniec
                    mergedData[existingCategoryIndex].items.push(...newCategoryObj.items);
                } else {
                    // Kategoria nie istnieje - dodajemy jako nową
                    mergedData.push(newCategoryObj);
                }
            });

            // C. Aktualizacja w bazie
            const { error: updateError } = await supabase
                .from('shopping_lists')
                .update({ data: mergedData })
                .eq('id', listId);

            if (updateError) throw updateError;

        } else {
            // D. Standardowe tworzenie nowej listy (Fallback do starej logiki)
            const dateString = new Date().toLocaleDateString('pl-PL', { day: 'numeric', month: 'long' });
            const listTitle = `Szybkie zakupy (${dateString})`;
            
            const { error: insertError } = await supabase
                .from('shopping_lists')
                .insert([{
                    author_id: authUserId, // NOWE: UUID jako relacja
                    author_email: email,
                    family_id: familyId || null,
                    title: listTitle,
                    data: newItemsData
                }]);

            if (insertError) throw insertError;
        }

        // WERSJA 4.5.2 - BUGFIX: Zwrócenie odpowiedzi HTTP po udanym zapisie/aktualizacji (Zamyka zapytanie Vercel)
        return res.status(200).json({ status: "success" });

     } catch (error) {
        console.error("🔥 CUSTOM SHOPPING LIST ERROR:", error.message);
        
        // REFUND: Zwracamy do tabeli bilingowej przez Admina
        if (currentDailyCount !== undefined) {
            const { createClient } = await import('@supabase/supabase-js');
            const supAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
            await supAdmin.from('users_billing').update({ daily_generations: currentDailyCount }).eq('id', authUser.id);
        }

        return res.status(500).json({ status: "error", message: "Błąd serwera: " + error.message });
    }
}