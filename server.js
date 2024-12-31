const express = require("express");
const bodyParser = require("body-parser");
const twilio = require("twilio");
const dotenv = require("dotenv");
const axios = require("axios");

dotenv.config();

const app = express();

// Configuração do Body Parser para o Twilio
app.use(bodyParser.urlencoded({ extended: false }));

// Configuração da porta
const PORT = process.env.PORT || 3000;

// Configuração do Twilio
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Rota principal para chamadas do Twilio
app.post("/webhook/twilio-calls", async (req, res) => {
  const { From, To } = req.body;

  console.log(`Chamada recebida de: ${From}, para: ${To}`);

  res.set("Content-Type", "text/xml");
  res.send(`
    <Response>
      <Say voice="alice">Olá! Obrigado por ligar. Por favor, diga sua mensagem após o sinal.</Say>
      <Pause length="2" />
      <Gather input="speech" action="/process-input" method="POST">
        <Say>Estou ouvindo...</Say>
      </Gather>
    </Response>
  `);
});

// Rota para processar a entrada do usuário e utilizar a API Realtime da OpenAI
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
    // Enviar o texto para a API de Realtime da OpenAI
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-4",
        messages: [
          { role: "system", content: "Você é um assistente de atendimento telefônico." },
          { role: "user", content: SpeechResult },
        ],
        stream: true,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        responseType: "stream",
      }
    );

    let chatResponse = "";

    // Processar a resposta em tempo real
    response.data.on("data", (chunk) => {
      const lines = chunk.toString().split("\n").filter((line) => line.trim() !== "");
      for (const line of lines) {
        const parsed = JSON.parse(line.replace(/^data: /, ""));
        if (parsed.choices && parsed.choices[0].delta && parsed.choices[0].delta.content) {
          chatResponse += parsed.choices[0].delta.content;
        }
      }
    });

    response.data.on("end", () => {
      console.log(`Resposta da OpenAI: ${chatResponse}`);

      // Responder ao Twilio com a mensagem completa
      res.set("Content-Type", "text/xml");
      res.send(`
        <Response>
          <Say voice="alice">${chatResponse}</Say>
          <Hangup />
        </Response>
      `);
    });

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

// Rota para iniciar chamadas de teste com o Dev Phone
app.post("/dev-phone/call", async (req, res) => {
  const to = req.body.to || process.env.DEV_PHONE_NUMBER;

  try {
    const call = await client.calls.create({
      url: `${process.env.BASE_URL}/webhook/twilio-calls`, // URL do webhook
      to, // Número do Dev Phone
      from: process.env.TWILIO_PHONE_NUMBER, // Número Twilio configurado
    });

    console.log(`Chamada de teste iniciada: Call SID ${call.sid}`);
    res.json({ message: "Chamada de teste iniciada com sucesso.", callSid: call.sid });
  } catch (error) {
    console.error("Erro ao iniciar chamada de teste:", error);
    res.status(500).json({ error: "Erro ao iniciar chamada de teste." });
  }
});

// Rota padrão para testar o servidor
app.get("/", (req, res) => {
  res.send("Servidor está rodando! Configure o Dev Phone para testar chamadas.");
});

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log("Pronto para integração com o Twilio Dev Phone.");
});
