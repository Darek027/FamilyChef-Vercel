// WERSJA 4.0.0 - API VERCEL: ZAPIS PRZEPISU DO SUPABASE
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error", message: "Metoda niedozwolona" });

    const { email, recipe } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. Konwersja tablic na tekst z enterami (\n), aby dopasować się do frontendu i bazy TEXT
        const ingredientsStr = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : recipe.ingredients;
        const instructionsStr = Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : recipe.instructions;

        // 2. Zapis do Supabase (zgodnie ze schematem: author_email)
        const { data, error } = await supabase
            .from('recipes')
            .insert([{
                author_email: email, 
                title: recipe.title,
                ingredients: ingredientsStr,
                instructions: instructionsStr,
                category: recipe.category || 'Inne'
            }])
            .select('id') // Pobieramy wygenerowane ID, żeby front wiedział, że zapisano
            .single();

        if (error) throw error;

        return res.status(200).json({ 
            status: "success", 
            message: "Przepis zapisany w Twojej bazie!",
            recipeId: data.id
        });

    } catch (error) {
        console.error("🔥 DATABASE ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd zapisu w bazie Supabase." });
    }
}