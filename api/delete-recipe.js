// WERSJA 4.9.5 - API VERCEL: MASOWE USUWANIE PRZEPISÓW (Bulk Delete)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // WERSJA 4.9.7 - RLS SECURITY + ZERO TRUST: Nie ufamy tożsamości z frontendu
    // Usunęliśmy odbieranie 'email' z req.body, bierzemy tylko ID zasobów
    const { recipeId, recipeIds } = req.body; 

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // 1. Weryfikujemy JWT kryptograficznie na backendzie i wyciągamy UUID
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny lub wygasły token sesji." });
        }
        const authUserId = user.id; // MIGRACJA na UUID

        // 2. Pobieramy prawdziwe Family ID użytkownika (po UUID) - Wdrożenie Kroku 3.4 z Planu
        const { data: profile } = await supabase
            .from('users')
            .select('family_id')
            .eq('id', authUserId)
            .single();
        const realFamilyId = profile?.family_id;

        // 3. Query podlega RLS, a my dodatkowo wymuszamy twarde powiązanie po UUID lub Rodzinie
        let query = supabase.from('recipes').delete();
        
        if (realFamilyId && realFamilyId.trim() !== '') {
            query = query.eq('family_id', realFamilyId);
        } else {
            query = query.eq('author_id', authUserId); // Zabezpieczenie usuwania po UUID
        }

        if (recipeIds && Array.isArray(recipeIds) && recipeIds.length > 0) {
            // Operacja MASOWA: uderzamy operatorem .in()
            query = query.in('id', recipeIds);
        } else if (recipeId) {
            // Operacja POJEDYNCZA: uderzamy starym operatorem .eq()
            query = query.eq('id', recipeId);
        } else {
            throw new Error("Brak danych wejściowych do usunięcia.");
        }

        const { error } = await query;

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Pomyślnie usunięto dane." });
    } catch (error) {
        console.error("🔥 BULK DELETE ERROR:", error.message);
        return res.status(500).json({ status: "error", message: "Błąd usuwania: " + error.message });
    }
}