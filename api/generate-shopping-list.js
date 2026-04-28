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

        // WERSJA 4.3.2 - API VERCEL: INTEGRACJA Z MODELEM PREMIUM
        // 4. API Gemini (Używamy modelu Premium, funkcja dedykowana dla PRO)
        const aiModel = process.env.GEMINI_MODEL_PREMIUM || 'gemini-2.5-flash'; 
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const aiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ parts: [{ text: allIngredients }] }],
                generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
            })
        });

        const data = await aiResponse.json();

        // BEZPIECZEŃSTWO: Sprawdzamy, czy Gemini w ogóle odpowiedziało prawidłowo
        if (!data.candidates || data.candidates.length === 0) {
            console.error("🔥 GEMINI RAW ERROR:", JSON.stringify(data, null, 2));
            throw new Error(data.error?.message || "Google Gemini odmówiło odpowiedzi (Sprawdź konsolę VSC).");
        }

        // BEZPIECZEŃSTWO: Ochrona przed błędnym JSONem
        let listData;
        try {
            listData = JSON.parse(data.candidates[0].content.parts[0].text);
        } catch (parseError) {
            console.error("🔥 JSON PARSE ERROR:", data.candidates[0].content.parts[0].text);
            throw new Error("AI zwróciło dane w nieprawidłowym formacie.");
        }

        // 5. Zapisujemy w Supabase z Family ID
        const shortTitles = recipes.map(r => r.title).join(', ').substring(0, 40) + "...";
        
        const { error: insertError } = await supabase
            .from('shopping_lists')
            .insert([{
                author_email: email,
                family_id: familyId || null, // Zapisujemy ID rodziny
                title: "Zakupy: " + shortTitles,
                data: listData
            }]);

        if (insertError) throw insertError;

        return res.status(200).json({ status: "success", message: "Zsumowana lista gotowa!" });

    } catch (error) {
        console.error("🔥 SHOPPING LIST ERROR:", error.message);
        return res.status(500).json({ 
            status: "error", 
            message: "Błąd agregacji: " + error.message 
        });
    }
}