CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telefone VARCHAR(20) NOT NULL UNIQUE,
    nome VARCHAR(100),
    email VARCHAR(100),
    whatsapp_name VARCHAR(100),
    idioma VARCHAR(5) DEFAULT 'pt-br',
    primeiro_contato TIMESTAMP,
    ultima_interacao TIMESTAMP,
    total_mensagens INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'ativo',
    canal_preferencial VARCHAR(20),
    notificacoes BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_clientes_telefone ON clientes(telefone);

CREATE TABLE IF NOT EXISTS sessoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    estado_atual VARCHAR(50) NOT NULL,
    dados_temporarios JSONB DEFAULT '{}',
    ultima_mensagem_id VARCHAR(100),
    ultimo_menu_enviado TEXT,
    tentativas_erro INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessoes_cliente_id ON sessoes(cliente_id);

CREATE TABLE IF NOT EXISTS agendamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    horario TIMESTAMP NOT NULL,
    servico VARCHAR(200),
    descricao TEXT,
    valor DECIMAL(10,2),
    status VARCHAR(20) NOT NULL,
    status_anterior VARCHAR(20),
    cancelado_em TIMESTAMP,
    motivo_cancelamento TEXT,
    cancelado_por VARCHAR(50),
    reagendado_para_id UUID REFERENCES agendamentos(id),
    reagendado_de_id UUID REFERENCES agendamentos(id),
    confirmado_em TIMESTAMP,
    confirmado_por VARCHAR(50),
    observacoes TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agendamentos_cliente_id ON agendamentos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_horario ON agendamentos(horario);
CREATE INDEX IF NOT EXISTS idx_agendamentos_status ON agendamentos(status);

CREATE TABLE IF NOT EXISTS mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    direcao VARCHAR(10) NOT NULL,
    texto TEXT,
    tipo VARCHAR(20) DEFAULT 'texto',
    whatsapp_message_id VARCHAR(100),
    whatsapp_timestamp TIMESTAMP,
    status_entrega VARCHAR(20),
    erro_mensagem TEXT,
    estado_na_momento VARCHAR(50),
    tempo_resposta_ms INTEGER,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensagens_cliente_id ON mensagens(cliente_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_created_at ON mensagens(created_at);

CREATE TABLE IF NOT EXISTS historico_estados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    sessao_id UUID REFERENCES sessoes(id) ON DELETE SET NULL,
    estado_anterior VARCHAR(50),
    estado_novo VARCHAR(50) NOT NULL,
    mensagem_trigger TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lembretes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
    agendamento_id UUID NOT NULL REFERENCES agendamentos(id) ON DELETE CASCADE,
    tipo VARCHAR(30) NOT NULL,
    disparo_em TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pendente',
    mensagem_enviada TEXT,
    tentativas INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    enviado_em TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lembretes_disparo ON lembretes(disparo_em, status);

CREATE TABLE IF NOT EXISTS configuracoes (
    chave VARCHAR(100) PRIMARY KEY,
    valor TEXT,
    tipo VARCHAR(20),
    descricao TEXT,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS logs_sistema (
    id BIGSERIAL PRIMARY KEY,
    nivel VARCHAR(20) NOT NULL,
    modulo VARCHAR(50),
    mensagem TEXT,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fila_retry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cliente_id UUID REFERENCES clientes(id) ON DELETE CASCADE,
    tipo VARCHAR(30),
    payload JSONB,
    tentativas INTEGER DEFAULT 0,
    proxima_tentativa TIMESTAMP,
    erro_ultimo TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);
