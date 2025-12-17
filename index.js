require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

app.use(cors({
  origin: '*', 
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
  ssl: {
    rejectUnauthorized: false
  }
});

pool.connect()
  .then(() => console.log('✅ Conectado ao PostgreSQL da Locaweb'))
  .catch(err => console.error('❌ Erro de conexão:', err));

app.post('/api/respostas', async (req, res) => {
  const {
    motivo_contato,
    rating_geral,
    motivo_geral,
    rating_caixa,
    motivo_caixa,
    rating_entrega,
    motivo_entrega,
    suporte_rating_clareza,
    suporte_motivo_clareza,
    suporte_rating_resolucao,
    suporte_motivo_resolucao,
    suporte_rating_tempo_resolucao,
    suporte_motivo_tempo_resolucao,
    sugestao,
    nome,
    email,
    telefone,
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
        suporte_tempo_espera -- Coluna que estava faltando, mesmo que seja nula
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    `;

    const values = [
      nome || null, email || null, telefone || null, motivo_contato || null, sugestao || null,
      rating_geral || null,
      motivo_geral || null,
      rating_caixa || null,
      motivo_caixa || null,
      rating_entrega || null,
      motivo_entrega || null,
      suporte_rating_clareza || null,
      suporte_motivo_clareza || null,
      suporte_rating_resolucao || null,
      suporte_motivo_resolucao || null,
      suporte_rating_tempo_resolucao || null,
      suporte_motivo_tempo_resolucao || null,
      null 
    ];
    
    await pool.query(query, values);
    res.status(201).send({ message: 'Resposta salva com sucesso!' });

  } catch (error) {
    console.error('Erro ao salvar resposta no banco de dados:', error);
    res.status(500).send({ error: 'Ocorreu um erro interno ao salvar a resposta.' });
  }
});

app.get('/api/respostas', async (req, res) => {
  const { motivo_contato, data_inicio, data_fim, atendimento } = req.query;
  const COLUNA_DATA_DO_BD = 'data_criacao';
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
    query += ` AND ${COLUNA_DATA_DO_BD} >= $${params.length}::timestamp`;
  }
  if (data_fim) {
    params.push(`${data_fim} 23:59:59`);
    query += ` AND ${COLUNA_DATA_DO_BD} <= $${params.length}::timestamp`;
  }
  query += ` ORDER BY ${COLUNA_DATA_DO_BD} DESC`;

  try {
    const resultado = await pool.query(query, params);
    res.json(resultado.rows);
  } catch (erro) {
    console.error('Erro ao buscar respostas:', erro);
    res.status(500).send({ error: 'Erro ao buscar as respostas.' });
  }
});


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
