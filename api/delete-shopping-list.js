// WERSJA 4.5.1 - API VERCEL: USUWANIE LISTY ZAKUPÓW Z FAMILY ID
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // WERSJA 4.5.3 - RLS SECURITY + ZERO TRUST (Zabezpieczenie przed IDOR)
    const { listId } = req.body; // Ignorujemy email i familyId podane przez nieufnego klienta!

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // 1. Weryfikujemy tożsamość kryptograficznie
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
        const realEmail = user.email;

        // 2. Pobieramy prawdziwe Family ID użytkownika ze sprawdzonego źródła (Baza Danych)
        const { data: profile } = await supabase
            .from('users')
            .select('family_id')
            .eq('email', realEmail)
            .single();
            
        const realFamilyId = profile?.family_id;

        // 3. Budujemy zapytanie o usunięcie, bazując WYŁĄCZNIE na twardych danych
        let query = supabase.from('shopping_lists').delete().eq('id', listId);

        if (realFamilyId && realFamilyId.trim() !== '') {
            query = query.eq('family_id', realFamilyId);
        } else {
            query = query.eq('author_email', realEmail);
        }

        const { error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: "success" });

    } catch (error) {
        console.error("🔥 DELETE SHOPPING LIST ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd usuwania listy." });
    }
}