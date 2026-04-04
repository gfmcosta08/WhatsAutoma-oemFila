-- Migração 003: webhook único por empresa + campos adicionais

ALTER TABLE empresas ADD COLUMN IF NOT EXISTS webhook_token VARCHAR(64);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS email VARCHAR(200);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS cnpj VARCHAR(20);
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ativo';
ALTER TABLE empresas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Gera token para empresas existentes que ainda não têm (idempotente)
UPDATE empresas
SET webhook_token = encode(gen_random_bytes(32), 'hex')
WHERE webhook_token IS NULL;

-- Garante unicidade e obrigatoriedade após o backfill
ALTER TABLE empresas ALTER COLUMN webhook_token SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'empresas_webhook_token_key' AND conrelid = 'empresas'::regclass
  ) THEN
    ALTER TABLE empresas ADD CONSTRAINT empresas_webhook_token_key UNIQUE (webhook_token);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_empresas_webhook_token ON empresas(webhook_token);
CREATE INDEX IF NOT EXISTS idx_empresas_status ON empresas(status);
