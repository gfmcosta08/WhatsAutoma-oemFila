-- Lavajato PRD: veículos, fila, reserva web, pagamentos, config de agenda

CREATE TABLE IF NOT EXISTS veiculos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    placa VARCHAR(12) NOT NULL,
    modelo VARCHAR(120) NOT NULL,
    cor VARCHAR(60) DEFAULT '',
    ano SMALLINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(cliente_id, placa)
);

CREATE INDEX IF NOT EXISTS idx_veiculos_cliente ON veiculos(cliente_id);

ALTER TABLE agendamento_config ADD COLUMN IF NOT EXISTS aprovacao_automatica BOOLEAN DEFAULT FALSE;
ALTER TABLE agendamento_config ADD COLUMN IF NOT EXISTS vagas_por_slot INTEGER DEFAULT 1;
ALTER TABLE agendamento_config ADD COLUMN IF NOT EXISTS horarios_bloqueados JSONB DEFAULT '[]'::jsonb;

UPDATE agendamento_config SET vagas_por_slot = 1 WHERE vagas_por_slot IS NULL;

ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS veiculo_id UUID REFERENCES veiculos(id) ON DELETE SET NULL;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS servico_catalogo_id INTEGER REFERENCES agendamento_servicos(id) ON DELETE SET NULL;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS origem VARCHAR(20) DEFAULT 'whatsapp';
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS status_fila VARCHAR(30);
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS entrada_fila_em TIMESTAMPTZ;
ALTER TABLE agendamentos ADD COLUMN IF NOT EXISTS token_acompanhamento UUID DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_agendamentos_token_acomp ON agendamentos(token_acompanhamento);

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS preferencias_notas TEXT;

CREATE TABLE IF NOT EXISTS pagamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agendamento_id UUID NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    metodo VARCHAR(20) NOT NULL CHECK (metodo IN ('dinheiro', 'pix', 'cartao')),
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pagamentos_agendamento ON pagamentos(agendamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_created ON pagamentos(created_at);

UPDATE empresas SET nome = 'Lavajato' WHERE id = 1 AND (nome IS NULL OR nome = 'Oficina');

UPDATE agendamentos SET origem = 'whatsapp' WHERE origem IS NULL;
