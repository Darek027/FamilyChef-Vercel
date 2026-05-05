// WERSJA 4.4.0 - API VERCEL: POBIERANIE LIST ZAKUPÓW Z SUPABASE
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ status: "error" });

    // WERSJA 4.4.2 - API VERCEL: POBIERANIE LIST ZAKUPÓW Z FAMILY ID
    // Odbieramy familyId z frontendu
    const { email, familyId } = req.query;
    if (!email) return res.status(400).json({ status: "error", message: "Brak emaila." });

    // WERSJA 4.7.1 - RLS SECURITY: Listy zakupów z Anon Key
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ status: "error", message: "Brak dostępu. Zaloguj się ponownie." });
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        let query = supabase.from('shopping_lists').select('*');

        // Dynamiczne filtrowanie (Tenant Isolation)
        if (familyId && familyId !== 'undefined' && familyId.trim() !== '') {
            query = query.eq('family_id', familyId);
        } else {
            query = query.eq('author_email', email);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json({ status: "success", lists: data });

    } catch (error) {
        console.error("🔥 GET SHOPPING LISTS ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd ładowania list zakupów." });
    }
}