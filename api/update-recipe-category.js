// WERSJA 4.8.0 - API VERCEL: AKTUALIZACJA KATEGORII PRZEPISU
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { recipeId, category, email } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabase
            .from('recipes')
            .update({ category: category })
            .eq('id', recipeId)
            .eq('author_email', email);

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Kategoria zaktualizowana!" });
    } catch (error) {
        console.error("🔥 UPDATE CATEGORY ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd bazy danych." });
    }
}