Backend para Pesquisa de Satisfação

Como rodar:
1. Instale os pacotes: npm install
2. Configure o arquivo .env com sua senha do PostgreSQL
3. Rode com: npm start

Certifique-se de ter a tabela 'respostas' no banco 'pesquisa-satis':
CREATE TABLE respostas (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100),
  atendimento INT,
  qualidade INT,
  comentarios TEXT,
  criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
