-- SaaS agendamento: empresa única (id=1) + config, pendentes, serviços

CREATE TABLE IF NOT EXISTS empresas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(200) NOT NULL DEFAULT 'Oficina',
    created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO empresas (id, nome) VALUES (1, 'Oficina') ON CONFLICT (id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('empresas', 'id'), (SELECT COALESCE(MAX(id), 1) FROM empresas));

CREATE TABLE IF NOT EXISTS agendamento_config (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL UNIQUE REFERENCES empresas(id) ON DELETE CASCADE,
    jid_operador VARCHAR(255),
    horarios_disponiveis JSONB NOT NULL DEFAULT '[]',
    mensagem_boas_vindas TEXT DEFAULT '',
    phone_number_id INTEGER,
    phone_number_numero VARCHAR(30),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS solicitacoes_pendentes (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    cliente_nome VARCHAR(200) NOT NULL,
    cliente_jid VARCHAR(255) NOT NULL,
    horario_escolhido VARCHAR(100) NOT NULL,
    descricao TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitacoes_empresa ON solicitacoes_pendentes(empresa_id);

CREATE TABLE IF NOT EXISTS agendamento_servicos (
    id SERIAL PRIMARY KEY,
    empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) NOT NULL,
    preco_centavos INTEGER NOT NULL CHECK (preco_centavos > 0),
    descricao TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamento_servicos_empresa ON agendamento_servicos(empresa_id);

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS duracao VARCHAR(20) DEFAULT '1h';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS descricao_problema TEXT;

UPDATE agendamentos SET descricao_problema = descricao WHERE descricao_problema IS NULL AND descricao IS NOT NULL;
