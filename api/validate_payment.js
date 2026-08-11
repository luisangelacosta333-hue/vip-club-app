export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success: false, msg: 'Método no permitido' });

    try {
        const { local, fotoBase64 } = req.body;
        if (!local || !fotoBase64) return res.status(400).json({ success: false, msg: 'Faltan datos.' });

        const openAiKey = process.env.OPENAI_API_KEY;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!openAiKey || !supabaseKey) {
            let faltantes = [];
            if (!openAiKey) faltantes.push("OPENAI_API_KEY");
            if (!supabaseKey) faltantes.push("SUPABASE_SERVICE_ROLE_KEY");
            return res.status(500).json({ success: false, msg: 'Falta en Vercel: ' + faltantes.join(' y ') });
        }

        // Le pasamos la fecha exacta de hoy a la IA para que pueda "quemar" tickets viejos
        const fechaHoy = new Date().toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

        // 1. LA NUEVA ORDEN ESTRICTA (ANTIFRAUDE + LECTURA FLEXIBLE)
        const systemPrompt = `Sos un auditor financiero extremadamente estricto. Analizá este comprobante de transferencia bancaria. 
        Tene en cuenta que la fecha de hoy es: ${fechaHoy}.
        
        Debe cumplir TODAS estas condiciones sin excepción:
        1. El monto transferido debe ser EXACTAMENTE $19.000 (diecinueve mil pesos argentinos).
        2. El destinatario debe ser obligatoriamente: "Luis Angel Acosta" (o variaciones), O el Alias: "noir.elite.ceo", O el CBU: "0110257630025717844115".
        3. ESTADO DE TRANSFERENCIA: Debe ser una transferencia real (Ej: dice "Comprobante de transferencia", "Aprobada", "Exitosa", o tiene un número de "Id Op."). Rechazá categóricamente si dice "Programada", "Pendiente" o "En proceso".
        4. SISTEMA ANTIFRAUDE (QUEMAR TICKET): Revisá la fecha del comprobante. Tiene que ser una fecha muy reciente (de hoy o máximo de las últimas 48 horas). Si la fecha es vieja, rechazalo argumentando: "Comprobante rechazado: El ticket es viejo o ya fue utilizado anteriormente."
        
        Devolveme UNICAMENTE un objeto JSON estricto con este formato: {"aprobado": true, "motivo": "Explicación corta"}.
        Si falta un solo dato o algo es sospechoso, respondé {"aprobado": false, "motivo": "Por qué se rechazó"}.`;

        const openAiPayload = {
            model: "gpt-4o",
            messages: [
                {
                    role: "user",
                    content: [
                        { type: "text", text: systemPrompt },
                        { type: "image_url", image_url: { url: fotoBase64 } }
                    ]
                }
            ],
            response_format: { type: "json_object" },
            max_tokens: 200
        };

        const openAiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${openAiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(openAiPayload)
        });

        const openAiData = await openAiRes.json();
        
        if (!openAiData.choices || !openAiData.choices[0].message) {
            throw new Error("OpenAI no respondió correctamente.");
        }

        const iaDecision = JSON.parse(openAiData.choices[0].message.content);

        if (!iaDecision.aprobado) {
            return res.status(200).json({ success: false, msg: "Ticket Rechazado: " + iaDecision.motivo });
        }

        // 4. SI LA IA APRUEBA, ABRIMOS LA BÓVEDA EN SUPABASE Y DAMOS 30 DÍAS DE RENOVACIÓN
        const supabaseUrl = 'https://drpjcmznauposqlhaveo.supabase.co';
        
        const getRes = await fetch(`${supabaseUrl}/rest/v1/usuarios?local=eq.${encodeURIComponent(local)}&select=app_data`, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
            }
        });
        const getData = await getRes.json();
        let newAppData = { sub_status: 'PREMIUM', expires_at: Date.now() + (30 * 24 * 60 * 60 * 1000) };
        if (getData && getData.length > 0 && getData[0].app_data) {
            const oldData = typeof getData[0].app_data === 'string' ? JSON.parse(getData[0].app_data) : getData[0].app_data;
            if (oldData.whatsapp) newAppData.whatsapp = oldData.whatsapp;
        }

        const updateRes = await fetch(`${supabaseUrl}/rest/v1/usuarios?local=eq.${encodeURIComponent(local)}`, {
            method: 'PATCH',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ app_data: newAppData })
        });

        if (!updateRes.ok) {
            throw new Error("Error al abrir el candado de la base de datos.");
        }

        return res.status(200).json({ success: true, msg: "¡Pago Aprobado y acceso VIP renovado!" });

    } catch (error) {
        return res.status(500).json({ success: false, msg: error.message });
    }
}
