// WERSJA 4.6.3 - API VERCEL: WYSYŁKA LISTY ZAKUPÓW (RESEND) - Poprawiona struktura
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { email, listTitle, listArray } = req.body;

    try { // <--- TEGO SŁOWA KLUCZOWEGO BRAKOWAŁO!
    
        // Zaktualizowany szablon HTML listy zakupów (Rebranding)
        // Generowanie grup zakupowych
        let htmlContent = "";
        listArray.forEach(group => {
            htmlContent += `<h3 style="color:#8BA08E; margin-top:25px; border-bottom:2px solid #FAF6F0; padding-bottom:5px;">${group.category}</h3>`;
            htmlContent += `<ul style="list-style-type: none; padding-left: 0;">`;
            group.items.forEach(item => {
                let textStyle = item.checked ? "text-decoration: line-through; color: #8A8482;" : "color: #4A4543; font-weight: 600;";
                let icon = item.checked ? `<span style="color: #8BA08E; margin-right: 4px;">☑</span>` : `<span style="color: #8A8482; margin-right: 4px;">☐</span>`;
                htmlContent += `<li style="margin-bottom: 10px; font-size: 16px; ${textStyle}">${icon} ${item.name}</li>`;
            });
            htmlContent += `</ul>`;
        });

        const htmlTemplate = `
        <div style="font-family: 'Plus Jakarta Sans', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 30px 20px; background-color: #ffffff; color: #4A4543;">
            <h1 style="color: #C87E5C; margin-bottom: 5px; font-weight: 800;">🛒 ${listTitle}</h1>
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
            to: [email],
            subject: `🛒 Twoja Lista: ${listTitle}`,
            html: htmlTemplate,
        });

        if (error) throw error;

        return res.status(200).json({ status: "success", message: "Lista zakupów wysłana na maila!" });

    } catch (error) {
        console.error("🔥 RESEND SHOPPING ERROR:", error);
        return res.status(500).json({ status: "error", message: "Nie udało się wysłać listy." });
    }
}