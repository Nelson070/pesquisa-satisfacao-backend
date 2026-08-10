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

<<<<<<< HEAD
// =========================================================
// AUTENTICAÇÃO
// =========================================================

// Limita tentativas de login: máximo 10 por IP a cada 15 minutos
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Middleware que valida o token JWT em rotas protegidas
function autenticar(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // formato: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Token não fornecido.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
        if (err) {
            return res.status(403).json({ error: 'Token inválido ou expirado.' });
        }
        req.usuario = payload;
        next();
    });
}

// Rota de login — a única forma de conseguir um token
app.post('/api/login', loginLimiter, async (req, res) => {
    const { usuario, senha } = req.body;

    if (!usuario || !senha) {
        return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
    }

    if (usuario !== process.env.ADMIN_USER) {
        return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
    }

    try {
        const senhaValida = await bcrypt.compare(senha, process.env.ADMIN_PASS_HASH);
        if (!senhaValida) {
            return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
        }

        const token = jwt.sign(
            { usuario },
            process.env.JWT_SECRET,
            { expiresIn: '8h' } // token expira em 8h, precisa logar de novo depois
        );

        res.json({ token });
    } catch (err) {
        console.error('❌ Erro no login:', err);
        res.status(500).json({ error: 'Erro interno ao processar login.' });
    }
});


const SYSTEM_PROMPT = `
Você é a IA oficial da Maquisul, chamada de "Maquibot".

## Sobre a Maquisul
A Maquisul é uma empresa especializada na venda de Equipamentos, EPIs (Equipamentos de Proteção Individual), EPCs (Equipamentos de Proteção Coletiva) e Serviços Especializados.
Atende tanto pessoas físicas (compra_pf) quanto pessoas jurídicas (compra_pj), além de oferecer suporte técnico e pós-venda.

## Sobre a Pesquisa de Satisfação
A pesquisa avalia a experiência completa do cliente em 4 pilares, todos com notas de 1 a 5:
- **atendimento**: Qualidade do atendimento da equipe de vendas/suporte
- **atendimento_caixa**: Agilidade e cordialidade no caixa/financeiro
- **entrega**: Prazo, condição e logística da entrega dos produtos
- (comentários e sugestões livres também são coletados)

## Motivos de Contato
- **compra_pf**: Cliente pessoa física comprando produtos/EPIs
- **compra_pj**: Empresa comprando equipamentos ou EPIs em volume
- **suporte**: Dúvidas técnicas, assistência ou pós-venda

## Escala de Avaliação
- 5: Excelente
- 4: Bom
- 3: Regular
- 2: Ruim
- 1: Péssimo
- Avaliações iguais ou abaixo de 3 são consideradas **críticas** e merecem atenção imediata.

## Suas Responsabilidades
1. Analisar os dados de feedback fornecidos e responder perguntas sobre eles
2. Calcular médias, identificar pontos críticos e destacar tendências
3. Sugerir melhorias com base nos comentários dos clientes
4. Responder dúvidas gerais sobre a Maquisul, seus produtos e serviços
5. Ser proativa em apontar alertas quando houver muitas avaliações negativas

## Tom e Comportamento
- Seja amigável, profissional e objetivo
- Use linguagem clara, sem termos técnicos desnecessários
- Sempre responda em Português (pt-BR)
- Se não souber algo específico da empresa, diga que não tem essa informação no momento
- Nunca invente dados que não estejam nos feedbacks fornecidos
- IMPORTANTE: Responda APENAS o que foi perguntado. Não faça resumos automáticos,
  não antecipe insights e não apresente visões gerais a menos que o gestor peça explicitamente.
- Se a mensagem for apenas uma saudação, responda brevemente se apresentando sem mostrar dados.
`;

// 1. Buscar respostas (Dashboard) — PROTEGIDA
app.get('/api/respostas', autenticar, async (req, res) => {
    console.log("📊 Dashboard solicitando dados...");

    const { motivo_contato, data_inicio, data_fim, atendimento } = req.query;
    const COLUNA_DATA = 'data_criacao';
    let query = 'SELECT * FROM respostas WHERE 1=1';
    const params = [];

    if (motivo_contato) {
        params.push(motivo_contato);
        query += ` AND motivo_contato = $${params.length}`;
    }
    if (atendimento) {
        params.push(parseInt(atendimento));
        query += ` AND atendimento = $${params.length}`;
    }
    if (data_inicio) {
        params.push(`${data_inicio} 00:00:00`);
        query += ` AND ${COLUNA_DATA} >= $${params.length}::timestamp`;
    }
    if (data_fim) {
        params.push(`${data_fim} 23:59:59`);
        query += ` AND ${COLUNA_DATA} <= $${params.length}::timestamp`;
    }
    query += ` ORDER BY ${COLUNA_DATA} DESC`;

    try {
        const resultado = await pool.query(query, params);
        res.json(resultado.rows);
    } catch (erro) {
        console.error('❌ Erro ao buscar respostas:', erro);
        res.status(500).json({ error: 'Erro ao buscar as respostas.' });
    }
});

// 2. Salvar nova resposta — PÚBLICA (é o cliente respondendo a pesquisa, sem login)
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

// 3. Chat com IA — PROTEGIDA
app.post('/api/chat-ia', autenticar, async (req, res) => {
    const { pergunta } = req.body;

    if (!pergunta) {
        return res.status(400).json({ error: 'A pergunta é obrigatória.' });
    }

    console.log(`🤖 Analisando pergunta: ${pergunta}`);

    const saudacoes = ['oi', 'ola', 'olá', 'hello', 'hi', 'tudo bem', 'bom dia', 'boa tarde', 'boa noite', 'e ai', 'e aí'];
    const msgLower = pergunta.toLowerCase().trim().replace(/[!?.]/g, '');
    if (saudacoes.includes(msgLower) || saudacoes.some(s => msgLower.startsWith(s + ' '))) {
        return res.json({ resposta: "Olá! Sou o Maquibot, assistente da Maquisul. 😊\n\nComo posso ajudar? Pergunte sobre feedbacks, médias de avaliação, pontos críticos ou qualquer dúvida sobre a pesquisa de satisfação." });
    }

    let dadosContexto = '[]';
    try {
        const resultado = await pool.query('SELECT * FROM respostas ORDER BY data_criacao DESC LIMIT 100');
        dadosContexto = JSON.stringify(resultado.rows, null, 2);
    } catch (err) {
        console.warn('⚠️ Não foi possível buscar dados do banco para contexto:', err.message);
    }

    const prompt = `
${SYSTEM_PROMPT}

## Dados Atuais da Pesquisa (use APENAS se a pergunta exigir)
\`\`\`json
${dadosContexto}
\`\`\`

## Regras OBRIGATÓRIAS para esta resposta:
1. Responda EXCLUSIVAMENTE o que foi perguntado abaixo. NADA MAIS.
2. Se for saudação: responda APENAS com uma saudação curta. PROIBIDO citar dados.
3. NUNCA liste pontos de atenção ou insights sem ser solicitado.
4. Seja direto e conciso.

## Pergunta do Gestor
"${pergunta}"
    `;

    try {
        const result = await model.generateContent(prompt);
        const text = result.response.text();
        res.json({ resposta: text });

    } catch (err) {
        console.error('❌ Erro na IA:', err.message);

        if (err.message.includes('429')) {
            return res.status(429).json({
                error: 'Limite de requisições da IA atingido. Aguarde e tente novamente.',
                details: err.message
            });
        }
        res.status(500).json({ error: 'Erro ao processar com a IA.', details: err.message });
    }
});

// --- INICIALIZAÇÃO ---
app.listen(PORT, async () => {
    console.log(`🚀 Servidor Maquisul rodando na porta ${PORT}`);

    if (!process.env.JWT_SECRET || !process.env.ADMIN_PASS_HASH) {
        console.warn('⚠️ ATENÇÃO: JWT_SECRET ou ADMIN_PASS_HASH não configurados no .env — o login não vai funcionar.');
    }

    try {
        await model.generateContent('Oi');
        console.log('✅ Conexão com Gemini OK!');
    } catch (err) {
        console.warn('⚠️ Não foi possível conectar ao Gemini:', err.message);
=======
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
>>>>>>> 2a0a84b9964223f82b4a8336f5ecf7deb64d9c00
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