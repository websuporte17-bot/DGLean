const express = require('express');
const cors = require('cors');
const mercadopago = require('mercadopago');
const admin = require('firebase-admin');

const app = express();
// Allow CORS from a configured origin or fallback to all (for debugging set ALLOWED_ORIGIN)
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: allowedOrigin }));
app.use(express.json());

let db;
// Initialize Firebase Admin with service account JSON from env
try {
  if (!process.env.FIREBASE_CREDENTIALS) throw new Error('FIREBASE_CREDENTIALS not set');
  const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  db = admin.firestore();
  console.log('Firebase Admin conectado com sucesso');
} catch (error) {
  console.error('ERRO: FIREBASE_CREDENTIALS não configurado ou JSON inválido.', error);
}

// Configure MercadoPago (expects ACCESS_TOKEN_MP in env)
if (!process.env.ACCESS_TOKEN_MP) {
  console.warn('AVISO: ACCESS_TOKEN_MP não configurado. Pagamentos não funcionarão.');
} else {
  mercadopago.configure({ access_token: process.env.ACCESS_TOKEN_MP });
}

// Health endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Helper to safely reply with JSON
function safeJson(res, status, payload) {
  res.status(status).json(payload);
}

// POST /process_payment
app.post('/process_payment', async (req, res) => {
  try {
    const paymentData = req.body;
    console.log('[process_payment] request body:', JSON.stringify(paymentData));

    if (!process.env.ACCESS_TOKEN_MP) {
      return safeJson(res, 500, { error: 'ACCESS_TOKEN_MP não configurado no servidor' });
    }

    // Basic validation: Mercado Pago expects transaction_amount or additional fields depending on integration
    if (!paymentData || (typeof paymentData !== 'object')) {
      return safeJson(res, 400, { error: 'Payload inválido' });
    }

    // Create payment via SDK
    const mpResponse = await mercadopago.payment.create(paymentData);
    // mpResponse may contain .body (SDK v2) or be the body itself
    const body = mpResponse?.body || mpResponse;
    console.log('[process_payment] mp response:', body);

    // Return consistent JSON to the frontend
    return safeJson(res, 200, body);
  } catch (error) {
    console.error('[process_payment] erro:', error);
    // Do not leak sensitive data in production responses
    const safeMessage = error?.response?.body || error?.message || 'Erro ao processar o pagamento';
    return safeJson(res, 500, { error: safeMessage });
  }
});

// POST /webhook
app.post('/webhook', async (req, res) => {
  // Mercado Pago may send notifications with id in query or body.data.id
  const paymentId = req.query.id || req.body?.data?.id || req.body?.id;

  if (!paymentId) {
    console.warn('[webhook] recebido sem paymentId');
    return res.status(200).send('OK');
  }

  try {
    if (!process.env.ACCESS_TOKEN_MP) {
      console.warn('[webhook] ACCESS_TOKEN_MP não configurado, não é possível verificar o pagamento');
      return res.status(200).send('OK');
    }

    // Always fetch payment status from Mercado Pago API to avoid trusting client data
    const mpGet = await mercadopago.payment.get(paymentId);
    const paymentInfo = mpGet?.body || mpGet;
    console.log('[webhook] paymentInfo:', paymentInfo);

    if (paymentInfo && paymentInfo.status === 'approved') {
      const uid = paymentInfo.metadata?.firebase_uid;
      if (uid && db) {
        try {
          // Use set with merge to avoid failing if the document does not exist
          await db.collection('usuarios').doc(uid).set({ acesso_liberado: true, pago: true }, { merge: true });
          console.log(`[SUCESSO] Conta liberada automaticamente para o UID: ${uid}`);
        } catch (err) {
          console.error('[webhook] erro ao atualizar Firestore:', err);
        }
      } else {
        console.warn('[webhook] UID não encontrado em metadata ou Firestore não inicializado');
      }
    }
  } catch (error) {
    console.error('[webhook] erro ao processar webhook:', error);
  }

  // Always reply 200 quickly to acknowledge receipt
  return res.status(200).send('OK');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
