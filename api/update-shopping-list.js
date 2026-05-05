// WERSJA 4.5.1 - API VERCEL: AKTUALIZACJA CHECKBOXÓW Z FAMILY ID
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Odbieramy nową zmienną z frontendu: familyId
    const { listId, email, familyId, listData } = req.body;

    // WERSJA 4.5.2 - RLS SECURITY: Bezpieczny klient aktualizacji listy zakupów
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // Zaczynamy budować zapytanie...
        let query = supabase
            .from('shopping_lists')
            .update({ data: listData })
            .eq('id', listId);

        // ...i sprawdzamy uprawnienia. Jeśli masz rodzinę, edytujesz w ramach rodziny.
        if (familyId && familyId !== 'undefined' && familyId.trim() !== '') {
            query = query.eq('family_id', familyId);
        } else {
            // Fallback (wsteczna kompatybilność) - jeśli nie masz rodziny, weryfikujemy tylko maila
            query = query.eq('author_email', email);
        }

        const { error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: "success" });

    } catch (error) {
        console.error("🔥 UPDATE SHOPPING LIST ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd aktualizacji bazy." });
    }
}