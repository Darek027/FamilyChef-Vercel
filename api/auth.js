// WERSJA 4.6.1 - ENDPOINT AUTORYZACJI OTP (Separacja klientów - Fix RLS)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: "error", message: "Metoda niedozwolona. Użyj POST." });
    }

    const { email, step, token } = req.body;
    if (!email) {
        return res.status(400).json({ status: "error", message: "Brak adresu email." });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        
        // KLIENT 1: Zwykły klient do obsługi autoryzacji (Zmienia stany, loguje użytkownika)
        const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        // KLIENT 2: Administrator. Zawsze omija RLS, nie przechowuje sesji zwykłych użytkowników.
        const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // KROK 1: WYSYŁKA KODU OTP NA E-MAIL
        if (step === 'send') {
            const { error } = await supabaseAuth.auth.signInWithOtp({
                email: email,
                options: {
                    shouldCreateUser: true
                }
            });
            
            if (error) {
                console.error("Supabase OTP Error:", error);
                return res.status(400).json({ status: "error", message: "Nie udało się wysłać kodu. Sprawdź limit lub poprawność emaila." });
            }
            
            return res.status(200).json({ status: "success", message: "Kod OTP wysłany." });
        }

        // KROK 2: WERYFIKACJA KODU OTP LUB AUTO-LOGOWANIE (get_profile)
        if (step === 'verify' || step === 'get_profile') {
            
            let sessionData = null;

            // Uderzamy klientem Auth, który po weryfikacji zapamięta u siebie tę sesję
            if (step === 'verify') {
                if (!token) return res.status(400).json({ status: "error", message: "Brak kodu." });

                const { data: authData, error: authError } = await supabaseAuth.auth.verifyOtp({
                    email,
                    token,
                    type: 'email'
                });

                if (authError) {
                    return res.status(400).json({ status: "error", message: "Nieprawidłowy kod lub wygasł." });
                }
                sessionData = authData.session;
            }

            // GŁÓWNA LOGIKA SAAS: Uderzamy klientem ADMIN, aby obejść RLS (Provisioning z public.users)
            let { data: user, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (fetchError) throw fetchError;

            // Profilu nie ma? Administrator tworzy go w ułamku sekundy
            if (!user) {
                const crypto = await import('crypto');
                let isUnique = false;
                let generatedId = "";

                while (!isUnique) {
                    const segment1 = crypto.randomBytes(2).toString('hex').toUpperCase();
                    const segment2 = crypto.randomBytes(2).toString('hex').toUpperCase();
                    generatedId = `FC-${segment1}-${segment2}`;

                    const { data: existing, error: checkError } = await supabaseAdmin
                        .from('users')
                        .select('id')
                        .eq('family_id', generatedId)
                        .limit(1);

                    if (checkError) throw checkError;
                    if (!existing || existing.length === 0) {
                        isUnique = true;
                    }
                }

                // Administrator wstrzykuje nowy wiersz bez patrzenia na zasady RLS (Bypass)
                const { data: newUser, error: insertError } = await supabaseAdmin
                    .from('users')
                    .insert([{ 
                        email: email, 
                        is_premium: false,
                        default_chef: 'DEFAULT_CHEF',
                        default_skill: 'DEFAULT_SKILL',
                        family_id: generatedId 
                    }])
                    .select()
                    .single();

                if (insertError) throw insertError;
                user = newUser;
            }

            return res.status(200).json({
                status: "success",
                message: step === 'verify' ? "Zalogowano pomyślnie OTP" : "Profil pobrany",
                data: user,
                session: sessionData 
            });
        }

        return res.status(400).json({ status: "error", message: "Brak zdefiniowanego kroku autoryzacji." });

    } catch (error) {
        console.error("🔥 BŁĄD BACKENDU:", error); 
        return res.status(500).json({
            status: "error",
            message: "Błąd serwera podczas autoryzacji.",
            details: error.message
        });
    }
}