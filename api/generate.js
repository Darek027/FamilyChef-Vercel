// WERSJA 3.0.2 - SILNIK AI SAAS (Bez twardych limitów, pełna elastyczność)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { email, userMessage, isAdjustment, previousRecipe } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. Pobranie pełnego profilu użytkownika
        const { data: user } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        // 2. Pobranie kategorii dla zachowania spójności biblioteki
        const { data: userRecipes } = await supabase
            .from('recipes')
            .select('category')
            .eq('author', email);
        
// WERSJA 3.1.0 - ZABEZPIECZENIE LIMITÓW I WALIDACJA PREMIUM
        const recipeCount = userRecipes?.length || 0;
        const isPremium = user?.is_premium || false;
        const FREE_LIMIT = 25;

        // Blokada dla użytkowników FREE, którzy przekroczyli limit
        if (!isPremium && recipeCount >= FREE_LIMIT) {
            return res.status(403).json({ 
                status: "error", 
                message: "Osiągnąłeś limit 25 przepisów dla konta Free. Przejdź na Premium, aby gotować bez ograniczeń!",
                code: "LIMIT_EXCEEDED"
            });
        }

        const existingCats = [...new Set(userRecipes?.map(r => r.category).filter(Boolean))];
        const categoryLogic = existingCats.length > 0 
            ? `Twoje istniejące kategorie: [${existingCats.join(", ")}]. Użyj jednej z nich, jeśli pasuje, lub stwórz nową.` 
            : "Możesz stworzyć nową kategorię (np. Śniadanie, Obiad).";

// WERSJA 3.1.3 - DYNAMIC MODEL ROUTING (Centralizacja via .env)
        const aiModel = isPremium 
            ? (process.env.GEMINI_MODEL_PREMIUM || 'gemini-2.5-flash') 
            : (process.env.GEMINI_MODEL_FREE || 'gemini-2.5-flash-lite');

        // 4. Budowa System Instruction (PROMPT MATRIX)
        // Usunięto twarde limity (max 10/max 6). Złożoność wynika z kontekstu.
        const systemInstruction = `Jesteś aplikacją Family Chef. Twoim zadaniem jest wygenerowanie przepisu idealnie dopasowanego do kontekstu.

KONTEKST SYSTEMOWY:
- SZEF KUCHNI (Styl wypowiedzi/gotowania): ${user?.default_chef || 'Standardowy'}
- POZIOM TRUDNOŚCI: ${user?.default_skill || 'Początkujący'}
- PREFERENCJE DIETETYCZNE (KRYTYCZNE): ${user?.preferences || 'Brak specjalnych wymagań'}

ZASADY KREACJI:
- Dostosuj liczbę składników i kroków do poziomu trudności i prośby użytkownika.
- Bądź precyzyjny w miarach (g, ml, łyżki).
- Kategoria: ${categoryLogic}

WYNIK MUSI BYĆ CZYSTYM JSONEM:
{
  "title": "Nazwa przepisu",
  "ingredients": ["lista wszystkich potrzebnych produktów"],
  "instructions": ["kolejne kroki przygotowania"],
  "category": "kategoria dania",
  "message": "Krótka, osobista porada od Twojego Szefa Kuchni"
}`;

        // 5. Wywołanie API Gemini
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemInstruction }] },
                contents: [{ 
                    parts: [{ 
                        text: isAdjustment 
                            ? `Oto obecny przepis: ${JSON.stringify(previousRecipe)}. Zmodyfikuj go według prośby: ${userMessage}` 
                            : userMessage 
                    }] 
                }],
                generationConfig: { 
                    temperature: 0.7, 
                    response_mime_type: "application/json" 
                }
            })
        });

        const data = await response.json();
        
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("AI nie zwróciło odpowiedzi. Sprawdź limity API.");
        }

        const recipeData = JSON.parse(data.candidates[0].content.parts[0].text);

        // 6. Walidacja formatu danych (zabezpieczenie przed błędami typu obiektu)
        recipeData.ingredients = recipeData.ingredients.map(i => typeof i === 'string' ? i : Object.values(i).join(' '));
        recipeData.instructions = recipeData.instructions.map(i => typeof i === 'string' ? i : Object.values(i).join(' '));

        return res.status(200).json({ 
            status: "success", 
            recipe: recipeData,
            model: aiModel 
        });

    } catch (error) {
        console.error("🔥 AI ERROR:", error);
        return res.status(500).json({ 
            status: "error", 
            message: "Wystąpił błąd podczas pracy Szefa Kuchni.",
            details: error.message 
        });
    }
}