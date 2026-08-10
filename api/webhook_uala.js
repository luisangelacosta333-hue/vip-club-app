export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(200).send('OK');

    try {
        const body = req.body;
        
        if (body && body.status && body.status.toUpperCase() === 'APPROVED') {
            const extRef = body.external_reference || "";
            const hexLocal = extRef.split('-')[0]; 
            const localName = Buffer.from(hexLocal, 'hex').toString('utf8');

            if (localName) {
                const supabaseUrl = 'https://drpjcmznauposqlhaveo.supabase.co';
                
                // LA LLAVE AHORA ESTÁ ESCONDIDA EN VERCEL
                const supabaseKey = process.env.SUPABASE_SECRET_KEY; 

                if (!supabaseKey) {
                    console.error("Falta la llave secreta en Vercel");
                    return res.status(500).json({ success: false });
                }

                // 1. Buscamos el local
                const getRes = await fetch(`${supabaseUrl}/rest/v1/usuarios?local=eq.${encodeURIComponent(localName)}&select=app_data`, {
                    method: 'GET',
                    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
                });
                
                const usuarios = await getRes.json();
                
                if (usuarios && usuarios.length > 0) {
                    let appDataActual = usuarios[0].app_data || {};
                    if (typeof appDataActual === 'string') { try { appDataActual = JSON.parse(appDataActual); } catch(e) {} }

                    // 2. Sumamos 30 días a partir de HOY
                    appDataActual.expires_at = Date.now() + (30 * 24 * 60 * 60 * 1000);
                    appDataActual.sub_status = 'ACTIVE';

                    // 3. Actualizamos en la base de datos
                    await fetch(`${supabaseUrl}/rest/v1/usuarios?local=eq.${encodeURIComponent(localName)}`, {
                        method: 'PATCH',
                        headers: {
                            'apikey': supabaseKey,
                            'Authorization': `Bearer ${supabaseKey}`,
                            'Content-Type': 'application/json',
                            'Prefer': 'return=minimal'
                        },
                        body: JSON.stringify({ app_data: appDataActual })
                    });
                }
            }
        }
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error Webhook:', error);
        return res.status(500).json({ success: false });
    }
}
