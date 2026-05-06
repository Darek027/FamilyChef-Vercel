// WERSJA 4.1.0 - API VERCEL: POBIERANIE BIBLIOTEKI I LIST ZAKUPÓW
export default async function handler(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ status: "error", message: "Metoda niedozwolona" });

    // WERSJA 4.7.4 - ZERO TRUST DASHBOARD: Twarda weryfikacja tożsamości z JWT
    // UWAGA: Ignorujemy const { email, familyId } = req.query! Frontend nie decyduje, kim jest.

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ status: "error", message: "Brak dostępu. Zaloguj się ponownie." });
        }

        const { createClient } = await import('@supabase/supabase-js');
        
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // 1. KRYPTOGRAFICZNA WERYFIKACJA (Wyciągamy prawdziwy e-mail z tokena)
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
        const realEmail = user.email;

        // 2. BEZPIECZNE POBRANIE FAMILY_ID Z BAZY (a nie z paska URL)
        const { data: profile } = await supabase
            .from('users')
            .select('family_id')
            .eq('email', realEmail)
            .single();
        const realFamilyId = profile?.family_id;

        // 3. Dynamiczne budowanie zapytania dla przepisów
        let recipeQuery = supabase
            .from('recipes')
            .select('id, title, category, author_email, created_at');

        if (realFamilyId && realFamilyId.trim() !== '') {
            recipeQuery = recipeQuery.eq('family_id', realFamilyId);
        } else {
            recipeQuery = recipeQuery.eq('author_email', realEmail);
        }

        const { data: recipes, error: recipesError } = await recipeQuery.order('created_at', { ascending: false });
        if (recipesError) throw recipesError;

        // 4. Pobieranie list zakupów (Zaktualizowano: uwzględnia również Family ID, wcześniej było tylko email)
        let shoppingQuery = supabase
            .from('shopping_lists')
            .select('*');

        if (realFamilyId && realFamilyId.trim() !== '') {
            shoppingQuery = shoppingQuery.eq('family_id', realFamilyId);
        } else {
            shoppingQuery = shoppingQuery.eq('author_email', realEmail);
        }

        const { data: shoppingLists, error: shoppingError } = await shoppingQuery.order('created_at', { ascending: false });
        if (shoppingError) throw shoppingError;

        // 3. Zwracamy paczkę w formacie, jakiego oczekuje frontend
        return res.status(200).json({ 
            status: "success", 
            recipes: recipes || [],
            shoppingLists: shoppingLists || []
        });

    // WERSJA 4.7.3 - DASHBOARD: Agresywne łapanie błędów JWT
    } catch (error) {
        console.error("🔥 DASHBOARD ERROR:", error);
        // Zabezpieczamy się na różne warianty zwracania błędu wygasłego tokena przez Supabase
        if (error.code === 'PGRST301' || error.status === 401 || (error.message && error.message.includes('JWT'))) {
            return res.status(401).json({ status: "error", message: "Sesja wygasła." });
        }
        return res.status(500).json({ status: "error", message: "Błąd ładowania Twojej kuchni." });
    }
}