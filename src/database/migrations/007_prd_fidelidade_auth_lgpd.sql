-- PRD: fidelidade, usuários do painel (e-mail/2FA), despesas, LGPD

CREATE TABLE IF NOT EXISTS fidelidade_config (
    empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
    ativo BOOLEAN DEFAULT FALSE,
    centavos_por_ponto INTEGER NOT NULL DEFAULT 100 CHECK (centavos_por_ponto > 0),
    pontos_resgate_minimo INTEGER NOT NULL DEFAULT 100 CHECK (pontos_resgate_minimo > 0),
    desconto_resgate_centavos INTEGER NOT NULL DEFAULT 1000 CHECK (desconto_resgate_centavos > 0),
    notificar_marco_pontos INTEGER NOT NULL DEFAULT 100 CHECK (notificar_marco_pontos > 0),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO fidelidade_config (empresa_id, ativo) VALUES (1, FALSE)
ON CONFLICT (empresa_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS pontos_movimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    delta INTEGER NOT NULL,
    motivo VARCHAR(120) NOT NULL,
    agendamento_id UUID REFERENCES agendamentos(id) ON DELETE SET NULL,
    pagamento_id UUID REFERENCES pagamentos(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pontos_movimentos_cliente ON pontos_movimentos(cliente_id);

CREATE TABLE IF NOT EXISTS painel_usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash BYTEA NOT NULL,
    password_salt BYTEA NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('gestor', 'funcionario')),
    totp_secret TEXT,
    totp_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS despesas_operacionais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    descricao TEXT NOT NULL,
    categoria VARCHAR(100) DEFAULT '',
    valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_despesas_operacionais_created ON despesas_operacionais(created_at);

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS lgpd_consentimento_em TIMESTAMPTZ;
