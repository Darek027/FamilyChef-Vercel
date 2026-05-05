// WERSJA 5.2.1 - FIX: Usunięcie zduplikowanych deklaracji zmiennych
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { email, recipe, familyId } = req.body;
    let currentEmailCount; // Deklaracja na zewnątrz, by catch miał do niej dostęp

    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });

        // --- START BLOKADY SPAMU ---
        const { data: user } = await supabase
            .from('users')
            .select('is_premium, daily_emails, last_email_date')
            .eq('email', email)
            .maybeSingle();

        const isPremium = user?.is_premium || false;
        const DAILY_FREE_EMAIL = parseInt(process.env.DAILY_FREE_EMAIL_LIMIT || '5', 10);
        const DAILY_PREMIUM_EMAIL = parseInt(process.env.DAILY_PREMIUM_EMAIL_LIMIT || '30', 10);
        
        const todayStr = new Date().toISOString().split('T')[0];
        const userLastEmail = user?.last_email_date ? new Date(user.last_email_date).toISOString().split('T')[0] : null;
        
        currentEmailCount = user?.daily_emails || 0;
        if (userLastEmail !== todayStr) currentEmailCount = 0;

        if (!isPremium && currentEmailCount >= DAILY_FREE_EMAIL) {
            return res.status(429).json({ status: "error", message: `Wykorzystałeś darmowy limit maili (${DAILY_FREE_EMAIL}).` });
        }
        if (isPremium && currentEmailCount >= DAILY_PREMIUM_EMAIL) {
            return res.status(429).json({ status: "error", message: `Osiągnąłeś limit maili Premium (${DAILY_PREMIUM_EMAIL}).` });
        }

        // CHARGE UPFRONT: Pobieramy "opłatę" przed wywołaniem Resend
        const { error: limitUpdateError } = await supabase
            .from('users')
            .update({ daily_emails: currentEmailCount + 1, last_email_date: todayStr })
            .eq('email', email);

        if (limitUpdateError) throw new Error("Błąd weryfikacji limitów anty-spam.");
        // --- KONIEC BLOKADY SPAMU ---

        // 1. ZAPIS DO BAZY (Jeśli przepis nie ma jeszcze ID, czyli jest świeżo wygenerowany)

        // 1. ZAPIS DO BAZY (Jeśli przepis nie ma jeszcze ID, czyli jest świeżo wygenerowany)
        let recipeId = recipe.id;
        
        if (!recipeId || recipeId === "temporary_saved") {
            const ingredientsStr = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : recipe.ingredients;
            const instructionsStr = Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : recipe.instructions;

            const { data: savedRecipe, error: dbError } = await supabase
                .from('recipes')
                .insert([{
                    author_email: email,
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
            to: [email],
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
        
        // REFUND: Jeśli Resend rzuci błędem, zwracamy limit użytkownikowi
        if (currentEmailCount !== undefined) {
            const { createClient } = await import('@supabase/supabase-js');
            const supAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
            await supAdmin.from('users').update({ daily_emails: currentEmailCount }).eq('email', email);
        }

        return res.status(500).json({ status: "error", message: error.message });
    }
}