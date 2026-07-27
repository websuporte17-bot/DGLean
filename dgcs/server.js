const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// 1. INICIALIZAÇÃO DO FIREBASE ADMIN COM A CHAVE SEGURA DO RENDER
let db;
try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    db = admin.firestore();
    console.log("Firebase Admin conectado com sucesso pelo Render!");
} catch (error) {
    console.error("ERRO: FIREBASE_CREDENTIALS não configurado no Render ou JSON inválido.", error);
}

// 2. INICIALIZAÇÃO DO MERCADO PAGO COM O TOKEN DE SEGURANÇA
const client = new MercadoPagoConfig({ accessToken: process.env.ACCESS_TOKEN_MP });

// 3. ROTA DE PROCESSAMENTO DE PAGAMENTO
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
        console.error("Erro na API do Mercado Pago:", error);
        res.status(500).json({ error: 'Erro ao processar o pagamento' });
    }
});

// 4. ROTA DE WEBHOOK PARA LIBERAÇÃO AUTOMÁTICA DA CONTA
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
                    console.log(`[SUCESSO] Conta liberada automaticamente para o UID: ${uidDoAluno}`);
                }
            }
        } catch (error) {
            console.error("Erro ao processar o Webhook:", error);
        }
    }
    res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor blindado online rodando na porta ${PORT}!`);
});
