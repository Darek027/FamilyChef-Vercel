// WERSJA 4.9.1 - API VERCEL: ZAPIS Z UWZGLĘDNIENIEM FAMILY ID ORAZ PORCJI
// WERSJA 4.9.3 - ZERO TRUST ZAPIS
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Ignorujemy parametry tożsamości z frontendu
    const { recipe } = req.body;

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // 1. Weryfikacja kryptograficzna
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
        const realEmail = user.email;
        const authUserId = user.id; // Migracja na stałe UUID

        // WERSJA 4.9.4 - AUTH HOOK: Odczyt Kodu Rodziny z payloadu JWT (Bypass DB)
        const realFamilyId = user.app_metadata?.family_id || null;

        // 3. Konwersja tablic na tekst z enterami
        const ingredientsStr = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : recipe.ingredients;
        const instructionsStr = Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : recipe.instructions;

        // 4. Zapis do Supabase (wstrzykujemy nowe UUID jako relację)
        const { data: savedRecipe, error: dbError } = await supabase
                .from('recipes')
                .insert([{
                    author_id: authUserId, // NOWE: Twarda relacja UUID do tabeli public.users
                    author_email: realEmail, // Fallback informacyjny
                    family_id: realFamilyId || null, // Używamy zweryfikowanego ID 
                    title: recipe.title,
                    ingredients: ingredientsStr,
                    instructions: instructionsStr,
                    category: recipe.category || 'Inne',
                    servings: recipe.servings || 2, 
                    calories_per_serving: recipe.calories_per_serving || null,
                    // Zapisujemy tagi Premium!
                    used_chef: recipe.usedChef || null,
                    used_skill: recipe.usedSkill || null
                }])
            .select('id') 
            .single();

        if (dbError) throw dbError;

        return res.status(200).json({ 
            status: "success", 
            message: "Przepis zapisany w Twojej bazie!",
            recipeId: savedRecipe.id
        });

    } catch (error) {
        console.error("🔥 DATABASE ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd zapisu w bazie Supabase." });
    }
}