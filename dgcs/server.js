const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin conectado com sucesso");
} catch (error) {
    console.error("Erro ao inicializar o Firebase:", error.message);
}

const db = admin.firestore();
const client = new MercadoPagoConfig({ accessToken: process.env.ACCESS_TOKEN_MP });

app.post('/process_payment', async (req, res) => {
    try {
        const body = req.body;
        
        const paymentData = {
            transaction_amount: Number(body.transaction_amount),
            token: body.token,
            description: "Ativação de Acesso - DGLean",
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

        if (response.status === 'approved') {
            const userId = body.metadata?.firebase_uid;
            const userEmail = body.metadata?.email_cadastro || body.payer?.email;
            
            const agora = new Date();
            const dataFormatada = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR');
            
            if (userId) {
                // FORÇA A GRAVAÇÃO COMPLETA NO UID EXATO DO USUÁRIO LOGADO
                const userRef = db.collection('usuarios').doc(userId);
                await userRef.set({
                    email: userEmail,
                    nome: "Leandro Mendes Rolim",
                    acesso_liberado: true,
                    statusPagamento: 'aprovado',
                    dataAssinatura: dataFormatada,
                    level: 1,
                    xp: 0,
                    updatedAt: agora
                }, { merge: true });
                
                console.log(`[FIREBASE SUCESSO] Acesso liberado e forçado para o UID: ${userId}`);
            } else {
                console.error("[ERRO CRÍTICO] UID não encontrado no metadata!");
            }
        }

        res.status(200).json({
            status: response.status,
            status_detail: response.status_detail,
            id: response.id
        });
    } catch (error) {
        console.error("Erro detalhado no pagamento:", error);
        res.status(400).json({ 
            error: error.message || 'Erro ao processar o pagamento',
            details: error.cause || 'Verifique os dados do cartão'
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
