// WERSJA 4.8.0 - API VERCEL: AKTUALIZACJA PROFILU UŻYTKOWNIKA ORAZ PORCJI DOMYŚLNYCH
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // WERSJA 4.9.0 - API VERCEL: ODBIÓR DANYCH PROMPT MATRIX
    let { email, familyId, preferences, defaultServings, defaultChef, defaultSkill } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const crypto = await import('crypto'); 
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

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
        }

        // 1. Zapisanie danych w głównej tabeli użytkownika (Wersja 4.9.0 - Dynamiczny Payload)
        const updatePayload = { 
            family_id: familyId, 
            preferences: preferences,
            default_servings: defaultServings || 2 
        };

        // Zabezpieczenie: Aktualizujemy parametry AI tylko jeśli zostały przesłane z frontendu
        if (defaultChef) updatePayload.default_chef = defaultChef;
        if (defaultSkill) updatePayload.default_skill = defaultSkill;

        const { error: userError } = await supabase
            .from('users')
            .update(updatePayload)
            .eq('email', email);

        if (userError) throw userError;

        // 2. Aktualizacja Kodu Rodziny we wszystkich przepisach TEGO autora
        const { error: recipesError } = await supabase
            .from('recipes')
            .update({ family_id: familyId })
            .eq('author_email', email);

        if (recipesError) throw recipesError;

        // 3. Aktualizacja Kodu Rodziny we wszystkich listach zakupów TEGO autora
        const { error: shoppingError } = await supabase
            .from('shopping_lists')
            .update({ family_id: familyId })
            .eq('author_email', email);

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