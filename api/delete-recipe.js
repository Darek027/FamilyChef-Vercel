// WERSJA 4.9.0 - API VERCEL: USUWANIE PRZEPISU
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { recipeId, email } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabase
            .from('recipes')
            .delete()
            .eq('id', recipeId)
            .eq('author_email', email);

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Przepis usunięty." });
    } catch (error) {
        return res.status(500).json({ status: "error", message: "Błąd usuwania." });
    }
}