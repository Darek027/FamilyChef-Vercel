// WERSJA 4.9.0 - API VERCEL: ATOMOWY ZAPIS I WYSYŁKA (Supabase + Resend)
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { email, recipe } = req.body;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // 1. ZAPIS DO BAZY (Jeśli przepis nie ma jeszcze ID, czyli jest świeżo wygenerowany)
        let recipeId = recipe.id;
        
        if (!recipeId || recipeId === "temporary_saved") {
            const ingredientsStr = Array.isArray(recipe.ingredients) ? recipe.ingredients.join('\n') : recipe.ingredients;
            const instructionsStr = Array.isArray(recipe.instructions) ? recipe.instructions.join('\n') : recipe.instructions;

            const { data: savedRecipe, error: dbError } = await supabase
                .from('recipes')
                .insert([{
                    author_email: email,
                    title: recipe.title,
                    ingredients: ingredientsStr,
                    instructions: instructionsStr,
                    category: recipe.category || 'Inne'
                }])
                .select('id')
                .single();

            if (dbError) throw new Error("Błąd zapisu w bazie: " + dbError.message);
            recipeId = savedRecipe.id;
        }

        // 2. WYSYŁKA MAILA (Szablon Print-Friendly)
        const htmlTemplate = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #334155; padding: 20px;">
            <h1 style="color: #0d9488; border-bottom: 2px solid #ccfbf1; padding-bottom: 10px;">${recipe.title}</h1>
            <h3 style="color: #0d9488;">🛒 Składniki</h3>
            <ul style="background: #f8fafc; padding: 20px; border-radius: 8px; list-style-type: disc;">
                ${recipe.ingredients.map(i => `<li>${i}</li>`).join('')}
            </ul>
            <h3 style="color: #0d9488;">📋 Instrukcje</h3>
            <ol>${recipe.instructions.map(i => `<li style="margin-bottom: 10px;">${i}</li>`).join('')}</ol>
            <p style="margin-top: 30px; border-top: 1px dashed #cbd5e1; padding-top: 10px; font-style: italic;">
                ${recipe.message || 'Smacznego!'}
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
        return res.status(500).json({ status: "error", message: error.message });
    }
}