// WERSJA 2.0.2 - ENDPOINT AUTORYZACJI (Z systemem logowania błędów)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: "error", message: "Metoda niedozwolona. Użyj POST." });
    }

    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ status: "error", message: "Brak adresu email." });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        let { data: user, error: fetchError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .maybeSingle();

        if (fetchError) throw fetchError;

        if (!user) {
            const { data: newUser, error: insertError } = await supabase
                .from('users')
                .insert([
                    { 
                        email: email, 
                        is_premium: false,
                        default_chef: 'DEFAULT_CHEF',
                        default_skill: 'DEFAULT_SKILL'
                    }
                ])
                .select()
                .single();

            if (insertError) throw insertError;
            user = newUser;
        }

        return res.status(200).json({
            status: "success",
            message: "Zalogowano pomyślnie",
            data: user
        });

    } catch (error) {
        // TUTAJ WŁĄCZAMY LOGI DLA CIEBIE (W TERMINALU VS CODE):
        console.error("🔥 BŁĄD BACKENDU:", error); 
        
        return res.status(500).json({
            status: "error",
            message: "Błąd serwera podczas logowania.",
            details: error.message
        });
    }
}