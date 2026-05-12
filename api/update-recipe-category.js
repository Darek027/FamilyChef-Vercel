// WERSJA 4.8.0 - API VERCEL: AKTUALIZACJA KATEGORII PRZEPISU
// WERSJA 4.9.1 - ZERO TRUST KATEGORIE
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Ignorujemy email z frontendu
    const { recipeId, category } = req.body;

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // Weryfikacja kryptograficzna tożsamości
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
        const realEmail = user.email;
        const authUserId = user.id; // Migracja na UUID

        const { error } = await supabase
            .from('recipes')
            .update({ category: category })
            .eq('id', recipeId)
            .eq('author_id', authUserId); // MIGRACJA: Zabezpieczenie modyfikacji po UUID!

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Kategoria zaktualizowana!" });
    } catch (error) {
        console.error("🔥 UPDATE CATEGORY ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd bazy danych." });
    }
}