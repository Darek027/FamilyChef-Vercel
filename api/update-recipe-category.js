// WERSJA 4.9.17 - DYNAMICZNY UPDATE (Kategoria + Tytuł w jednym pliku)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Odbieramy opcjonalne pola
    const { recipeId, category, newTitle } = req.body;

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

        // Weryfikacja kryptograficzna tożsamości
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
        const authUserId = user.id;

        // 1. BUDOWA DYNAMICZNEGO OBIEKTU AKTUALIZACJI
        let updatePayload = {};
        if (category !== undefined) updatePayload.category = category;
        if (newTitle !== undefined) updatePayload.title = newTitle;

        if (Object.keys(updatePayload).length === 0) {
            return res.status(400).json({ status: "error", message: "Brak danych do aktualizacji." });
        }

        // 2. BEZPIECZNA AKTUALIZACJA W BAZIE
        const { error } = await supabase
            .from('recipes')
            .update(updatePayload)
            .eq('id', recipeId)
            .eq('author_id', authUserId); // Zabezpieczenie modyfikacji po UUID!

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Zaktualizowano pomyślnie!" });
    } catch (error) {
        console.error("🔥 UPDATE RECIPE ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd bazy danych." });
    }
}