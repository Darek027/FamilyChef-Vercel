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
        const authUserId = user.id; // MIGRACJA na UUID

        // WERSJA 4.5.5 - BUGFIX SAAS: Odczyt Kodu Rodziny bezpośrednio z Base64 JWT
        let realFamilyId = null;
        try {
            const tokenStr = authHeader.replace('Bearer ', '');
            const payloadBase64 = tokenStr.split('.')[1];
            const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
            const jwtPayload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
            realFamilyId = jwtPayload.app_metadata?.family_id || null;
        } catch (e) {
            console.error("🔥 Błąd dekodowania JWT:", e);
        }

        // 3. Budujemy zapytanie o usunięcie, bazując WYŁĄCZNIE na twardych danych
        let query = supabase.from('shopping_lists').delete().eq('id', listId);

        if (realFamilyId && realFamilyId.trim() !== '') {
            query = query.eq('family_id', realFamilyId);
        } else {
            query = query.eq('author_id', authUserId); // Zabezpieczenie usuwania po UUID
        }

        const { error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: "success" });

    } catch (error) {
        console.error("🔥 DELETE SHOPPING LIST ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd usuwania listy." });
    }
}