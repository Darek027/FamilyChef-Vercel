// WERSJA 5.2.1 - FIX: Usunięcie zduplikowanych deklaracji zmiennych
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// WERSJA 5.3.0 - ZERO TRUST EMAIL SENDER
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { recipe } = req.body; // Ignorujemy email i familyId z frontendu
    let currentEmailCount; 
    let verifiedEmail; // Do użytku w catch i limicie
    let authUserId; // Zmienna dla UUID

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });
        const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // KRYPTOGRAFICZNA WERYFIKACJA TOŻSAMOŚCI
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        
        verifiedEmail = authUser.email; // Jedyne zaufane źródło!
        authUserId = authUser.id; // Migracja UUID

        // --- START BLOKADY SPAMU ORAZ POBRANIA FAMILY_ID ---
        // WERSJA 5.3.1 - AUTH HOOK: Odczyt Kodu Rodziny z payloadu JWT
        const familyId = authUser.app_metadata?.family_id || null;

        const { data: billing } = await supabaseAdmin
            .from('users_billing')
            .select('*')
            .eq('id', authUserId)
            .maybeSingle();

        const isPremium = billing?.is_premium || false;
        const DAILY_FREE_EMAIL = parseInt(process.env.DAILY_FREE_EMAIL_LIMIT || '5', 10);
        const DAILY_PREMIUM_EMAIL = parseInt(process.env.DAILY_PREMIUM_EMAIL_LIMIT || '30', 10);
        
        const todayStr = new Date().toISOString().split('T')[0];
        const userLastEmail = billing?.last_email_date ? new Date(billing.last_email_date).toISOString().split('T')[0] : null;
        
        currentEmailCount = billing?.daily_emails || 0;
        if (userLastEmail !== todayStr) currentEmailCount = 0;

        if (!isPremium && currentEmailCount >= DAILY_FREE_EMAIL) {
            return res.status(429).json({ status: "error", message: `Wykorzystałeś darmowy limit maili (${DAILY_FREE_EMAIL}).` });
        }
        if (isPremium && currentEmailCount >= DAILY_PREMIUM_EMAIL) {
            return res.status(429).json({ status: "error", message: `Osiągnąłeś limit maili Premium (${DAILY_PREMIUM_EMAIL}).` });
        }

        // CHARGE UPFRONT: Pobieramy "opłatę" przez supabaseAdmin w nowej tabeli
        const { error: limitUpdateError } = await supabaseAdmin
            .from('users_billing')
            .update({ daily_emails: currentEmailCount + 1, last_email_date: todayStr })
            .eq('id', authUserId);

        if (limitUpdateError) throw new Error("Błąd weryfikacji limitów anty-spam.");
        // --- KONIEC BLOKADY SPAMU ---

        // 1. ZAPIS DO BAZY (Jeśli przepis nie ma jeszcze ID, czyli jest świeżo wygenerowany)
        let recipeId = recipe.id;
        
        if (!recipeId || recipeId === "temporary_saved") {
            const ingredientsStr = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : recipe.ingredients;
            const instructionsStr = Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : recipe.instructions;

            const { data: savedRecipe, error: dbError } = await supabase
                .from('recipes')
                .insert([{
                    author_id: authUserId, // NOWE: Wstrzykujemy UUID
                    author_email: verifiedEmail,
                    family_id: familyId || null, 
                    title: recipe.title,
                    ingredients: ingredientsStr,
                    instructions: instructionsStr,
                    category: recipe.category || 'Inne',
                    // DODANE POLA DOTYCZĄCE PORCJI I KALORII
                    servings: recipe.servings || 2,
                    calories_per_serving: recipe.calories_per_serving || null
                }])
                .select('id')
                .single();

            if (dbError) throw new Error("Błąd zapisu w bazie: " + dbError.message);
            recipeId = savedRecipe.id;
        }

        const htmlTemplate = `
        <div style="font-family: 'Plus Jakarta Sans', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #4A4543; padding: 20px; background-color: #ffffff;">
            <h1 style="color: #C87E5C; border-bottom: 2px solid #FAF6F0; padding-bottom: 10px; font-weight: 800;">${recipe.title}</h1>
            <h3 style="color: #8BA08E;">🛒 Składniki</h3>
            <ul style="background: #FAF6F0; padding: 20px; border-radius: 12px; list-style-type: disc; margin-left: 0; padding-left: 40px; border: 1px solid #E5E0D8;">
                ${recipe.ingredients.map(i => `<li style="margin-bottom: 8px; color: #4A4543;">${i}</li>`).join('')}
            </ul>
            <h3 style="color: #8BA08E;">📋 Instrukcje</h3>
            <ol style="padding-left: 20px; color: #4A4543;">${recipe.instructions.map(i => `<li style="margin-bottom: 12px; line-height: 1.5;">${i}</li>`).join('')}</ol>
            <p style="margin-top: 30px; border-top: 1px dashed #8A8482; padding-top: 15px; font-style: italic; color: #8A8482; text-align: center; font-size: 14px;">
                ${recipe.message || 'Smacznego życzy Twój KiedyObiad.pl!'}
            </p>
        </div>`;

        const { error: mailError } = await resend.emails.send({
            from: 'Family Chef <kuchnia@resend.dev>',
            to: [verifiedEmail],
            subject: `👨‍🍳 Zapisany Przepis: ${recipe.title}`,
            html: htmlTemplate,
        });

        if (mailError) throw new Error("Przepis zapisany, ale błąd wysyłki maila: " + mailError.message);

        return res.status(200).json({ 
            status: "success", 
            message: "Przepis zapisany w bazie i wysłany!", 
            recipeId: recipeId 
        });

    } catch (error) {
        console.error("🔥 SEND & SAVE ERROR:", error.message);
        
        // REFUND: Zwracamy limit przez admina do nowej tabeli
        if (currentEmailCount !== undefined && authUserId) {
            const { createClient } = await import('@supabase/supabase-js');
            const supAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
            await supAdmin.from('users_billing').update({ daily_emails: currentEmailCount }).eq('id', authUserId);
        }

        return res.status(500).json({ status: "error", message: error.message });
    }
}