// WERSJA 4.4.0 - API VERCEL: POBIERANIE LIST ZAKUPÓW Z SUPABASE
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ status: "error" });

    // WERSJA 4.7.4 - ZERO TRUST LISTY ZAKUPÓW
    // Nie odczytujemy req.query.email ani req.query.familyId!

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ status: "error", message: "Brak dostępu. Zaloguj się ponownie." });
        }

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // WERSJA 4.9.0 - AUTH HOOK: ODCZYT TOŻSAMOŚCI I KODU RODZINY PROSTO Z JWT
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
        const authUserId = user.id; 

        // Koniec z zapytaniami N+1 - czytamy bezpośrednio z tokena!
        const realFamilyId = user.app_metadata?.family_id || null;

        let query = supabase.from('shopping_lists').select('*');

        // 3. Budujemy filtrowanie w oparciu o bezpieczne UUID
        if (realFamilyId && realFamilyId.trim() !== '') {
            query = query.eq('family_id', realFamilyId);
        } else {
            query = query.eq('author_id', authUserId); // MIGRACJA
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) throw error;

        return res.status(200).json({ status: "success", lists: data });

// WERSJA 4.7.3 - Shopping List: Agresywne łapanie błędów JWT
    } catch (error) {
        console.error("🔥 SHOPPING LIST ERROR:", error);
        // Zabezpieczamy się na różne warianty zwracania błędu wygasłego tokena przez Supabase
        if (error.code === 'PGRST301' || error.status === 401 || (error.message && error.message.includes('JWT'))) {
            return res.status(401).json({ status: "error", message: "Sesja wygasła." });
        }
        return res.status(500).json({ status: "error", message: "Błąd ładowania Twojej kuchni." });
    }
}