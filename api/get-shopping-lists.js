// WERSJA 4.4.0 - API VERCEL: POBIERANIE LIST ZAKUPÓW Z SUPABASE
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ status: "error" });

    const { email } = req.query;
    if (!email) return res.status(400).json({ status: "error", message: "Brak emaila." });

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { data, error } = await supabase
            .from('shopping_lists')
            .select('*')
            .eq('author_email', email)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json({ status: "success", lists: data });

    } catch (error) {
        console.error("🔥 GET SHOPPING LISTS ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd ładowania list zakupów." });
    }
}