// WERSJA 3.0.0 - SILNIK AI SAAS (Dynamic Model Routing & Prompt Matrix)

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error", message: "Użyj POST" });

    const { email, userMessage, isAdjustment, previousRecipe } = req.body;
    if (!email || !userMessage) return res.status(400).json({ status: "error", message: "Brak danych wejściowych." });

    try {
        // 1. Inicjalizacja bazy i pobranie profilu użytkownika (Sprawdzamy pakiety!)
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('is_premium, default_chef, default_skill, preferences')
            .eq('email', email)
            .maybeSingle();

        if (userError || !user) throw new Error("Błąd autoryzacji użytkownika w bazie.");

        // 2. DYNAMIC MODEL ROUTING (Zasada z Master Planu)
        // Free = flash-lite (taniej), Premium = pełny flash (potężniej)
        const aiModel = user.is_premium ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite';

        // 3. PROMPT MATRIX (Budowa kontekstu)
        const systemInstruction = `Jesteś aplikacją Family Chef.
TWÓJ PROFIL (SZEF KUCHNI): ${user.default_chef}
POZIOM ODBIORCY: ${user.default_skill}
PREFERENCJE DIETETYCZNE: ${user.preferences || 'Brak'}

CRITICAL RULE: Zwróć wynik WYŁĄCZNIE jako czysty, zwalidowany format JSON (bez znaczników Markdown, bez \`\`\`json).
Struktura JSON:
{
  "title": "Krótka, chwytliwa nazwa dania",
  "ingredients": ["100g ryżu", "2 pomidory"],
  "instructions": ["Krok 1...", "Krok 2..."],
  "category": "Obiad"
}`;

        // Konfiguracja zapytania (Uwzględnienie pętli zwrotnej / konwersacji)
        let promptText = userMessage;
        if (isAdjustment && previousRecipe) {
            promptText = `Obecny przepis:\n${JSON.stringify(previousRecipe)}\n\nInstrukcja modyfikacji od użytkownika: ${userMessage}\nZmodyfikuj przepis zachowując format JSON.`;
        }

        // 4. Strzał do Google Gemini API
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ parts: [{ text: promptText }] }],
                generationConfig: {
                    temperature: 0.7,
                    response_mime_type: "application/json" // Wymuszamy JSON natywnie!
                }
            })
        });

        const geminiData = await geminiResponse.json();
        
        if (!geminiData.candidates || geminiData.candidates.length === 0) {
            throw new Error("AI nie zwróciło żadnej odpowiedzi.");
        }

        // 5. Parsowanie wyniku i zapis do Supabase!
        const rawAiResponse = geminiData.candidates[0].content.parts[0].text;
        const recipeJson = JSON.parse(rawAiResponse); // Upewniamy się, że to poprawny JSON

        // Zapisujemy nowy przepis do bazy (tylko jeśli to nie jest luźna modyfikacja, 
        // lub zrobimy to później przyciskiem "Zapisz" - na razie zwracamy do UI)
        
        return res.status(200).json({
            status: "success",
            recipe: recipeJson,
            model_used: aiModel // Informacyjnie dla Ciebie
        });

    } catch (error) {
        console.error("🔥 BŁĄD SILNIKA AI:", error);
        return res.status(500).json({
            status: "error",
            message: "Wystąpił błąd podczas generowania przepisu.",
            details: error.message
        });
    }
}