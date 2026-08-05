export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(200).send('OK');

    try {
        const body = req.body;
        
        if (body && body.status && body.status.toUpperCase() === 'APPROVED') {
            
            const extRef = body.external_reference || "";
            const hexLocal = extRef.split('-')[0]; 
            
            // Volvemos a transformar el Hexadecimal al nombre original del local
            const localName = Buffer.from(hexLocal, 'hex').toString('utf8');

            if (localName) {
                const supabaseUrl = 'https://drpjcmznauposqlhaveo.supabase.co';
                const supabaseKey = 'sb_publishable_xo7-uUQqtWvEWoLGqqlrsg_rxdroLx4';

                // 1. Traemos todo el JSON de ese local de la base de datos
                const getRes = await fetch(`${supabaseUrl}/rest/v1/usuarios?local=eq.${encodeURIComponent(localName)}&select=app_data`, {
                    method: 'GET',
                    headers: {
                        'apikey': supabaseKey,
                        'Authorization': `Bearer ${supabaseKey}`
                    }
                });
                
                const data = await getRes.json();
                
                if (data && data.length > 0) {
                    let appData = data[0].app_data;
                    if (typeof appData === 'string') appData = JSON.parse(appData);

                    // 2. Le sumamos los 30 días (en milisegundos)
                    const treintaDiasMs = 30 * 24 * 60 * 60 * 1000;
                    const ahora = Date.now();
                    
                    // Si el chabón pagó antes de que se le venza, se le suman 30 días a lo que ya tenía. 
                    // Si pagó vencido, se cuentan 30 días desde el momento que pagó.
                    if (appData.expires_at && appData.expires_at > ahora) {
                        appData.expires_at = appData.expires_at + treintaDiasMs;
                    } else {
                        appData.expires_at = ahora + treintaDiasMs;
                    }

                    appData.sub_status = 'PAGADO';

                    // 3. Volvemos a guardar el JSON completo en Supabase
                    await fetch(`${supabaseUrl}/rest/v1/usuarios?local=eq.${encodeURIComponent(localName)}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({ app_data: appData })
                    });
                }
            }
        }

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error en Webhook:', error);
        return res.status(500).json({ success: false });
    }
}

