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

        // 1. LA ORDEN ESTRICTA PARA OPENAI (AJUSTADA A $19.000)
        const systemPrompt = `Sos un auditor financiero extremadamente estricto. Analizá este comprobante de transferencia bancaria.
        Debe cumplir TODAS estas condiciones sin excepción:
        1. El monto transferido debe ser EXACTAMENTE $19.000 (diecinueve mil pesos argentinos).
        2. El destinatario debe ser obligatoriamente: "Luis Ángel Acosta", O el Alias: "noir.elite.ceo", O el CBU: "0110257630025717844115".
        3. El estado de la transferencia debe ser "Aprobada", "Exitosa" o similar. No se aceptan transferencias programadas ni pendientes.
        
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
        
        // A. Rescatamos el dato de WhatsApp por si acaso no borrarlo
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

        // B. Escribimos la aprobación oficial
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

