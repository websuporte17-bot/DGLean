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
            // PEGA EXATAMENTE O UID QUE VEIO DO FRONT-END (DO USUÁRIO LOGADO)
            const userId = body.metadata?.firebase_uid || body.metadata?.user_id || body.user_id;
            
            const agora = new Date();
            const dataFormatada = agora.toLocaleDateString('pt-BR') + ' às ' + agora.toLocaleTimeString('pt-BR');
            
            const dadosLiberacao = {
                acesso_liberado: true,
                statusPagamento: 'aprovado',
                dataAssinatura: dataFormatada,
                updatedAt: agora
            };

            let atualizado = false;

            // 1. PRIORIDADE MÁXIMA: Atualiza direto pelo UID exato do usuário logado
            if (userId) {
                try {
                    const userRef = db.collection('usuarios').doc(userId);
                    const docSnap = await userRef.get();
                    
                    if (docSnap.exists) {
                        await userRef.set(dadosLiberacao, { merge: true });
                        atualizado = true;
                        console.log(`[SUCESSO] Acesso liberado pelo UID exato do login: ${userId}`);
                    }
                } catch (err) {
                    console.error("Erro ao atualizar por UID:", err);
                }
            }

            // 2. SE NÃO ACHOU POR UID, BUSCA PELO E-MAIL CADASTRADO NO METADATA (SE ENVIADO)
            const userEmailCadastro = body.metadata?.email_cadastro;
            if (!atualizado && userEmailCadastro) {
                try {
                    const querySnapshot = await db.collection('usuarios').where('email', '==', userEmailCadastro).get();
                    if (!querySnapshot.empty) {
                        querySnapshot.forEach(async (docSnap) => {
                            await docSnap.ref.set(dadosLiberacao, { merge: true });
                        });
                        atualizado = true;
                        console.log(`[SUCESSO] Acesso liberado pelo e-mail de cadastro: ${userEmailCadastro}`);
                    }
                } catch (err) {
                    console.error("Erro ao atualizar pelo e-mail de cadastro:", err);
                }
            }

            // 3. ÚLTIMA SALVAÇÃO: Se o documento não existir, cria usando o UID do login para nunca falhar
            if (!atualizado && userId) {
                try {
                    await db.collection('usuarios').doc(userId).set({
                        ...dadosLiberacao,
                        criadoPorEmergencia: true
                    }, { merge: true });
                    console.log(`[EMERGÊNCIA] Documento criado para o UID do login: ${userId}`);
                } catch (err) {
                    console.error("Erro crítico ao criar documento de emergência:", err);
                }
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
