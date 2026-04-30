// WERSJA 4.3.1 - API VERCEL: KULOODPORNE GENEROWANIE LISTY ZAKUPÓW
// WERSJA 4.3.3 - API VERCEL: ODBIÓR FAMILY ID DO ZAPISU
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Dodajemy familyId do destrukturyzacji
    const { email, recipeIds, familyId } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. Pobieramy składniki
        const { data: recipes, error: recipesError } = await supabase
            .from('recipes')
            .select('title, ingredients')
            .in('id', recipeIds);

        if (recipesError) throw recipesError;
        if (!recipes || recipes.length === 0) throw new Error("Nie znaleziono przepisów w bazie.");

        // WERSJA 4.3.6 - ZABEZPIECZENIE LIMITÓW AI DLA LIST ZAKUPÓW (Współdzielona pula z przepisami)
        // 1b. Pobranie profilu użytkownika do weryfikacji limitów
        const { data: user } = await supabase
            .from('users')
            .select('is_premium, daily_generations, last_generation_date')
            .eq('email', email)
            .maybeSingle();

        // WERSJA 4.9.0 - CENTRALIZACJA LIMITÓW BIZNESOWYCH (Zmienne .env)
        const isPremium = user?.is_premium || false;
        const DAILY_FREE_LIMIT = parseInt(process.env.DAILY_FREE_LIMIT || '3', 10);   
        const DAILY_PREMIUM_LIMIT = parseInt(process.env.DAILY_PREMIUM_LIMIT || '50', 10); 
        
        const todayStr = new Date().toISOString().split('T')[0];
        const userLastDate = user?.last_generation_date ? new Date(user.last_generation_date).toISOString().split('T')[0] : null;
        
        let currentDailyCount = user?.daily_generations || 0;
        if (userLastDate !== todayStr) {
            currentDailyCount = 0;
        }

        if (!isPremium && currentDailyCount >= DAILY_FREE_LIMIT) {
            return res.status(403).json({ 
                status: "error", 
                message: `Wykorzystałeś dzienny limit akcji AI (${DAILY_FREE_LIMIT}) dla konta Free. Wróć jutro lub przejdź na Premium!`
            });
        }

        if (isPremium && currentDailyCount >= DAILY_PREMIUM_LIMIT) {
            return res.status(403).json({ 
                status: "error", 
                message: `Osiągnąłeś limit Premium (${DAILY_PREMIUM_LIMIT} akcji AI).`
            });
        }

        const newDailyCount = currentDailyCount + 1;

        // 2. Łączymy w jeden blok tekstowy
        const allIngredients = recipes.map(r => `Przepis: ${r.title}\nSkładniki:\n${r.ingredients || 'Brak danych'}`).join('\n\n');

        // 3. Budowa instrukcji
        const systemInstruction = `Jesteś asystentem kulinarnym. Otrzymasz listę składników z kilku przepisów. Twoim zadaniem jest zsumowanie ilości tych samych produktów i pogrupowanie ich w logiczne kategorie sklepowe (np. Warzywa i owoce, Nabiał, Mięso, Zbożowe, Przyprawy, Inne).
Zwróć wynik WYŁĄCZNIE jako czysty JSON według tego schematu:
[
  {
    "category": "Nazwa działu",
    "items": [
      { "name": "Zsumowany składnik (np. 500g kurczaka)", "checked": false },
      { "name": "Kolejny składnik", "checked": false }
    ]
  }
]`;

        // WERSJA 4.3.5 - [ERROR HANDLING & AGGREGATION FIX]
        // 4. API Gemini (Rozpoczynamy od Premium dla matematyki, spadamy na Lite w razie awarii)
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
                    contents: [{ parts: [{ text: allIngredients }] }],
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
                // FALLBACK: Ostatnia deska ratunku - jeśli Premium całkowicie leży, próbujemy z Lite
                if (attempt === MAX_RETRIES - 1) {
                    console.warn(`🛒 Model Listy Zakupów (${currentModel}) wciąż przeciążony. Fallback na model Lite.`);
                    currentModel = process.env.GEMINI_MODEL_FREE || 'gemini-2.5-flash-lite';
                }

                const waitTime = attempt * 1500; 
                console.warn(`🛒 GEMINI API PRZECIĄŻONE (${data.error?.code}). Próba ${attempt}/${MAX_RETRIES}. Ponawiam za ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }

        // BEZPIECZEŃSTWO: Obsługa błędów po wykorzystaniu wszystkich prób
        if (!aiResponse.ok || data.error) {
            console.error("🔥 GEMINI API ERROR (SHOPPING):", JSON.stringify(data.error || data, null, 2));
            if (data.error?.code === 503) throw new Error("Serwery AI są przeciążone. Odczekaj chwilę i spróbuj ponownie.");
            if (data.error?.code === 429) throw new Error("Przekroczono limit zapytań do AI.");
            throw new Error(`Błąd połączenia z mózgiem AI: ${data.error?.message || aiResponse.statusText}`);
        }

        // BEZPIECZEŃSTWO: Sprawdzamy, czy Gemini w ogóle odpowiedziało prawidłowo
        if (!data.candidates || data.candidates.length === 0) {
            console.error("🔥 GEMINI EMPTY RESPONSE (Safety Block?):", JSON.stringify(data, null, 2));
            throw new Error("AI odmówiło wygenerowania listy (Filtry bezpieczeństwa lub pusty zwrot).");
        }

        // BEZPIECZEŃSTWO: Ochrona przed błędnym JSONem
        let listData;
        try {
            listData = JSON.parse(data.candidates[0].content.parts[0].text);
        } catch (parseError) {
            console.error("🔥 JSON PARSE ERROR:", data.candidates[0].content.parts[0].text);
            throw new Error("AI zwróciło dane w nieprawidłowym formacie.");
        }

        // WERSJA 4.3.4 - API VERCEL: Dynamiczne, estetyczne nazewnictwo list zakupów (UX Fix)
        // 5. Zapisujemy w Supabase z Family ID
        let listTitle = "";
        
        if (recipes.length === 1) {
            // Dla pojedynczego przepisu zachowujemy jego nazwę (z drobnym zabezpieczeniem długości)
            const rTitle = recipes[0].title;
            listTitle = rTitle.length > 40 ? rTitle.substring(0, 37) + "..." : rTitle;
        } else {
            // Dla agregacji budujemy dynamiczny, elegancki ciąg znaków z obsługą polskiej gramatyki
            const plural = (recipes.length >= 2 && recipes.length <= 4) ? "przepisy" : "przepisów";
            listTitle = `Zbiorcze zakupy (${recipes.length} ${plural})`;
        }
        
        const { error: insertError } = await supabase
            .from('shopping_lists')
            .insert([{
                author_email: email,
                family_id: familyId || null, // Zapisujemy ID rodziny
                title: listTitle,
                data: listData
            }]);

        if (insertError) throw insertError;

        // WERSJA 4.3.6 - KONSUMPCJA LIMITU (Aktualizacja w bazie po udanym generowaniu listy)
        const { error: updateError } = await supabase
            .from('users')
            .update({ 
                daily_generations: newDailyCount, 
                last_generation_date: new Date().toISOString() 
            })
            .eq('email', email);

        if (updateError) console.error("🔥 Błąd zapisu limitu dziennego (Shopping List):", updateError);

        return res.status(200).json({ status: "success", message: "Zsumowana lista gotowa!" });

    } catch (error) {
        console.error("🔥 SHOPPING LIST ERROR:", error.message);
        return res.status(500).json({ 
            status: "error", 
            message: "Błąd agregacji: " + error.message 
        });
    }
}