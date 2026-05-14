// WERSJA 4.6.1 - ENDPOINT AUTORYZACJI OTP (Separacja klientów - Fix RLS)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: "error", message: "Metoda niedozwolona. Użyj POST." });
    }

    const { email, step, token, refresh_token } = req.body;
    // ZMIANA: Email nie jest wymagany, jeśli tylko odświeżamy sesję
    if (!email && step !== 'refresh') {
        return res.status(400).json({ status: "error", message: "Brak adresu email." });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        
        // KLIENT 1: Zwykły klient do obsługi autoryzacji (Zmienia stany, loguje użytkownika)
        const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        // KLIENT 2: Administrator. Zawsze omija RLS, nie przechowuje sesji zwykłych użytkowników.
        const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // NOWY KROK: ODŚWIEŻANIE SESJI
        if (step === 'refresh') {
            if (!refresh_token) return res.status(400).json({ status: "error", message: "Brak refresh_token." });
            const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });
            if (error || !data.session) return res.status(401).json({ status: "error", message: "Sesja wygasła. Zaloguj się ponownie." });
            return res.status(200).json({ status: "success", session: data.session });
        }

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

        // WERSJA 4.6.2 - BACKEND: Kuloodporne weryfikowanie tożsamości (Zabezpieczenie przed IDOR / Wyciekiem danych)
        if (step === 'verify' || step === 'get_profile') {
            
            // WERSJA 4.7.0 - [SAAS SECURITY: Przechwytywanie systemowego UUID z auth.users]
            let sessionData = null;
            let verifiedEmail = null; 
            let authUserId = null; // Zapisujemy twardy UUID z systemu autoryzacji

            if (step === 'verify') {
                if (!token) return res.status(400).json({ status: "error", message: "Brak kodu." });

                // Uderzamy klientem Auth. Walidacja kodu po stronie systemu Supabase.
                const { data: authData, error: authError } = await supabaseAuth.auth.verifyOtp({
                    email,
                    token,
                    type: 'email'
                });

                // WERSJA 4.7.1 - [SAAS SECURITY: Zapis authUserId po weryfikacji kodu]
                if (authError || !authData.user) {
                    return res.status(400).json({ status: "error", message: "Nieprawidłowy kod lub wygasł." });
                }
                sessionData = authData.session;
                verifiedEmail = authData.user.email;
                authUserId = authData.user.id;
            }

            if (step === 'get_profile') {
                const authHeader = req.headers.authorization;
                if (!authHeader) {
                    return res.status(401).json({ status: "error", message: "Brak tokenu sesji. Odmowa dostępu." });
                }

                const tokenToVerify = authHeader.replace('Bearer ', '');
                
                // Sprawdzamy tożsamość z użyciem dostarczonego JWT
                const { data: authData, error: authError } = await supabaseAuth.auth.getUser(tokenToVerify);

                if (authError || !authData.user) {
                    return res.status(401).json({ status: "error", message: "Nieprawidłowy lub wygasły token sesji." });
                }

                // WERSJA 4.7.2 - [SAAS SECURITY: Zapis authUserId po weryfikacji JWT]
                if (authData.user.email !== email) {
                    return res.status(403).json({ status: "error", message: "Odmowa dostępu. Próba nieautoryzowanego odczytu." });
                }

                verifiedEmail = authData.user.email; 
                authUserId = authData.user.id;
            }

            // GŁÓWNA LOGIKA SAAS: Uderzamy klientem ADMIN, aby obejść RLS (Provisioning z public.users)
            // UŻYWAMY BEZWZGLĘDNIE ZMIENNEJ `verifiedEmail`, NIGDY SUROWEGO `email` Z REQUESTA!
            let { data: user, error: fetchError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('email', verifiedEmail)
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

                // WERSJA 5.4.0 - ZERO TRUST: Tworzenie konta w public.users (Bez kolumn wrażliwych)
                const { data: newUser, error: insertError } = await supabaseAdmin
                    .from('users')
                    .insert([{ 
                        id: authUserId, 
                        email: verifiedEmail, 
                        default_chef: 'DEFAULT_CHEF',
                        default_skill: 'DEFAULT_SKILL',
                        family_id: generatedId 
                    }])
                    .select()
                    .single();

                if (insertError) throw insertError;
                user = newUser;

                // WERSJA 5.4.1 - ZERO TRUST: Inicjalizacja portfela limitów w nowej tabeli
                const { error: billingInsertError } = await supabaseAdmin
                    .from('users_billing')
                    .insert([{
                        id: authUserId,
                        is_premium: false,
                        daily_generations: 0,
                        daily_emails: 0
                    }]);
                
                if (billingInsertError) throw billingInsertError;

                user.is_premium = false; // Doklejamy dla frontendu
            } else {
                // WERSJA 5.4.2 - Pobieranie statusu premium dla istniejącego użytkownika (Obejście RLS przez Admina)
                const { data: billing } = await supabaseAdmin
                    .from('users_billing')
                    .select('is_premium')
                    .eq('id', user.id)
                    .maybeSingle();
                
                user.is_premium = billing?.is_premium || false; // Doklejamy dla frontendu
            }

            // WERSJA 4.7.3 - SAAS TRANSPARENCY: Odczyt członków rodziny
            if (user.family_id) {
                const { data: familyData } = await supabaseAdmin
                    .from('users')
                    .select('email')
                    .eq('family_id', user.family_id);
                
                user.family_members = familyData ? familyData.map(m => m.email) : [];
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