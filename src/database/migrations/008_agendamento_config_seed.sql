-- Uma linha de agendamento_config por deploy (empresa_id=1), para o painel não receber null antes do primeiro save.

INSERT INTO agendamento_config (
  empresa_id,
  jid_operador,
  horarios_disponiveis,
  mensagem_boas_vindas,
  aprovacao_automatica,
  vagas_por_slot,
  horarios_bloqueados
)
SELECT
  1,
  NULL,
  '[]'::jsonb,
  '',
  FALSE,
  1,
  '[]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM agendamento_config WHERE empresa_id = 1);
