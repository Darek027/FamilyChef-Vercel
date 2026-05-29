// WERSJA 4.6.1 - ENDPOINT AUTORYZACJI OTP (Separacja klientów - Fix RLS)

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ status: "error", message: "Metoda niedozwolona. Użyj POST." });
    }

    // WERSJA 6.1.0 - [SAAS SECURITY: Obsługa HTTP-Only Cookies]
    // Odbieramy dodatkowe flagi RODO z frontendu
    const { email, step, token, termsAccepted, healthConsent } = req.body;
    
    // Funkcja pomocnicza do bezpiecznego parsowania ciasteczek
    const parseCookies = (cookieHeader) => {
        if (!cookieHeader) return {};
        return cookieHeader.split(';').reduce((res, c) => {
            const [key, val] = c.trim().split('=').map(decodeURIComponent);
            return Object.assign(res, { [key]: val });
        }, {});
    };
    const cookies = parseCookies(req.headers.cookie);
    
    // WERSJA 6.2.1 - [SAAS SECURITY: Prawdziwe Zero Trust]
    // Email nie jest wymagany przy odświeżaniu, wylogowywaniu ORAZ przy inicjalizacji sesji (get_profile)
    if (!email && step !== 'refresh' && step !== 'logout' && step !== 'get_profile') {
        return res.status(400).json({ status: "error", message: "Brak adresu email." });
    }

    try {
        const { createClient } = await import('@supabase/supabase-js');
        
        // KLIENT 1: Zwykły klient do obsługi autoryzacji (Zmienia stany, loguje użytkownika)
        const supabaseAuth = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        
        // KLIENT 2: Administrator. Zawsze omija RLS, nie przechowuje sesji zwykłych użytkowników.
        const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // WERSJA 6.1.1 - Niszczenie sesji (Wylogowanie)
        if (step === 'logout') {
            res.setHeader('Set-Cookie', [
                'sb-access-token=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure',
                'sb-refresh-token=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure'
            ]);
            return res.status(200).json({ status: "success", message: "Wylogowano." });
        }

        // NOWY KROK: ODŚWIEŻANIE SESJI (Na podstawie HttpOnly Cookie)
        if (step === 'refresh') {
            const refresh_token = cookies['sb-refresh-token'];
            if (!refresh_token) return res.status(401).json({ status: "error", message: "Brak tokenu odświeżania." });
            
            const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token });
            if (error || !data.session) {
                res.setHeader('Set-Cookie', [
                    'sb-access-token=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure',
                    'sb-refresh-token=; Path=/; HttpOnly; SameSite=Strict; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Secure'
                ]);
                return res.status(401).json({ status: "error", message: "Sesja wygasła. Zaloguj się ponownie." });
            }
            
            res.setHeader('Set-Cookie', [
                `sb-access-token=${data.session.access_token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${data.session.expires_in}; Secure`,
                `sb-refresh-token=${data.session.refresh_token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3456000; Secure`
            ]);
            
            return res.status(200).json({ status: "success" }); // ZERO TRUST: Nie zwracamy tokenów na frontend!
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
                // WERSJA 6.1.2 - Odczyt tokenu z bezpiecznego ciasteczka
                const tokenToVerify = cookies['sb-access-token'];
                if (!tokenToVerify) {
                    return res.status(401).json({ status: "error", message: "Brak ciasteczka sesji. Odmowa dostępu." });
                }
                
                // Sprawdzamy tożsamość z użyciem dostarczonego JWT
                const { data: authData, error: authError } = await supabaseAuth.auth.getUser(tokenToVerify);

                if (authError || !authData.user) {
                    return res.status(401).json({ status: "error", message: "Nieprawidłowy lub wygasły token sesji." });
                }

                // WERSJA 6.2.2 - [SAAS SECURITY: Zapis authUserId po weryfikacji JWT]
                // UFAMY TYLKO JWT: Ignorujemy email z body (który mógł zniknąć z localStorage na iOS)
                // i pobieramy go bezpośrednio ze zweryfikowanego tokena kryptograficznego.
                
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

            // WERSJA 6.1.6 - [BUGFIX: Poprawa struktury if/else przy Auto-Provisioningu]
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

                const now = new Date().toISOString();
                
                const { data: newUser, error: insertError } = await supabaseAdmin
                    .from('users')
                    .insert([{ 
                        id: authUserId, 
                        email: verifiedEmail,
                        name: verifiedEmail.split('@')[0],
                        default_chef: 'DEFAULT_CHEF',
                        default_skill: 'DEFAULT_SKILL',
                        family_id: generatedId,
                        terms_accepted_at: termsAccepted ? now : null,
                        health_consent_at: healthConsent ? now : null
                    }])
                    .select()
                    .single();

                if (insertError) throw insertError;
                user = newUser;

                // Inicjalizacja portfela limitów dla NOWEGO konta
                const { error: billingInsertError } = await supabaseAdmin
                    .from('users_billing')
                    .insert([{
                        id: authUserId,
                        is_premium: false,
                        daily_generations: 0,
                        daily_emails: 0
                    }]);
                
                if (billingInsertError) throw billingInsertError;
                user.is_premium = false; 

            } else {
                // Użytkownik JUŻ ISTNIEJE (Kolejne logowanie)
                if (step === 'verify' && (termsAccepted || healthConsent)) {
                    const updatePayload = {};
                    const now = new Date().toISOString();
                    if (termsAccepted) updatePayload.terms_accepted_at = now;
                    if (healthConsent) updatePayload.health_consent_at = now;
                    
                    await supabaseAdmin.from('users').update(updatePayload).eq('id', user.id);
                }

                // Pobieranie statusu premium dla istniejącego użytkownika
                const { data: billing } = await supabaseAdmin
                    .from('users_billing')
                    .select('is_premium')
                    .eq('id', user.id)
                    .maybeSingle();
                
                user.is_premium = billing?.is_premium || false; 
            }

            // WERSJA 4.7.3 - SAAS TRANSPARENCY: Odczyt członków rodziny
            if (user.family_id) {
                const { data: familyData } = await supabaseAdmin
                    .from('users')
                    .select('email')
                    .eq('family_id', user.family_id);
                
                user.family_members = familyData ? familyData.map(m => m.email) : [];
            }

            // WERSJA 6.1.3 - Wstrzyknięcie ciasteczek po udanym logowaniu OTP
            if (step === 'verify' && sessionData) {
                res.setHeader('Set-Cookie', [
                    `sb-access-token=${sessionData.access_token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${sessionData.expires_in}; Secure`,
                    `sb-refresh-token=${sessionData.refresh_token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3456000; Secure`
                ]);
            }

            return res.status(200).json({
                status: "success",
                message: step === 'verify' ? "Zalogowano pomyślnie OTP" : "Profil pobrany",
                data: user
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