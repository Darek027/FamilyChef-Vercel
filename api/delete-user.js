// WERSJA 4.9.6 - API VERCEL: USUWANIE KONTA (HARD RESET - ON DELETE CASCADE)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error", message: "Metoda niedozwolona." });

    const { email } = req.body;
    if (!email) return res.status(400).json({ status: "error", message: "Brak e-maila." });

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // Usuwamy użytkownika z głównej tabeli public.users
        // Dzięki 'ON DELETE CASCADE' w PostgreSQL, powiązane przepisy i listy zakupów znikną automatycznie.
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('email', email);

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Konto i powiązane dane zostały trwale usunięte." });
    } catch (error) {
        console.error("🔥 BŁĄD USUWANIA KONTA:", error);
        return res.status(500).json({ status: "error", message: "Krytyczny błąd podczas usuwania konta." });
    }
}