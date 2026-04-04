-- Credenciais WhatsApp Cloud API por empresa (single-tenant: tipicamente empresa_id = 1)
-- Tokens sensíveis ficam em access_token_enc / app_secret_enc (cifrados com SETTINGS_ENCRYPTION_KEY)

CREATE TABLE IF NOT EXISTS whatsapp_integracao (
  empresa_id INTEGER PRIMARY KEY REFERENCES empresas(id) ON DELETE CASCADE,
  access_token_enc TEXT,
  phone_number_id VARCHAR(64),
  verify_token VARCHAR(512),
  app_secret_enc TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO whatsapp_integracao (empresa_id)
SELECT e.id FROM empresas e
WHERE NOT EXISTS (SELECT 1 FROM whatsapp_integracao w WHERE w.empresa_id = e.id);

-- Phone Number ID da Meta costuma ser string; alinha com whatsapp_integracao
ALTER TABLE agendamento_config
  ALTER COLUMN phone_number_id TYPE VARCHAR(64) USING
    CASE WHEN phone_number_id IS NULL THEN NULL ELSE phone_number_id::text END;
