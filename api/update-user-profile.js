// WERSJA 4.8.0 - API VERCEL: AKTUALIZACJA PROFILU UŻYTKOWNIKA
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    // Używamy 'let' dla familyId, ponieważ możemy je zaraz nadpisać wygenerowanym kodem
    let { email, familyId, preferences } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const crypto = await import('crypto'); // Wbudowany, bezpieczny moduł kryptograficzny Node.js
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // WERSJA 4.9.3 - BACKEND: Bezpieczne generowanie FamilyID (Single Source of Truth)
        // Jeśli użytkownik zażądał nowej rodziny (przysłał pusty klucz)
        if (!familyId || familyId.trim() === "") {
            let isUnique = false;
            let generatedId = "";

            while (!isUnique) {
                // 1. Generujemy kryptograficznie bezpieczny hash (np. FC-A8K2-B9X1)
                const segment1 = crypto.randomBytes(2).toString('hex').toUpperCase();
                const segment2 = crypto.randomBytes(2).toString('hex').toUpperCase();
                generatedId = `FC-${segment1}-${segment2}`;

                // 2. Odpytujemy bazę: czy ktokolwiek już ma taki FamilyID?
                const { data: existingUsers, error: checkError } = await supabase
                    .from('users')
                    .select('id')
                    .eq('family_id', generatedId)
                    .limit(1);

                if (checkError) throw checkError;
                
                // 3. Jeśli tablica jest pusta, kod jest w 100% unikalny. Przerywamy pętlę.
                if (!existingUsers || existingUsers.length === 0) {
                    isUnique = true; 
                }
            }
            // Zastępujemy puste pole wygenerowanym, unikalnym kluczem
            familyId = generatedId;
        }

        // 1. Zapisanie danych w głównej tabeli użytkownika
        const { error: userError } = await supabase
            .from('users')
            .update({ family_id: familyId, preferences: preferences })
            .eq('email', email);

        if (userError) throw userError;

        // WERSJA 4.9.2 - LOGIKA B2C: "W posagu" (Kaskadowa migracja danych)
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

       // Zwracamy nowo wygenerowany (lub zaktualizowany) klucz z powrotem do aplikacji
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