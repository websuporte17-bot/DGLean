const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
app.use(cors());
app.use(express.json());

// Puxa a chave secreta que a gente vai colocar lá no Render
const client = new MercadoPagoConfig({ accessToken: process.env.ACCESS_TOKEN_MP });

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
        res.status(500).json({ error: 'Erro ao processar pagamento' });
    }
});

// A porta que o Render vai usar
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor online na porta ${PORT}!`);
});
