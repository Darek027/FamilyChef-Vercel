// WERSJA 4.9.18 - DYNAMICZNY UPDATE LISTY ZAKUPÓW
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Ignorujemy email i familyId z frontendu, pobieramy dane
    const { listId, listData, newTitle } = req.body;

    try {
        // WERSJA 6.2.0 - [SAAS SECURITY: Universal Cookie Parser]
        const parseCookies = (cookieHeader) => {
            if (!cookieHeader) return {};
            return cookieHeader.split(';').reduce((res, c) => {
                const [key, val] = c.trim().split('=').map(decodeURIComponent);
                return Object.assign(res, { [key]: val });
            }, {});
        };
        const cookies = parseCookies(req.headers.cookie);
        const tokenToVerify = cookies['sb-access-token'];

        if (!tokenToVerify) return res.status(401).json({ status: "error", message: "Brak ciasteczka autoryzacyjnego." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${tokenToVerify}` } }
        });

        // 1. Weryfikacja kryptograficzna
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
        const authUserId = user.id; // Migracja na UUID

        // WERSJA 6.2.1 - BUGFIX SAAS: Odczyt Kodu Rodziny bezpośrednio z ciasteczka
        let realFamilyId = null;
        try {
            const payloadBase64 = tokenToVerify.split('.')[1];
            const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
            const jwtPayload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
            realFamilyId = jwtPayload.app_metadata?.family_id || null;
        } catch (e) {
            console.error("🔥 Błąd dekodowania JWT:", e);
        }

        // BUDOWA DYNAMICZNEGO PAYLOADU
        let updatePayload = {};
        if (listData !== undefined) updatePayload.data = listData;
        if (newTitle !== undefined) updatePayload.title = newTitle;

        if (Object.keys(updatePayload).length === 0) {
            return res.status(400).json({ status: "error", message: "Brak danych." });
        }

        // Zaczynamy budować zapytanie...
        let query = supabase
            .from('shopping_lists')
            .update(updatePayload)
            .eq('id', listId);

        // Zabezpieczamy edycję twardymi danymi (Teraz po UUID)
        if (realFamilyId && realFamilyId.trim() !== '') {
            query = query.eq('family_id', realFamilyId);
        } else {
            query = query.eq('author_id', authUserId); // Zabezpieczenie po stałym UUID
        }

        const { error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: "success" });

    } catch (error) {
        console.error("🔥 UPDATE SHOPPING LIST ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd aktualizacji bazy." });
    }
}