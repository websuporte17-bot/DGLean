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

        // SE O PAGAMENTO FOR APROVADO, FORÇA A GRAVAÇÃO IMEDIATA ANTES DE RESPONDER
        if (response.status === 'approved') {
            const userId = body.metadata?.firebase_uid || body.metadata?.user_id || body.user_id;
            const userEmail = body.payer?.email;
            
            const agora = new Date();
            const dataFormatada = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR');
            
            const dadosLiberacao = {
                acesso_liberado: true,
                statusPagamento: 'aprovado',
                dataAssinatura: dataFormatada,
                updatedAt: agora
            };

            let salvoNoBanco = false;

            // 1. Tenta salvar diretamente pelo ID do usuário (UID do Firebase Auth)
            if (userId) {
                try {
                    await db.collection('usuarios').doc(userId).set(dadosLiberacao, { merge: true });
                    salvoNoBanco = true;
                    console.log(`[SERVIDOR] Sucesso ao gravar true no UID: ${userId}`);
                } catch (e) {
                    console.error("Erro ao gravar por UID:", e);
                }
            }

            // 2. Se não salvou por UID, tenta buscar e atualizar por e-mail
            if (!salvoNoBanco && userEmail) {
                try {
                    const snapshot = await db.collection('usuarios').where('email', '==', userEmail).get();
                    if (!snapshot.empty) {
                        const batch = db.batch();
                        snapshot.docs.forEach((doc) => {
                            batch.set(doc.ref, dadosLiberacao, { merge: true });
                        });
                        await batch.commit();
                        salvoNoBanco = true;
                        console.log(`[SERVIDOR] Sucesso ao gravar true por E-mail: ${userEmail}`);
                    }
                } catch (e) {
                    console.error("Erro ao gravar por e-mail:", e);
                }
            }

            // 3. Se por algum motivo o usuário não existir na coleção usuarios, cria um documento novo
            if (!salvoNoBanco && userEmail) {
                try {
                    await db.collection('usuarios').add({
                        email: userEmail,
                        ...dadosLiberacao
                    });
                    salvoNoBanco = true;
                    console.log(`[SERVIDOR] Criado novo registro com true para: ${userEmail}`);
                } catch (e) {
                    console.error("Erro crítico ao criar documento de emergência:", e);
                }
            }
        }

        // Responde para o front-end apenas após garantir o fluxo
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
