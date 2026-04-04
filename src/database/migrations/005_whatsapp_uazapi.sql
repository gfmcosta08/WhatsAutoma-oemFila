-- UazAPI (uazapi.com / painel): envio via POST /send/text com query token + admintoken
ALTER TABLE whatsapp_integracao
  ADD COLUMN IF NOT EXISTS uazapi_base_url VARCHAR(512),
  ADD COLUMN IF NOT EXISTS uazapi_instance_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS uazapi_admin_token_enc TEXT,
  ADD COLUMN IF NOT EXISTS uazapi_instance_phone VARCHAR(32);
