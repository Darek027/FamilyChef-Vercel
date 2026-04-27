// WERSJA 4.6.0 - API VERCEL: WYSYŁKA LISTY ZAKUPÓW (RESEND)
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ status: "error" });

    const { email, listTitle, listArray } = req.body;

    try {
        // Generowanie grup zakupowych
        let htmlContent = "";
        listArray.forEach(group => {
            htmlContent += `<h3 style="color:#0d9488; margin-top:25px; border-bottom:1px solid #ccfbf1; padding-bottom:5px;">${group.category}</h3>`;
            htmlContent += `<ul style="list-style-type: none; padding-left: 0;">`;
            group.items.forEach(item => {
                let textStyle = item.checked ? "text-decoration: line-through; color: #94a3b8;" : "color: #334155;";
                let icon = item.checked ? "☑" : "☐";
                htmlContent += `<li style="margin-bottom: 10px; font-size: 16px; ${textStyle}">${icon} ${item.name}</li>`;
            });
            htmlContent += `</ul>`;
        });

        const htmlTemplate = `
        <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #0f172a; margin-bottom: 5px;">🛒 ${listTitle}</h1>
            <p style="color:#64748b; font-size: 14px; margin-bottom: 30px;">Zaznaczone przedmioty zostały skreślone.</p>
            ${htmlContent}
            <div style="margin-top: 40px; padding-top: 20px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 12px; color: #94a3b8;">
                Wygenerowano przez <strong>Family Chef</strong>
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