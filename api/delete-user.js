// WERSJA 4.9.8 - API VERCEL: KOMPLETNE USUWANIE KONTA I DANYCH (SaaS Bulletproof)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error", message: "Metoda niedozwolona." });

    const { email } = req.body;
    if (!email) return res.status(400).json({ status: "error", message: "Brak e-maila." });

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak tokenu autoryzacyjnego." });

        const { createClient } = await import('@supabase/supabase-js');

        // KROK 1: Weryfikacja tożsamości z użyciem anon_key.
        // Zabezpiecza nas to przed sytuacją, gdzie użytkownik A próbuje wysłać żądanie usunięcia konta użytkownika B.
        const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
        
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Błąd weryfikacji tokenu sesji." });
        }

        // Zabezpieczenie cross-account
        if (user.email !== email) {
            return res.status(403).json({ status: "error", message: "Odmowa dostępu: Brak uprawnień do usunięcia tego konta." });
        }

        // KROK 2: Inicjalizacja instancji Admina (Obejście RLS).
        // Tylko ten klient ma odpowiednie uprawnienia, żeby wyrzucić użytkownika z systemowego `auth.users`.
        const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // KROK 3: Usunięcie profilu z `public.users`.
        // Dzięki kaskadzie w bazie (ON DELETE CASCADE), PostgreSQL zdejmie w tym momencie wszystkie przepisy i listy zakupów tego e-maila.
        const { error: dbError } = await supabaseAdmin
            .from('users')
            .delete()
            .eq('email', email);

        if (dbError) throw dbError;

        // KROK 4: Skasowanie tożsamości z systemowego modułu Auth Supabase.
        const { error: adminAuthError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

        if (adminAuthError) throw adminAuthError;

        return res.status(200).json({ status: "success", message: "Konto i powiązane dane zostały trwale usunięte." });
    } catch (error) {
        console.error("🔥 KRYTYCZNY BŁĄD USUWANIA KONTA:", error);
        return res.status(500).json({ status: "error", message: "Krytyczny błąd podczas usuwania konta i danych z bazy." });
    }
}