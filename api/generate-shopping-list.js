// WERSJA 4.3.3 - API VERCEL: ODBIÓR FAMILY ID DO ZAPISU
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // WERSJA 5.1.0 - ZERO TRUST
    const { recipeIds } = req.body; // Ignorujemy email i familyId
    
    // WERSJA 5.4.5 - [SAAS REFUND FIX: Globalny zasięg dla klienta Admina]
    let authUserId;
    let currentDailyCount;
    let supabaseAdmin; 

    try {
        // WERSJA 6.2.0 - [SAAS SECURITY: Universal Cookie Parser]
        const parseCookies = (cookieHeader) => {
            if (!cookieHeader) return {};
            return cookieHeader.split(';').reduce((res, c) => {
                const [key, val] = c.trim().split('=').map(decodeURIComponent);
                return Object.assign(res, { [key]: val });
            }, {});
        };
        const cookies = parseCookies(req.headers.cookie);
        const tokenToVerify = cookies['sb-access-token'];

        if (!tokenToVerify) return res.status(401).json({ status: "error", message: "Brak ciasteczka autoryzacyjnego." });

        const { createClient } = await import('@supabase/supabase-js');
        
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${tokenToVerify}` } }
        });
        supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // KRYPTOGRAFICZNA WERYFIKACJA TOŻSAMOŚCI
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        
        const email = authUser.email; // Zaufany email
        authUserId = authUser.id; // WERSJA 5.4.3 - Usunięto const

        // WERSJA 5.1.2 - BUGFIX SAAS: Odczyt Kodu Rodziny bezpośrednio z Base64 JWT
        // WERSJA 6.2.1 - BUGFIX SAAS: Odczyt Kodu Rodziny bezpośrednio z ciasteczka
        let familyId = null;
        try {
            const payloadBase64 = tokenToVerify.split('.')[1];
            const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
            const jwtPayload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
            familyId = jwtPayload.app_metadata?.family_id || null;
        } catch (e) {
            console.error("🔥 Błąd dekodowania JWT w Shopping List:", e);
        }

        // 1. Pobieramy składniki i ID
        const { data: recipes, error: recipesError } = await supabase
            .from('recipes')
            .select('id, title, ingredients')
            .in('id', recipeIds);

        if (recipesError) throw recipesError;
        if (!recipes || recipes.length === 0) throw new Error("Nie znaleziono przepisów w bazie.");

        // WERSJA 5.4.0 - Odczyt limitów i statusu z nowej tabeli billingowej przez Admina
        const { data: billing } = await supabaseAdmin
            .from('users_billing')
            .select('is_premium, daily_generations, last_generation_date')
            .eq('id', authUserId)
            .maybeSingle();

        // WERSJA 4.9.0 - CENTRALIZACJA LIMITÓW BIZNESOWYCH (Zmienne .env)
        const isPremium = billing?.is_premium || false;
        const DAILY_FREE_LIMIT = parseInt(process.env.DAILY_FREE_LIMIT || '3', 10);   
        const DAILY_PREMIUM_LIMIT = parseInt(process.env.DAILY_PREMIUM_LIMIT || '50', 10); 
        
        const todayStr = new Date().toISOString().split('T')[0];
        const userLastDate = billing?.last_generation_date ? new Date(billing.last_generation_date).toISOString().split('T')[0] : null;
        
        currentDailyCount = billing?.daily_generations || 0; // WERSJA 5.4.3 - Usunięto let
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

        // WERSJA 5.4.2 - SECURITY FIX: Zapis limitu do USERS_BILLING przez Admina (Charge Upfront)
        const { error: limitUpdateError } = await supabaseAdmin
            .from('users_billing')
            .update({ 
                daily_generations: newDailyCount, 
                last_generation_date: todayStr 
            })
            .eq('id', authUserId);

        if (limitUpdateError) {
            throw new Error("Błąd autoryzacji limitów przed agregacją AI.");
        }

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
        
        // Budujemy tablicę połączonych przepisów dla "Planu Posiłków"
        const linkedRecipes = recipes.map(r => ({
            id: r.id,
            title: r.title,
            is_cooked: false
        }));

        const { error: insertError } = await supabase
            .from('shopping_lists')
            .insert([{
                author_id: authUserId, // NOWE: Wstrzykujemy UUID
                author_email: email,
                family_id: familyId || null, // Zapisujemy ID rodziny
                title: listTitle,
                data: listData,
                linked_recipes: linkedRecipes // NOWA KOLUMNA JSONB
            }]);

        if (insertError) throw insertError;

        // KONSUMPCJA LIMITU PRZENIESIONA NA GÓRĘ (Charge Upfront)

        return res.status(200).json({ status: "success", message: "Zsumowana lista gotowa!" });

    } catch (error) {
        console.error("🔥 SHOPPING LIST ERROR:", error.message);
        
        // WERSJA 5.4.4 - SAAS REFUND FIX: Kuloodporny mechanizm zwrotu (tylko z zainicjalizowanym UUID i licznikiem)
        if (currentDailyCount !== undefined && authUserId) {
            await supabaseAdmin
                .from('users_billing')
                .update({ daily_generations: currentDailyCount })
                .eq('id', authUserId);
        }

        const userFriendlyMessage = error.message.includes("przeciążone") || error.message.includes("limit") || error.message.includes("AI")
            ? error.message 
            : "Błąd agregacji: " + error.message;

        return res.status(500).json({ 
            status: "error", 
            message: userFriendlyMessage 
        });
    }
}