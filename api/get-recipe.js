// WERSJA 4.2.0 - API VERCEL: POBIERANIE SZCZEGÓŁÓW PRZEPISU
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ status: "error" });

    const { id } = req.query;
    if (!id) return res.status(400).json({ status: "error", message: "Brak ID przepisu." });

    // WERSJA 4.8.0 - RLS SECURITY: Zabezpieczony klient Supabase
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu. Zaloguj się ponownie." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

    
        const { data: recipe, error } = await supabase
            .from('recipes')
            .select('*')
            .eq('id', id)
            .single();

        if (error) throw error;

        // KONWERSJA: TEXT -> ARRAY (Kluczowe dla frontendu)
        const formattedRecipe = {
            ...recipe,
            ingredients: recipe.ingredients ? recipe.ingredients.split('\n') : [],
            instructions: recipe.instructions ? recipe.instructions.split('\n') : [],
            message: recipe.chef_message // mapujemy na nazwę, której używa Twój frontend
        };

        return res.status(200).json(formattedRecipe);

    } catch (error) {
        console.error("🔥 GET RECIPE ERROR:", error);
        return res.status(500).json({ status: "error", message: "Nie udało się pobrać przepisu." });
    }
}