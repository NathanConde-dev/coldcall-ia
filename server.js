const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const dotenv = require("dotenv");
const axios = require("axios");

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = 3000;

// Configurar o body-parser para receber dados do Twilio
app.use(bodyParser.urlencoded({ extended: false }));

// Configurar cliente Twilio
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Rota para receber chamadas Twilio
app.post("/webhook/twilio-calls", (req, res) => {
    const { From, To } = req.body;

    console.log(`Chamada recebida de: ${From}, para: ${To}`);

    // Responder à chamada com TwiML (Twilio Markup Language)
    res.set("Content-Type", "text/xml");
    res.send(`
        <Response>
            <Say voice="alice">Olá, obrigado por ligar. Como posso ajudar?</Say>
            <Pause length="2" />
            <Gather input="speech" action="/process-input" method="POST">
                <Say>Por favor, diga sua mensagem após o sinal.</Say>
            </Gather>
        </Response>
    `);
});

// Rota para processar entrada do usuário
app.post("/process-input", async (req, res) => {
    const { SpeechResult } = req.body;

    if (!SpeechResult || SpeechResult.trim() === "") {
        console.log("Nenhuma mensagem foi capturada.");
        res.set("Content-Type", "text/xml");
        res.send(`
            <Response>
                <Say voice="alice">Desculpe, não consegui entender. Por favor, tente novamente.</Say>
                <Hangup />
            </Response>
        `);
        return;
    }

    console.log(`Mensagem recebida: ${SpeechResult}`);

    try {
        // Enviar mensagem para o ChatGPT
        const response = await axios.post(
            "https://api.openai.com/v1/chat/completions",
            {
                model: "gpt-3.5-turbo",
                messages: [{ role: "user", content: SpeechResult }],
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
                },
            }
        );

        const chatResponse = response.data.choices[0].message.content;

        console.log(`Resposta do ChatGPT: ${chatResponse}`);

        // Responder ao Twilio com a mensagem do ChatGPT
        res.set("Content-Type", "text/xml");
        res.send(`
            <Response>
                <Say voice="alice">${chatResponse}</Say>
                <Hangup />
            </Response>
        `);
    } catch (error) {
        console.error("Erro ao processar mensagem:", error);

        res.set("Content-Type", "text/xml");
        res.send(`
            <Response>
                <Say voice="alice">Desculpe, ocorreu um erro ao processar sua solicitação. Tente novamente mais tarde.</Say>
                <Hangup />
            </Response>
        `);
    }
});

// Rota para iniciar uma chamada de teste
app.post("/make-call", async (req, res) => {
    const { to } = req.body;

    try {
        const call = await client.calls.create({
            url: "http://your-server-url/webhook/twilio-calls",
            to,
            from: process.env.TWILIO_PHONE_NUMBER,
        });

        res.json({ message: "Chamada iniciada", callSid: call.sid });
    } catch (error) {
        console.error("Erro ao fazer chamada:", error);
        res.status(500).json({ error: "Erro ao fazer chamada" });
    }
});

// Iniciar o servidor
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
