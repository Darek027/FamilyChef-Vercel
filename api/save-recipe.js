// WERSJA 4.9.1 - API VERCEL: ZAPIS Z UWZGLĘDNIENIEM FAMILY ID ORAZ PORCJI
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { email, recipe, familyId } = req.body;

    // WERSJA 4.9.2 - RLS SECURITY: Zabezpieczony klient dla zapisu
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // 1. Konwersja tablic na tekst z enterami (\n), aby dopasować się do frontendu i bazy TEXT
        const ingredientsStr = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : recipe.ingredients;
        const instructionsStr = Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : recipe.instructions;

        // WERSJA 4.9.9.1 - API VERCEL: Zapis metadanych Persony i Poziomu Trudności
        // 2. Zapis do Supabase (zgodnie ze schematem: author_email)
        const { data: savedRecipe, error: dbError } = await supabase
                .from('recipes')
                .insert([{
                    author_email: email,
                    family_id: familyId || null, 
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