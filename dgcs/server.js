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

// 3. ROTA DE PROCESSAMENTO E ATIVAÇÃO AUTOMÁTICA DO ACESSO
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

        // SE O PAGAMENTO FOR APROVADO, LIBERA O ACESSO IMEDIATAMENTE NO FIREBASE
        if (response.status === 'approved') {
            const userEmail = body.payer?.email;
            // Captura o ID corretamente usando firebase_uid ou user_id
            const userId = body.metadata?.firebase_uid || body.metadata?.user_id || body.user_id;
            
            const updateData = {
                acesso_liberado: true, // Campo exigido pela sua app.html
                plano: 'ativo',
                statusPagamento: 'aprovado',
                updatedAt: new Date()
            };

            const possibleCollections = ['usuarios', 'users', 'assinaturas', 'clients'];

            for (const colName of possibleCollections) {
                try {
                    const colRef = db.collection(colName);
                    
                    // Se tivermos o ID exato do usuário, atualiza direto
                    if (userId) {
                        const docRef = colRef.doc(userId);
                        const docSnap = await docRef.get();
                        if (docSnap.exists) {
                            await docRef.set(updateData, { merge: true });
                            console.log(`Acesso liberado na collection '${colName}' via ID: ${userId}`);
                        }
                    }

                    // Se tivermos o e-mail, busca e atualiza todos os correspondentes
                    if (userEmail) {
                        const snapshot = await colRef.where('email', '==', userEmail).get();
                        if (!snapshot.empty) {
                            const batch = db.batch();
                            snapshot.docs.forEach((doc) => {
                                batch.set(doc.ref, updateData, { merge: true });
                            });
                            await batch.commit();
                            console.log(`Acesso liberado na collection '${colName}' via e-mail: ${userEmail}`);
                        }
                    }
                } catch (err) {
                    // Ignora se a coleção não existir e prossegue
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
