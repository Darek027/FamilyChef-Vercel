// WERSJA 4.5.0 - API VERCEL: USUWANIE LISTY ZAKUPÓW
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { listId, email } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabase
            .from('shopping_lists')
            .delete()
            .eq('id', listId)
            .eq('author_email', email);

        if (error) throw error;

        return res.status(200).json({ status: "success" });

    } catch (error) {
        console.error("🔥 DELETE SHOPPING LIST ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd usuwania listy." });
    }
}