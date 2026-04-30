// WERSJA 4.9.5 - API VERCEL: MASOWE USUWANIE PRZEPISÓW (Bulk Delete)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Przyjmujemy stare recipeId (string) lub nowe recipeIds (tablica)
    const { recipeId, recipeIds, email } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // Zabezpieczamy query kontekstem autora
        let query = supabase.from('recipes').delete().eq('author_email', email);

        if (recipeIds && Array.isArray(recipeIds) && recipeIds.length > 0) {
            // Operacja MASOWA: uderzamy operatorem .in()
            query = query.in('id', recipeIds);
        } else if (recipeId) {
            // Operacja POJEDYNCZA: uderzamy starym operatorem .eq()
            query = query.eq('id', recipeId);
        } else {
            throw new Error("Brak danych wejściowych do usunięcia.");
        }

        const { error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Pomyślnie usunięto dane." });
    } catch (error) {
        console.error("🔥 BULK DELETE ERROR:", error.message);
        return res.status(500).json({ status: "error", message: "Błąd usuwania: " + error.message });
    }
}