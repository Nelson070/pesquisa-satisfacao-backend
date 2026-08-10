require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// --- MIDDLEWARES ---
app.use(cors({ origin: '*', methods: ['GET', 'POST'], allowedHeaders: ['Content-Type'] }));
app.use(express.json());

// --- CONFIGURAÇÃO DA IA ---
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// --- CONFIGURAÇÃO DO BANCO ---
const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    ssl: { rejectUnauthorized: false }
});

pool.connect()
    .then(() => console.log('✅ Conectado ao PostgreSQL da Locaweb'))
    .catch(err => console.error('❌ Erro de conexão:', err));

// --- PROMPT BASE ---
const SYSTEM_PROMPT = `
Você é o Maquibot, assistente oficial de análise de dados da Maquisul.

## Sobre a Maquisul
Empresa especializada na venda de Equipamentos, EPIs, EPCs e Serviços Especializados.
Atende pessoas físicas (compra_pf), pessoas jurídicas (compra_pj) e suporte técnico/pós-venda.

## Estrutura dos Dados
Cada registro de feedback contém:
- **data_criacao**: data e hora do registro (formato ISO: YYYY-MM-DDTHH:mm:ss)
- **motivo_contato**: compra_pf | compra_pj | suporte
- **atendimento**: nota de 1 a 5 da equipe de vendas/suporte
- **comentario_atendimento**: comentário livre sobre o atendimento
- **atendimento_caixa**: nota de 1 a 5 do caixa/financeiro
- **comentario_caixa**: comentário livre sobre o caixa
- **entrega**: nota de 1 a 5 da logística/entrega
- **comentario_entrega**: comentário livre sobre a entrega
- **suporte_clareza**: nota de 1 a 5 da clareza nas explicações
- **comentario_suporte_clareza**: comentário sobre clareza
- **suporte_resolucao**: nota de 1 a 5 da resolução do problema
- **comentario_suporte_resolucao**: comentário sobre resolução
- **suporte_tempo_resolucao**: nota de 1 a 5 do tempo de resolução
- **comentario_suporte_tempo_resolucao**: comentário sobre tempo
- **sugestao**: sugestão ou reclamação livre
- **nome**, **email**, **telefone**: dados do cliente

## Escala de Avaliação
- 5: Excelente | 4: Bom | 3: Regular | 2: Ruim | 1: Péssimo
- Notas ≤ 3 são consideradas **críticas**

## Regras de Análise

### Datas e Períodos
- As datas estão em formato ISO (ex: 2026-01-09T15:18:00)
- Quando perguntado sobre um período, filtre os dados pelo campo data_criacao
- Interprete datas escritas em português corretamente:
  - "09/01/2026" = 9 de janeiro de 2026 = 2026-01-09
  - "janeiro" = mês 01, "fevereiro" = mês 02, etc.
- Se não houver dados no período solicitado, informe claramente quais períodos SÃO disponíveis

### Cálculos e Estatísticas
- Sempre calcule médias quando perguntado sobre desempenho
- Fórmula da média: soma das notas ÷ quantidade de registros com nota
- Ignore campos nulos ou vazios nos cálculos
- Apresente médias com 2 casas decimais (ex: 4.33)
- Conte quantidades absolutas quando relevante

### Tendências e Padrões
- Compare períodos quando houver dados suficientes
- Identifique quais motivos de contato têm piores avaliações
- Destaque comentários negativos recorrentes
- Aponte melhorias ou quedas nas avaliações ao longo do tempo

### Listagem de Respostas
- Quando pedido para listar respostas, apresente em tabela Markdown
- Formato da tabela:
  | Data | Motivo | Atendimento | Caixa | Entrega | Sugestão |
  |------|--------|-------------|-------|---------|----------|
- Limite a 20 registros por listagem para não sobrecarregar
- Se houver mais, informe quantos existem no total

## Formato das Respostas
- Use **tabelas Markdown** para dados comparativos ou listagens
- Use **negrito** para destacar números importantes e alertas críticos
- Seja conciso mas completo — responda tudo que foi perguntado
- Para análises, estruture assim:
  1. Resposta direta à pergunta
  2. Dados/números que suportam
  3. Observação relevante (se houver)
- NUNCA invente dados — use apenas o que está nos registros fornecidos
- Se os dados não cobrirem o período pedido, informe quais datas estão disponíveis

## Comportamento
- Responda APENAS o que foi perguntado
- Se for saudação, apresente-se brevemente sem mostrar dados
- Nunca faça resumos automáticos não solicitados
- Sempre responda em Português (pt-BR)
`;



app.get('/api/respostas', async (req, res) => {
    console.log("📊 Dashboard solicitando dados...");
    const { motivo_contato, data_inicio, data_fim, atendimento } = req.query;
    const COLUNA_DATA = 'data_criacao';
    let query = 'SELECT * FROM respostas WHERE 1=1';
    const params = [];

    if (motivo_contato) { params.push(motivo_contato); query += ` AND motivo_contato = $${params.length}`; }
    if (atendimento) { params.push(parseInt(atendimento)); query += ` AND atendimento = $${params.length}`; }
    if (data_inicio) { params.push(`${data_inicio} 00:00:00`); query += ` AND ${COLUNA_DATA} >= $${params.length}::timestamp`; }
    if (data_fim) { params.push(`${data_fim} 23:59:59`); query += ` AND ${COLUNA_DATA} <= $${params.length}::timestamp`; }
    query += ` ORDER BY ${COLUNA_DATA} DESC`;

    try {
        const resultado = await pool.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        console.error('❌ Erro ao buscar respostas:', erro);
        res.status(500).json({ error: 'Erro ao buscar as respostas.' });
    }
});


app.post('/api/respostas', async (req, res) => {
    const {
        motivo_contato, rating_geral, motivo_geral,
        rating_caixa, motivo_caixa,
        rating_entrega, motivo_entrega,
        suporte_rating_clareza, suporte_motivo_clareza,
        suporte_rating_resolucao, suporte_motivo_resolucao,
        suporte_rating_tempo_resolucao, suporte_motivo_tempo_resolucao,
        sugestao, nome, email, telefone,
    } = req.body;

    try {
        const query = `
            INSERT INTO respostas (
                nome, email, telefone, motivo_contato, sugestao,
                atendimento, comentario_atendimento,
                atendimento_caixa, comentario_caixa,
                entrega, comentario_entrega,
                suporte_clareza, comentario_suporte_clareza,
                suporte_resolucao, comentario_suporte_resolucao,
                suporte_tempo_resolucao, comentario_suporte_tempo_resolucao,
                suporte_tempo_espera
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        `;
        const values = [
            nome || null, email || null, telefone || null, motivo_contato || null, sugestao || null,
            rating_geral || null, motivo_geral || null,
            rating_caixa || null, motivo_caixa || null,
            rating_entrega || null, motivo_entrega || null,
            suporte_rating_clareza || null, suporte_motivo_clareza || null,
            suporte_rating_resolucao || null, suporte_motivo_resolucao || null,
            suporte_rating_tempo_resolucao || null, suporte_motivo_tempo_resolucao || null,
            null
        ];
        await pool.query(query, values);
        res.status(201).json({ message: 'Resposta salva com sucesso!' });
    } catch (error) {
        console.error('❌ Erro ao salvar resposta:', error);
        res.status(500).json({ error: 'Ocorreu um erro interno ao salvar a resposta.' });
    }
});


app.post('/api/chat-ia', async (req, res) => {
    const { pergunta } = req.body;
    if (!pergunta) return res.status(400).json({ error: 'A pergunta é obrigatória.' });

    console.log(`🤖 Analisando pergunta: ${pergunta}`);


    const saudacoes = ['oi', 'ola', 'olá', 'hello', 'hi', 'tudo bem', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'e aí'];
    const msgLower = pergunta.toLowerCase().trim().replace(/[!?.]/g, '');
    if (saudacoes.includes(msgLower) || saudacoes.some(s => msgLower.startsWith(s + ' '))) {
        return res.json({ resposta: "Olá! Sou o Maquibot, assistente de análise da Maquisul. 😊\n\nComo posso ajudar? Pergunte sobre feedbacks, médias, tendências ou qualquer análise da pesquisa de satisfação." });
    }


    let dadosContexto = '[]';
    let totalRegistros = 0;
    try {
        const resultado = await pool.query('SELECT * FROM respostas ORDER BY data_criacao DESC LIMIT 500');
        totalRegistros = resultado.rows.length;
        dadosContexto = JSON.stringify(resultado.rows, null, 2);
    } catch (err) {
        console.warn('⚠️ Não foi possível buscar dados do banco:', err.message);
    }

    const prompt = `
${SYSTEM_PROMPT}

## Contexto dos Dados
Total de registros disponíveis: ${totalRegistros}
Data do registro mais recente: ${totalRegistros > 0 ? JSON.parse(dadosContexto)[0]?.data_criacao : 'N/A'}
Data do registro mais antigo: ${totalRegistros > 0 ? JSON.parse(dadosContexto)[totalRegistros - 1]?.data_criacao : 'N/A'}

## Dados da Pesquisa
\`\`\`json
${dadosContexto}
\`\`\`

## Pergunta do Gestor
"${pergunta}"

Responda de forma direta e organizada. Use tabelas quando listar dados. Calcule estatísticas quando solicitado.
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        res.json({ resposta: text });
    } catch (err) {
        console.error('❌ Erro na IA:', err.message);
        if (err.message.includes('429')) {
            return res.status(429).json({ error: 'Limite de requisições atingido. Aguarde e tente novamente.' });
        }
        res.status(500).json({ error: 'Erro ao processar com a IA.', details: err.message });
    }
});


app.listen(PORT, async () => {
    console.log(`🚀 Servidor Maquisul rodando na porta ${PORT}`);
    try {
        await model.generateContent('Oi');
        console.log('✅ Conexão com Gemini OK!');
    } catch (err) {
        console.warn('⚠️ Não foi possível conectar ao Gemini:', err.message);
    }
});