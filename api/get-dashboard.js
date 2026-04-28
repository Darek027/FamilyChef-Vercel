// WERSJA 4.1.0 - API VERCEL: POBIERANIE BIBLIOTEKI I LIST ZAKUPÓW
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ status: "error", message: "Metoda niedozwolona" });

    // WERSJA 4.1.1 - API VERCEL: DASHBOARD Z LOGIKĄ FAMILY ID
    // Używamy query params dla żądań GET
    const { email, familyId } = req.query;
    if (!email) return res.status(400).json({ status: "error", message: "Brak identyfikatora użytkownika." });

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. Dynamiczne budowanie zapytania dla przepisów
        let recipeQuery = supabase
            .from('recipes')
            .select('id, title, category, author_email, created_at');

        // Jeśli użytkownik ma Family ID, pobieramy przepisy całej rodziny. Jeśli nie, tylko jego własne.
        if (familyId && familyId !== 'undefined' && familyId.trim() !== '') {
            recipeQuery = recipeQuery.eq('family_id', familyId);
        } else {
            recipeQuery = recipeQuery.eq('author_email', email);
        }

        const { data: recipes, error: recipesError } = await recipeQuery.order('created_at', { ascending: false });

        if (recipesError) throw recipesError;

        // 2. Pobieranie list zakupów
        const { data: shoppingLists, error: shoppingError } = await supabase
            .from('shopping_lists')
            .select('*')
            .eq('author_email', email)
            .order('created_at', { ascending: false });

        if (shoppingError) throw shoppingError;

        // 3. Zwracamy paczkę w formacie, jakiego oczekuje frontend
        return res.status(200).json({ 
            status: "success", 
            recipes: recipes || [],
            shoppingLists: shoppingLists || []
        });

    } catch (error) {
        console.error("🔥 DASHBOARD ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd ładowania Twojej kuchni." });
    }
}