// WERSJA 4.8.0 - API VERCEL: AKTUALIZACJA PROFILU UŻYTKOWNIKA
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { email, familyId, preferences } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        const { error } = await supabase
            .from('users')
            .update({ family_id: familyId, preferences: preferences })
            .eq('email', email);

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Profil zapisany!" });
    } catch (error) {
        console.error("🔥 UPDATE PROFILE ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd zapisu profilu." });
    }
}