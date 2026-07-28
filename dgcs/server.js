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

        // SE O PAGAMENTO FOI APROVADO, A REGRA É CLARA: GARANTE O TRUE NO BANCO A QUALQUER CUSTO
        if (response.status === 'approved') {
            const userId = body.metadata?.firebase_uid || body.metadata?.user_id || body.user_id;
            const userEmail = body.payer?.email;
            
            const agora = new Date();
            const dataFormatada = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR');
            
            const dadosLiberacao = {
                acesso_liberado: true, // FOI APROVADO? ENTÃO É TRUE SEM CHORO
                statusPagamento: 'aprovado',
                dataAssinatura: dataFormatada,
                updatedAt: agora
            };

            let atualizado = false;

            // Tenta atualizar pelo ID exato do usuário
            if (userId) {
                try {
                    const userRef = db.collection('usuarios').doc(userId);
                    await userRef.set(dadosLiberacao, { merge: true });
                    atualizado = true;
                    console.log(`[GARANTIDO] Acesso true gravado via UID: ${userId}`);
                } catch (err) {
                    console.error("Erro ao gravar por UID, tentando por e-mail...", err);
                }
            }

            // Se não atualizou por ID ou se o ID não veio, força pelo e-mail do pagamento
            if (!atualizado && userEmail) {
                try {
                    const snapshot = await db.collection('usuarios').where('email', '==', userEmail).get();
                    if (!snapshot.empty) {
                        const batch = db.batch();
                        snapshot.docs.forEach((doc) => {
                            batch.set(doc.ref, dadosLiberacao, { merge: true });
                        });
                        await batch.commit();
                        atualizado = true;
                        console.log(`[GARANTIDO] Acesso true gravado via E-mail: ${userEmail}`);
                    }
                } catch (err) {
                    console.error("Erro ao gravar por e-mail:", err);
                }
            }

            // ÚLTIMA LINHA DE DEFESA: Se por milagre o usuário não existir no Firestore, cria ele com true na hora para não perder a venda
            if (!atualizado && userEmail) {
                try {
                    await db.collection('usuarios').add({
                        email: userEmail,
                        ...dadosLiberacao
                    });
                    console.log(`[EMERGÊNCIA] Novo documento criado com acesso true para: ${userEmail}`);
                } catch (err) {
                    console.error("Erro crítico na gravação de emergência:", err);
                }
            }
        }

        // Retorna o status real para o front-end comemorar e redirecionar
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
