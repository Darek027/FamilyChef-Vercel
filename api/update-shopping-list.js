// WERSJA 4.5.0 - API VERCEL: AKTUALIZACJA CHECKBOXÓW LISTY
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { listId, email, listData } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabase
            .from('shopping_lists')
            .update({ data: listData })
            .eq('id', listId)
            .eq('author_email', email);

        if (error) throw error;

        return res.status(200).json({ status: "success" });

    } catch (error) {
        console.error("🔥 UPDATE SHOPPING LIST ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd aktualizacji bazy." });
    }
}