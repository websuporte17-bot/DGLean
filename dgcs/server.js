const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// 1. INICIALIZAÇÃO DO FIREBASE ADMIN
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

// 2. INICIALIZAÇÃO DO MERCADO PAGO (SDK V2)
const client = new MercadoPagoConfig({ accessToken: process.env.ACCESS_TOKEN_MP });

// 3. ROTA DE PROCESSAMENTO E ATIVAÇÃO AUTOMÁTICA
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

        // SE O PAGAMENTO FOR APROVADO, ATIVA O PLANO NO BANCO AUTOMATICAMENTE
        if (response.status === 'approved') {
            const userEmail = body.payer?.email;
            const userId = body.metadata?.user_id || body.user_id;
            
            try {
                const usersRef = db.collection('users');
                
                if (userId) {
                    // Atualiza direto pelo ID se o front mandou
                    await usersRef.doc(userId).set({
                        plano: 'ativo',
                        statusPagamento: 'aprovado',
                        updatedAt: new Date()
                    }, { merge: true });
                    console.log(`Plano ativado pelo ID: ${userId}`);
                } else if (userEmail) {
                    // Se não tiver o ID, busca e atualiza pelo e-mail
                    const snapshot = await usersRef.where('email', '==', userEmail).get();
                    if (!snapshot.empty) {
                        const batch = db.batch();
                        snapshot.docs.forEach((doc) => {
                            batch.update(doc.ref, {
                                plano: 'ativo',
                                statusPagamento: 'aprovado',
                                updatedAt: new Date()
                            });
                        });
                        await batch.commit();
                        console.log(`Plano ativado pelo e-mail: ${userEmail}`);
                    }
                }
            } catch (dbError) {
                console.error("Erro ao atualizar o plano automaticamente:", dbError);
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
