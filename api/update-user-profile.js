// WERSJA 5.5.0 - ZERO TRUST PROFIL (Obsługa Nazwy/Nicku)
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Ignorujemy email od klienta, ale odbieramy pole "name"
    let { name, familyId, preferences, defaultServings, defaultChef, defaultSkill } = req.body;

    try {
        // WERSJA 6.2.0 - [SAAS SECURITY: Universal Cookie Parser]
        const parseCookies = (cookieHeader) => {
            if (!cookieHeader) return {};
            return cookieHeader.split(';').reduce((res, c) => {
                const [key, val] = c.trim().split('=').map(decodeURIComponent);
                return Object.assign(res, { [key]: val });
            }, {});
        };
        const cookies = parseCookies(req.headers.cookie);
        const tokenToVerify = cookies['sb-access-token'];

        if (!tokenToVerify) return res.status(401).json({ status: "error", message: "Brak ciasteczka autoryzacyjnego." });

        const { createClient } = await import('@supabase/supabase-js');
        const crypto = await import('crypto'); 
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${tokenToVerify}` } }
        });

        // 1. Weryfikacja tożsamości z JWT
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) {
            return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        }
// WERSJA 4.9.2 - [SAAS SECURITY: Backendowa walidacja wejściowa Family ID]
        const realEmail = user.email; // JEDYNE ZAUFANE ŹRÓDŁO TOŻSAMOŚCI
        const authUserId = user.id; // Migracja na UUID

        if (!familyId || familyId.trim() === "") {
            let isUnique = false;
            let generatedId = "";

            while (!isUnique) {
                const segment1 = crypto.randomBytes(2).toString('hex').toUpperCase();
                const segment2 = crypto.randomBytes(2).toString('hex').toUpperCase();
                generatedId = `FC-${segment1}-${segment2}`;

                const { data: existingUsers, error: checkError } = await supabase
                    .from('users')
                    .select('id')
                    .eq('family_id', generatedId)
                    .limit(1);

                if (checkError) throw checkError;
                
                if (!existingUsers || existingUsers.length === 0) {
                    isUnique = true; 
                }
            }
            familyId = generatedId;
        } else {
            // TWARDA WALIDACJA: Użytkownik podał własny kod. Weryfikujemy go.
            familyId = familyId.trim().toUpperCase();
            
            if (familyId.length < 8) {
                return res.status(400).json({ status: "error", message: "Ze względów bezpieczeństwa kod rodziny musi posiadać co najmniej 8 znaków." });
            }
            if (!/^[A-Z0-9-]+$/.test(familyId)) {
                return res.status(400).json({ status: "error", message: "Kod rodziny zawiera niedozwolone znaki." });
            }
        }

        // 1. Zapisanie danych w głównej tabeli użytkownika (Wersja 5.5.0 - Dynamiczny Payload)
        const updatePayload = { 
            family_id: familyId, 
            preferences: preferences,
            default_servings: defaultServings || 2 
        };
        
        // Zabezpieczenie wejściowe dla nazwy (chronimy bazę przed wstrzykiwaniem długich ciągów)
        if (name && typeof name === 'string' && name.trim() !== '') {
            updatePayload.name = name.trim().substring(0, 15); 
        }

        // Zabezpieczenie: Aktualizujemy parametry AI tylko jeśli zostały przesłane z frontendu
        if (defaultChef) updatePayload.default_chef = defaultChef;
        if (defaultSkill) updatePayload.default_skill = defaultSkill;

        const { error: userError } = await supabase
            .from('users')
            .update(updatePayload)
            .eq('id', authUserId); // MIGRACJA: Aktualizacja po stałym ID

        if (userError) throw userError;

        // 2. Aktualizacja Kodu Rodziny we wszystkich przepisach TEGO autora
        const { error: recipesError } = await supabase
            .from('recipes')
            .update({ family_id: familyId })
            .eq('author_id', authUserId); // MIGRACJA: Szukamy po stałym ID

        if (recipesError) throw recipesError;

        // 3. Aktualizacja Kodu Rodziny we wszystkich listach zakupów TEGO autora
        const { error: shoppingError } = await supabase
            .from('shopping_lists')
            .update({ family_id: familyId })
            .eq('author_id', authUserId); // MIGRACJA: Szukamy po stałym ID

        if (shoppingError) throw shoppingError;

        return res.status(200).json({ 
            status: "success", 
            message: "Konto zaktualizowane i połączone!", 
            newFamilyId: familyId 
        });
    } catch (error) {
        console.error("🔥 UPDATE PROFILE ERROR:", error);
        return res.status(500).json({ status: "error", message: "Błąd zapisu profilu." });
    }
}