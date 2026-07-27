const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// INICIALIZA O FIREBASE ADMIN
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS || '{}');
if (Object.keys(serviceAccount).length > 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

// INICIALIZA O MERCADO PAGO
const client = new MercadoPagoConfig({ accessToken: process.env.ACCESS_TOKEN_MP });

// ROTA DE PAGAMENTO
app.post('/process_payment', async (req, res) => {
    const payment = new Payment(client);
    try {
        const response = await payment.create({ body: req.body });
        res.json({
            status: response.status,
            status_detail: response.status_detail,
            id: response.id
        });
    } catch (error) {
        console.error("Erro na API do MP:", error);
        res.status(500).json({ error: 'Erro ao processar' });
    }
});

// ROTA DO WEBHOOK (LIBERAÇÃO AUTOMÁTICA)
app.post('/webhook', async (req, res) => {
    const paymentId = req.query.id || req.body.data?.id;
    
    if (paymentId && Object.keys(serviceAccount).length > 0) {
        try {
            const payment = new Payment(client);
            const paymentInfo = await payment.get({ id: paymentId });
            
            if (paymentInfo.status === 'approved') {
                const uidDoAluno = paymentInfo.metadata?.firebase_uid;
                
                if (uidDoAluno) {
                    await db.collection('usuarios').doc(uidDoAluno).update({
                        acesso_liberado: true,
                        pago: true
                    });
                    console.log(`Acesso liberado: UID ${uidDoAluno}`);
                }
            }
        } catch (error) {
            console.error("Erro no Webhook:", error);
        }
    }
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}!`);
});
