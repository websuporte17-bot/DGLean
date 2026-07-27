const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// 1. INICIALIZAÇÃO DO FIREBASE ADMIN
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("Firebase Admin conectado com sucesso pelo Render!");
} catch (error) {
    console.error("ERRO: FIREBASE_CREDENTIALS não configurado ou inválido.", error);
}

// 2. INICIALIZAÇÃO DO MERCADO PAGO
const client = new MercadoPagoConfig({ accessToken: process.env.ACCESS_TOKEN_MP });

// 3. ROTA DE PROCESSAMENTO DE PAGAMENTO (COMPATÍVEL COM O BRICK)
app.post('/process_payment', async (req, res) => {
    try {
        const body = req.body;
        
        // Garantindo que os dados obrigatórios venham preenchidos do Brick
        const paymentData = {
            transaction_amount: Number(body.transaction_amount),
            token: body.token,
            description: "Produto: Anúncio de Teste",
            installments: Number(body.installments || 1),
            payment_method_id: body.payment_method_id,
            issuer_id: body.issuer_id ? Number(body.issuer_id) : undefined,
            payer: {
                email: body.payer?.email,
                identification: {
                    type: body.payer?.identification?.type || 'CPF',
                    number: body.payer?.identification?.number
                }
            },
            metadata: body.metadata || {}
        };

        const payment = new Payment(client);
        const response = await payment.create({ body: paymentData });

        res.status(200).json({
            status: response.status,
            status_detail: response.status_detail,
            id: response.id
        });
    } catch (error) {
        console.error("Erro detalhado no pagamento:", error);
        res.status(500).json({ 
            error: error.message || 'Erro interno ao processar o pagamento no servidor.' 
        });
    }
});

// 4. ROTA DE WEBHOOK
app.post('/webhook', async (req, res) => {
    const paymentId = req.query.id || req.body.data?.id;
    
    if (paymentId && db) {
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
    console.log(`Servidor rodando na porta ${PORT}`);
});
