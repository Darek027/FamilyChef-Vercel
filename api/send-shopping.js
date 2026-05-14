// WERSJA 4.6.3 - API VERCEL: WYSYŁKA LISTY ZAKUPÓW (RESEND) - Poprawiona struktura
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// WERSJA 5.3.0 - ZERO TRUST SHOPPING LIST SENDER
export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { listTitle, listArray } = req.body; // Ignorujemy email
    let currentEmailCount; 
    let verifiedEmail; // Deklaracja poza try do obsługi w catch
    let authUserId; // Zmienna dla UUID limitów

    // FUNKCJA SANITIZUJĄCA - Twarda ochrona przed atakiem XSS
    const escapeHTML = (str) => {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, (match) => {
            const escapeMap = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
            return escapeMap[match];
        });
    };

    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ status: "error", message: "Brak dostępu." });

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: authHeader } }
        });
        const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

        // KRYPTOGRAFICZNA WERYFIKACJA TOŻSAMOŚCI
        const { data: { user: authUser }, error: authError } = await supabase.auth.getUser();
        if (authError || !authUser) return res.status(401).json({ status: "error", message: "Nieważny token sesji." });
        
        verifiedEmail = authUser.email;
        authUserId = authUser.id;

        // --- START BLOKADY SPAMU ---
        const { data: billing } = await supabaseAdmin.from('users_billing').select('*').eq('id', authUserId).maybeSingle();

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

        const { error: limitUpdateError } = await supabaseAdmin.from('users_billing')
            .update({ daily_emails: currentEmailCount + 1, last_email_date: todayStr })
            .eq('id', authUserId);

        if (limitUpdateError) throw new Error("Błąd weryfikacji limitów anty-spam.");
        // --- KONIEC BLOKADY SPAMU ---
    
        // SANITIZACJA TYTUŁU
        const safeListTitle = escapeHTML(listTitle);

        // Zaktualizowany szablon HTML listy zakupów (Rebranding) + SANITIZACJA DANYCH
        let htmlContent = "";
        listArray.forEach(group => {
            const safeCategory = escapeHTML(group.category);
            htmlContent += `<h3 style="color:#8BA08E; margin-top:25px; border-bottom:2px solid #FAF6F0; padding-bottom:5px;">${safeCategory}</h3>`;
            htmlContent += `<ul style="list-style-type: none; padding-left: 0;">`;
            group.items.forEach(item => {
                const safeItemName = escapeHTML(item.name);
                let textStyle = item.checked ? "text-decoration: line-through; color: #8A8482;" : "color: #4A4543; font-weight: 600;";
                let icon = item.checked ? `<span style="color: #8BA08E; margin-right: 4px;">☑</span>` : `<span style="color: #8A8482; margin-right: 4px;">☐</span>`;
                htmlContent += `<li style="margin-bottom: 10px; font-size: 16px; ${textStyle}">${icon} ${safeItemName}</li>`;
            });
            htmlContent += `</ul>`;
        });

        const htmlTemplate = `
        <div style="font-family: 'Plus Jakarta Sans', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px 20px; background-color: #ffffff; color: #4A4543;">
            <h1 style="color: #C87E5C; margin-bottom: 5px; font-weight: 800;">🛒 ${safeListTitle}</h1>
            <p style="color:#8A8482; font-size: 14px; margin-bottom: 30px;">Zaznaczone przedmioty zostały skreślone w koszyku.</p>
            
            <div style="background: #FAF6F0; padding: 20px; border-radius: 12px; border: 1px solid #E5E0D8;">
                ${htmlContent}
            </div>

            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #8A8482; text-align: center; font-size: 12px; color: #8A8482;">
                Wygenerowano przez <strong>KiedyObiad.pl</strong>
            </div>
        </div>
        `;

        const { data, error } = await resend.emails.send({
            from: 'Family Chef Zakupy <kuchnia@resend.dev>',
            to: [verifiedEmail],
            subject: `🛒 Twoja Lista: ${safeListTitle}`,
            html: htmlTemplate,
        });

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Lista zakupów wysłana na maila!" });

    } catch (error) {
        console.error("🔥 RESEND SHOPPING ERROR:", error);
        
        // REFUND LIMITU w tabeli bilingowej
        if (currentEmailCount !== undefined && authUserId) {
            const { createClient } = await import('@supabase/supabase-js');
            const supAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
            await supAdmin.from('users_billing').update({ daily_emails: currentEmailCount }).eq('id', authUserId);
        }

        return res.status(500).json({ status: "error", message: "Nie udało się wysłać listy." });
    }
}