// WERSJA 4.5.1 - API VERCEL: AKTUALIZACJA CHECKBOXÓW Z FAMILY ID
// WERSJA 4.5.3 - ZERO TRUST CHECKBOXY
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Ignorujemy email i familyId
    const { listId, listData } = req.body;

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // 1. Weryfikacja kryptograficzna
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
        const realEmail = user.email;

        // 2. Pobranie zaufanego Family ID
        const { data: profile } = await supabase
            .from('users')
            .select('family_id')
            .eq('email', realEmail)
            .single();
        const realFamilyId = profile?.family_id;

        // Zaczynamy budować zapytanie...
        let query = supabase
            .from('shopping_lists')
            .update({ data: listData })
            .eq('id', listId);

        // Zabezpieczamy edycję twardymi danymi
        if (realFamilyId && realFamilyId.trim() !== '') {
            query = query.eq('family_id', realFamilyId);
        } else {
            query = query.eq('author_email', realEmail);
        }

        const { error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: "success" });

    } catch (error) {
        console.error("🔥 UPDATE SHOPPING LIST ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd aktualizacji bazy." });
    }
}